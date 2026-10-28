import type { Response } from "express";
import { ZipArchive } from "archiver";
import type { Storage } from "./storage.js";
import type { PhotoRow } from "./photos.js";

/** Streams a stored image to the client. */
export function sendStored(
  res: Response,
  storage: Storage,
  key: string,
  mime: string,
  cache: string,
  filename?: string
) {
  res.set("Content-Type", mime);
  res.set("Cache-Control", cache);
  res.set("X-Content-Type-Options", "nosniff");
  if (filename) res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  const stream = storage.open(key);
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: "File not found" });
    else res.destroy();
  });
  stream.pipe(res);
}

/** Streams a ZIP of the given photos (original files) to the client. */
export function sendZip(res: Response, storage: Storage, title: string, photos: PhotoRow[], cache = "no-store") {
  const safeTitle = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "album";
  res.set("Content-Type", "application/zip");
  res.set("Cache-Control", cache);
  res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.zip`);
  const zip = new ZipArchive({ zlib: { level: 1 } }); // photos are already compressed
  zip.on("error", () => res.destroy());
  zip.pipe(res);
  const used = new Set<string>();
  for (const p of photos) {
    // Two photos can share a file name; add the id to keep zip entries unique.
    let name = p.filename;
    if (used.has(name)) name = `${p.id}-${name}`;
    used.add(name);
    zip.append(storage.open(p.original_key), { name });
  }
  void zip.finalize();
}
