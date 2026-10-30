import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../types.js";
import { HttpError, idParam, notFound, parse } from "../errors.js";
import { processImage, UnsupportedImageError } from "../images.js";
import { attachTags, listPhotos, privateUrls, serializePhoto, type PhotoRow } from "../photos.js";
import { MAX_TAGS_PER_PHOTO, normalizeTags, parseTagList, setPhotoTags } from "../tags.js";
import { sendStored } from "../http.js";

const listQuery = z.object({
  sort: z.enum(["date_desc", "date_asc"], { error: "sort must be date_desc or date_asc" }).default("date_desc"),
  q: z.string().max(100, "Search is too long").optional(),
  favorites: z.enum(["1", "0"], { error: "favorites must be 1 or 0" }).optional(),
});
const favoriteBody = z.object({ favorite: z.boolean({ error: "favorite must be true or false" }) });
const photoIds = z
  .array(z.number({ error: "photoIds must be numbers" }).int().positive(), { error: "photoIds must be a list" })
  .min(1, "Choose at least one photo")
  .max(200, "At most 200 photos at once");
const bulkFavoriteBody = z.object({ photoIds, favorite: z.boolean({ error: "favorite must be true or false" }) });
const bulkTagsBody = z.object({ photoIds, add: z.unknown().optional(), remove: z.unknown().optional() });

import os from "node:os";

export function photosRouter(ctx: AppContext) {
  const { db, storage, config } = ctx;
  const r = Router();

  const tmpUploadDir = path.join(os.tmpdir(), "photo-albums-uploads");
  if (!existsSync(tmpUploadDir)) {
    mkdirSync(tmpUploadDir, { recursive: true });
  }

  // Stream uploads to OS temp directory instead of memory buffering
  const upload = multer({
    dest: tmpUploadDir,
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: config.maxFilesPerUpload },
  });

  const getOwned = (id: number, ownerId: number) => {
    const row = db.prepare("SELECT * FROM photos WHERE id = ? AND owner_id = ?").get(id, ownerId) as PhotoRow | undefined;
    if (!row) throw notFound("Photo not found");
    return row;
  };

  /** Checks that every id belongs to this user (otherwise 404, so ids can't be probed). */
  const ownedIds = (ids: number[], ownerId: number) => {
    const unique = [...new Set(ids)];
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE owner_id = ? AND id IN (${unique.map(() => "?").join(",")})`).get(ownerId, ...unique) as { n: number }).n;
    if (n !== unique.length) throw notFound("One or more photos were not found");
    return unique;
  };

  // GET /api/photos?tags=beach,sunset&sort=date_asc&q=name&favorites=1
  r.get("/", (req, res) => {
    const { sort, q, favorites } = parse(listQuery, req.query);
    const tags = parseTagList(req.query.tags);
    const photos = listPhotos(db, { ownerId: req.userId!, tags, order: sort, search: q, favoritesOnly: favorites === "1" });
    res.json({ photos: photos.map((p) => serializePhoto(p, privateUrls)) });
  });

  // POST /api/photos  (multipart: photos[], optional tags="a,b", optional albumId)
  r.post("/", upload.array("photos"), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, "Choose at least one photo to upload", "photos");

    const body = req.body ?? {};
    const tags = parseTagList(body.tags);
    let albumId: number | undefined;
    if (body.albumId) {
      albumId = idParam(body.albumId, "albumId");
      const album = db.prepare("SELECT 1 FROM albums WHERE id = ? AND owner_id = ?").get(albumId, req.userId);
      if (!album) throw notFound("Album not found");
    }

    const saved: (PhotoRow & { tags: string[] })[] = [];
    const errors: { filename: string; message: string }[] = [];

    for (const file of files) {
      const filename = path.basename(file.originalname).slice(0, 255) || "photo";
      const fileBuffer = file.buffer ?? (file.path ? await fs.readFile(file.path) : Buffer.alloc(0));
      let img;
      try {
        img = await processImage(fileBuffer); // validates, makes the thumbnail, reads EXIF
      } catch (e) {
        if (file.path) await fs.unlink(file.path).catch(() => {});
        if (e instanceof UnsupportedImageError) {
          errors.push({ filename, message: e.message });
          continue;
        }
        throw e;
      }

      const base = randomUUID();
      const originalKey = `${base}.${img.ext}`;
      const thumbKey = `${base}_thumb.webp`;
      await storage.save(originalKey, fileBuffer);
      await storage.save(thumbKey, img.thumb);
      if (file.path) await fs.unlink(file.path).catch(() => {});

      try {
        const now = new Date().toISOString();
        const insert = db.transaction(() => {
          const info = db
            .prepare(
              `INSERT INTO photos (owner_id, filename, original_key, thumb_key, mime, size, width, height, taken_at, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(req.userId, filename, originalKey, thumbKey, img.mime, file.size, img.width, img.height, img.takenAt, now);
          const id = Number(info.lastInsertRowid);
          setPhotoTags(db, req.userId!, id, tags);
          if (albumId) {
            db.prepare("INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?, ?, ?)").run(albumId, id, now);
          }
          return id;
        });
        const id = insert();
        const row = db.prepare("SELECT * FROM photos WHERE id = ?").get(id) as PhotoRow;
        saved.push(...attachTags(db, [row]));
      } catch (e) {
        // Don't leave orphaned files behind if the database write failed.
        await storage.remove(originalKey);
        await storage.remove(thumbKey);
        throw e;
      }
    }

    if (saved.length === 0) {
      throw new HttpError(400, errors[0]?.message ?? "Upload failed", "photos");
    }
    res.status(201).json({ photos: saved.map((p) => serializePhoto(p, privateUrls)), errors });
  });

  // POST /api/photos/bulk-favorite  { photoIds, favorite }
  r.post("/bulk-favorite", (req, res) => {
    const body = parse(bulkFavoriteBody, req.body);
    const ids = ownedIds(body.photoIds, req.userId!);
    db.transaction(() => {
      const stmt = db.prepare("UPDATE photos SET favorite = ? WHERE id = ?");
      ids.forEach((id) => stmt.run(body.favorite ? 1 : 0, id));
    })();
    res.json({ updated: ids.length });
  });

  // POST /api/photos/bulk-tags  { photoIds, add: ["a"], remove: ["b"] }
  r.post("/bulk-tags", (req, res) => {
    const body = parse(bulkTagsBody, req.body);
    const add = body.add === undefined ? [] : normalizeTags(body.add, "add");
    const remove = new Set(body.remove === undefined ? [] : normalizeTags(body.remove, "remove"));
    if (add.length === 0 && remove.size === 0) throw new HttpError(400, "Choose tags to add or remove", "add");
    const ids = ownedIds(body.photoIds, req.userId!);
    db.transaction(() => {
      const current = attachTags(db, db.prepare(`SELECT * FROM photos WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as PhotoRow[]);
      for (const p of current) {
        const next = [...new Set([...p.tags.filter((t) => !remove.has(t)), ...add])];
        if (next.length > MAX_TAGS_PER_PHOTO) {
          throw new HttpError(400, `"${p.filename}" would have more than ${MAX_TAGS_PER_PHOTO} tags`, "add");
        }
        setPhotoTags(db, req.userId!, p.id, next);
      }
    })();
    res.json({ updated: ids.length });
  });

  // Thumbnails and originals are served by the API (never as public static files).
  r.get("/:id/thumb", (req, res) => {
    const p = getOwned(idParam(req.params.id), req.userId!);
    sendStored(res, storage, p.thumb_key, "image/webp", "private, max-age=3600");
  });

  r.get("/:id/file", (req, res) => {
    const p = getOwned(idParam(req.params.id), req.userId!);
    sendStored(res, storage, p.original_key, p.mime, "private, max-age=3600", p.filename);
  });

  r.patch("/:id", (req, res) => {
    const p = getOwned(idParam(req.params.id), req.userId!);
    const { favorite } = parse(favoriteBody, req.body);
    db.prepare("UPDATE photos SET favorite = ? WHERE id = ?").run(favorite ? 1 : 0, p.id);
    const [row] = attachTags(db, [getOwned(p.id, req.userId!)]);
    res.json({ photo: serializePhoto(row, privateUrls) });
  });

  r.put("/:id/tags", (req, res) => {
    const p = getOwned(idParam(req.params.id), req.userId!);
    const tags = normalizeTags(req.body?.tags);
    db.transaction(() => setPhotoTags(db, req.userId!, p.id, tags))();
    const [row] = attachTags(db, [p]);
    res.json({ photo: serializePhoto(row, privateUrls) });
  });

  r.delete("/:id", async (req, res) => {
    const p = getOwned(idParam(req.params.id), req.userId!);
    db.transaction(() => {
      db.prepare("DELETE FROM photos WHERE id = ?").run(p.id); // cascades to album_photos / photo_tags, clears covers
      db.prepare("DELETE FROM tags WHERE owner_id = ? AND id NOT IN (SELECT tag_id FROM photo_tags)").run(req.userId);
    })();
    await storage.remove(p.original_key);
    await storage.remove(p.thumb_key);
    res.status(204).end();
  });

  return r;
}

/** GET /api/tags -> every tag the user has, with how many photos use it. */
export function tagsRouter(ctx: AppContext) {
  const r = Router();
  r.get("/", (req, res) => {
    const tags = ctx.db
      .prepare(
        `SELECT t.name, COUNT(pt.photo_id) AS count FROM tags t
         LEFT JOIN photo_tags pt ON pt.tag_id = t.id
         WHERE t.owner_id = ? GROUP BY t.id ORDER BY t.name`
      )
      .all(req.userId);
    res.json({ tags });
  });
  return r;
}

/** GET /api/stats -> numbers for the library header. */
export function statsRouter(ctx: AppContext) {
  const r = Router();
  r.get("/", (req, res) => {
    const photos = ctx.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes, COALESCE(SUM(favorite), 0) AS favorites FROM photos WHERE owner_id = ?").get(req.userId) as { n: number; bytes: number; favorites: number };
    const albums = ctx.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(share_enabled), 0) AS shared FROM albums WHERE owner_id = ?").get(req.userId) as { n: number; shared: number };
    res.json({ photos: photos.n, bytes: photos.bytes, favorites: photos.favorites, albums: albums.n, sharedAlbums: albums.shared });
  });
  return r;
}
