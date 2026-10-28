import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../types.js";
import { notFound, parse } from "../errors.js";
import { attachTags, orderBySql, publicUrls, serializePhoto, type PhotoRow } from "../photos.js";
import { sendStored, sendZip } from "../http.js";

const viewQuery = z.object({
  sort: z.enum(["date_desc", "date_asc"], { error: "sort must be date_desc or date_asc" }).default("date_desc"),
});

/**
 * Public, read-only access to a shared album.
 *
 * The key rule: EVERY request (the page data, each thumbnail, each full image,
 * the zip) looks the token up in the database and checks share_enabled. Nothing
 * is served from a public folder or cached. Turning sharing off deletes the
 * token, so the very next request fails with 404.
 */
export function publicRouter(ctx: AppContext) {
  const { db, storage } = ctx;
  const r = Router();

  r.use((_req, res, next) => {
    res.set("Cache-Control", "no-store"); // browsers/proxies must not keep a copy
    res.set("X-Robots-Tag", "noindex");
    next();
  });

  const sharedAlbum = (token: string) => {
    // Cheap shape check first; real tokens are 43 URL-safe characters.
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound("This link is not available");
    const album = db
      .prepare("SELECT id, owner_id, title FROM albums WHERE share_token = ? AND share_enabled = 1")
      .get(token) as { id: number; owner_id: number; title: string } | undefined;
    if (!album) throw notFound("This link is not available");
    return album;
  };

  // The photo must belong to THIS album, so a token can't be used to read other photos.
  const photoInAlbum = (albumId: number, photoId: number) => {
    const id = Number(photoId);
    const row = Number.isInteger(id)
      ? (db
          .prepare("SELECT p.* FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = ? AND p.id = ?")
          .get(albumId, id) as PhotoRow | undefined)
      : undefined;
    if (!row) throw notFound("Photo not found");
    return row;
  };

  r.get("/albums/:token", (req, res) => {
    const album = sharedAlbum(req.params.token);
    const { sort } = parse(viewQuery, req.query);
    const rows = db
      .prepare(`SELECT p.* FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = ? ${orderBySql(sort)}`)
      .all(album.id) as PhotoRow[];
    const urls = publicUrls(req.params.token);
    res.json({
      album: { title: album.title, photoCount: rows.length },
      // favourites are private to the owner, so they are removed from the public response
      photos: attachTags(db, rows).map((p) => ({ ...serializePhoto(p, urls), favorite: undefined })),
    });
  });

  r.get("/albums/:token/photos/:photoId/thumb", (req, res) => {
    const album = sharedAlbum(req.params.token);
    const p = photoInAlbum(album.id, Number(req.params.photoId));
    sendStored(res, storage, p.thumb_key, "image/webp", "no-store");
  });

  r.get("/albums/:token/photos/:photoId/file", (req, res) => {
    const album = sharedAlbum(req.params.token);
    const p = photoInAlbum(album.id, Number(req.params.photoId));
    sendStored(res, storage, p.original_key, p.mime, "no-store", p.filename);
  });

  r.get("/albums/:token/zip", (req, res) => {
    const album = sharedAlbum(req.params.token);
    const rows = db
      .prepare(`SELECT p.* FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = ? ${orderBySql("date_asc")}`)
      .all(album.id) as PhotoRow[];
    sendZip(res, storage, album.title, rows);
  });

  return r;
}
