import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../types.js";
import { HttpError, idParam, notFound, parse } from "../errors.js";
import { listPhotos, privateUrls, serializePhoto, SORT_DATE_SQL, type PhotoRow } from "../photos.js";
import { parseTagList } from "../tags.js";
import { sendZip } from "../http.js";

interface AlbumRow {
  id: number;
  owner_id: number;
  title: string;
  cover_photo_id: number | null;
  share_token: string | null;
  share_enabled: number;
  created_at: string;
  photo_count: number;
  effective_cover: number | null;
}

// "Effective" cover = the one the owner chose, otherwise the newest photo in the album.
const ALBUM_SELECT = `
  SELECT a.*,
    (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = a.id) AS photo_count,
    COALESCE(a.cover_photo_id, (
      SELECT ap.photo_id FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
      WHERE ap.album_id = a.id ORDER BY ${SORT_DATE_SQL} DESC, p.id DESC LIMIT 1
    )) AS effective_cover
  FROM albums a`;

function serializeAlbum(a: AlbumRow) {
  const shared = a.share_enabled === 1 && a.share_token;
  return {
    id: a.id,
    title: a.title,
    photoCount: a.photo_count,
    coverPhotoId: a.effective_cover,
    coverUrl: a.effective_cover ? privateUrls.thumb(a.effective_cover) : null,
    hasCustomCover: a.cover_photo_id !== null,
    shareEnabled: Boolean(shared),
    shareToken: shared ? a.share_token : null,
    createdAt: a.created_at,
  };
}

const titleSchema = z.string({ error: "Title is required" }).trim().min(1, "Title is required").max(100, "Title must be at most 100 characters");
const createBody = z.object({ title: titleSchema });
const patchBody = z
  .object({ title: titleSchema.optional(), coverPhotoId: z.number().int().positive().nullable().optional() })
  .refine((b) => b.title !== undefined || b.coverPhotoId !== undefined, { message: "Nothing to update" });
const photoIdsBody = z.object({
  photoIds: z.array(z.number({ error: "photoIds must be numbers" }).int().positive(), { error: "photoIds must be a list" })
    .min(1, "Choose at least one photo").max(200, "At most 200 photos at once"),
});
const viewQuery = z.object({
  sort: z.enum(["date_desc", "date_asc"], { error: "sort must be date_desc or date_asc" }).default("date_desc"),
});

export function albumsRouter(ctx: AppContext) {
  const { db, storage } = ctx;
  const r = Router();

  const getOwned = (id: number, ownerId: number): AlbumRow => {
    const row = db.prepare(`${ALBUM_SELECT} WHERE a.id = ? AND a.owner_id = ?`).get(id, ownerId) as AlbumRow | undefined;
    if (!row) throw notFound("Album not found");
    return row;
  };

  r.get("/", (req, res) => {
    const rows = db.prepare(`${ALBUM_SELECT} WHERE a.owner_id = ? ORDER BY a.created_at DESC, a.id DESC`).all(req.userId) as AlbumRow[];
    res.json({ albums: rows.map(serializeAlbum) });
  });

  r.post("/", (req, res) => {
    const { title } = parse(createBody, req.body);
    const info = db.prepare("INSERT INTO albums (owner_id, title, created_at) VALUES (?, ?, ?)").run(req.userId, title, new Date().toISOString());
    res.status(201).json({ album: serializeAlbum(getOwned(Number(info.lastInsertRowid), req.userId!)) });
  });

  // GET /api/albums/:id?tags=a,b&sort=date_asc  -> album + its photos (filterable, sortable)
  r.get("/:id", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    const { sort } = parse(viewQuery, req.query);
    const photos = listPhotos(db, { ownerId: req.userId!, albumId: album.id, tags: parseTagList(req.query.tags), order: sort });
    res.json({ album: serializeAlbum(album), photos: photos.map((p) => serializePhoto(p, privateUrls)) });
  });

  r.patch("/:id", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    const body = parse(patchBody, req.body);
    if (body.coverPhotoId) {
      const inAlbum = db.prepare("SELECT 1 FROM album_photos WHERE album_id = ? AND photo_id = ?").get(album.id, body.coverPhotoId);
      if (!inAlbum) throw new HttpError(400, "The cover must be a photo in this album", "coverPhotoId");
    }
    if (body.title !== undefined) db.prepare("UPDATE albums SET title = ? WHERE id = ?").run(body.title, album.id);
    if (body.coverPhotoId !== undefined) db.prepare("UPDATE albums SET cover_photo_id = ? WHERE id = ?").run(body.coverPhotoId, album.id);
    res.json({ album: serializeAlbum(getOwned(album.id, req.userId!)) });
  });

  r.delete("/:id", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    db.prepare("DELETE FROM albums WHERE id = ?").run(album.id); // photos themselves are kept
    res.status(204).end();
  });

  r.post("/:id/photos", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    const { photoIds } = parse(photoIdsBody, req.body);
    const unique = [...new Set(photoIds)];
    const owned = db
      .prepare(`SELECT COUNT(*) AS n FROM photos WHERE owner_id = ? AND id IN (${unique.map(() => "?").join(",")})`)
      .get(req.userId, ...unique) as { n: number };
    if (owned.n !== unique.length) throw notFound("One or more photos were not found");
    const now = new Date().toISOString();
    const insert = db.prepare("INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?, ?, ?)");
    db.transaction(() => unique.forEach((id) => insert.run(album.id, id, now)))();
    res.json({ album: serializeAlbum(getOwned(album.id, req.userId!)) });
  });

  r.delete("/:id/photos/:photoId", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    const photoId = idParam(req.params.photoId, "photoId");
    db.transaction(() => {
      db.prepare("DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?").run(album.id, photoId);
      // If we removed the chosen cover, go back to the automatic cover.
      db.prepare("UPDATE albums SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id = ?").run(album.id, photoId);
    })();
    res.json({ album: serializeAlbum(getOwned(album.id, req.userId!)) });
  });

  // Turn sharing on. Idempotent: if it's already on, the same link is returned.
  r.post("/:id/share", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    if (!(album.share_enabled && album.share_token)) {
      // 32 random bytes = 256 bits: impossible to guess. A fresh token is made every time sharing is switched on.
      const token = randomBytes(32).toString("base64url");
      db.prepare("UPDATE albums SET share_token = ?, share_enabled = 1 WHERE id = ?").run(token, album.id);
    }
    res.json({ album: serializeAlbum(getOwned(album.id, req.userId!)) });
  });

  // Turn sharing off. The token is deleted, so the old link can never work again.
  r.delete("/:id/share", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    db.prepare("UPDATE albums SET share_token = NULL, share_enabled = 0 WHERE id = ?").run(album.id);
    res.json({ album: serializeAlbum(getOwned(album.id, req.userId!)) });
  });

  r.get("/:id/zip", (req, res) => {
    const album = getOwned(idParam(req.params.id), req.userId!);
    const rows = db
      .prepare(`SELECT p.* FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = ? ORDER BY ${SORT_DATE_SQL}`)
      .all(album.id) as PhotoRow[];
    sendZip(res, storage, album.title, rows, "private, no-store");
  });

  return r;
}
