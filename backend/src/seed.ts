import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { LocalStorage } from "./storage.js";
import { injectExifDate, makeJpeg } from "./devImages.js";
import { processImage } from "./images.js";
import { setPhotoTags } from "./tags.js";

/**
 * Creates two demo users with photos, tags and albums so the app can be tried
 * straight away. Safe to run again: it replaces the demo users each time.
 * Photos come from backend/seed-photos.
 */
const config = loadConfig();
// The demo accounts have a well-known password, so never create them on a real deployment.
if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to seed demo accounts with NODE_ENV=production (their password is public). Use --force if you really mean it.");
  process.exit(1);
}
const db = openDb(config.dbPath);
db.exec("DELETE FROM auth_throttle; DELETE FROM sessions;"); // start from a clean slate (also clears any login lockouts)
const storage = new LocalStorage(config.uploadDir);

const DEMO = [
  { email: "demo@example.com", password: "password123" },
  { email: "guest@example.com", password: "password123" },
];

async function removeUser(email: string) {
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (!user) return;
  const photos = db.prepare("SELECT original_key, thumb_key FROM photos WHERE owner_id = ?").all(user.id) as { original_key: string; thumb_key: string }[];
  for (const p of photos) {
    await storage.remove(p.original_key);
    await storage.remove(p.thumb_key);
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id); // cascades to everything they own
}

async function addPhoto(ownerId: number, filename: string, tags: string[], data: Buffer) {
  const img = await processImage(data);
  const base = randomUUID();
  const originalKey = `${base}.${img.ext}`;
  const thumbKey = `${base}_thumb.webp`;
  await storage.save(originalKey, data);
  await storage.save(thumbKey, img.thumb);
  const info = db
    .prepare(
      `INSERT INTO photos (owner_id, filename, original_key, thumb_key, mime, size, width, height, taken_at, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ownerId, filename, originalKey, thumbKey, img.mime, data.length, img.width, img.height, img.takenAt, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  setPhotoTags(db, ownerId, id, tags);
  return id;
}

function addAlbum(ownerId: number, title: string, photoIds: number[], cover?: number, share = false) {
  const token = share ? randomBytes(32).toString("base64url") : null;
  const info = db
    .prepare("INSERT INTO albums (owner_id, title, cover_photo_id, share_token, share_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ownerId, title, cover ?? null, token, share ? 1 : 0, new Date().toISOString());
  const albumId = Number(info.lastInsertRowid);
  const link = db.prepare("INSERT INTO album_photos (album_id, photo_id, added_at) VALUES (?, ?, ?)");
  for (const id of photoIds) link.run(albumId, id, new Date().toISOString());
  return token;
}

for (const u of DEMO) await removeUser(u.email);

const ids: Record<string, number> = {};
for (const u of DEMO) {
  const info = db
    .prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)")
    .run(u.email, bcrypt.hashSync(u.password, config.bcryptRounds), new Date().toISOString());
  ids[u.email] = Number(info.lastInsertRowid);
}
const demo = ids["demo@example.com"];

// Real photos live in backend/seed-photos. They are stored without EXIF data,
// so the seed adds a "date taken" to most of them and leaves a few without one,
// which shows both the EXIF date and the upload-date fallback in the UI.
const PHOTO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../seed-photos");
const MY_PHOTOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../my-photos");

// [file, tags, EXIF date taken (omit = no EXIF), favourite]
const photos: [string, string[], string | undefined, boolean?][] = [
  ["misty-ridges.jpg", ["mountains", "mist"], "2023:09:12 06:40:00", true],
  ["desert-peak.jpg", ["mountains", "desert", "travel"], "2023:03:18 17:20:00"],
  ["night-sky-peaks.jpg", ["mountains", "night", "stars"], "2022:08:13 23:10:00", true],
  ["valley-fog.jpg", ["mountains", "mist"], "2022:10:02 08:05:00"],
  ["snowy-peaks-dusk.jpg", ["mountains", "winter"], undefined], // no EXIF
  ["lizard-sunning.jpg", ["wildlife", "macro"], "2024:04:07 12:30:00"],
  ["bird-on-leaf.jpg", ["wildlife", "birds"], "2024:05:19 09:15:00", true],
  ["hawk-on-ice.jpg", ["wildlife", "birds", "winter"], "2023:01:28 10:00:00"],
  ["still-water.jpg", ["lake", "moody"], "2021:11:20 16:45:00"],
  ["pier-at-sunset.jpg", ["lake", "sunset"], "2022:07:09 21:05:00", true],
  ["rowing-boats.jpg", ["lake", "boats", "sunset"], "2022:07:10 20:40:00"],
  ["long-jetty.jpg", ["lake", "sunset"], "2022:07:10 21:15:00"],
  ["lake-glow.jpg", ["lake", "sunset"], undefined], // no EXIF
];
const photoIds: Record<string, number> = {};
for (const [file, tags, takenAt, fav] of photos) {
  const raw = await fs.readFile(path.join(PHOTO_DIR, file));
  const id = await addPhoto(demo, file, tags, takenAt ? injectExifDate(raw, takenAt) : raw);
  if (fav) db.prepare("UPDATE photos SET favorite = 1 WHERE id = ?").run(id);
  photoIds[file] = id;
}
const pick = (...names: string[]) => names.map((n) => photoIds[n]);

// Optional: any photos you drop into backend/my-photos are added to the demo account too (original bytes, real EXIF).
if (existsSync(MY_PHOTOS)) {
  for (const file of (await fs.readdir(MY_PHOTOS)).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))) {
    try { await addPhoto(demo, file, [], await fs.readFile(path.join(MY_PHOTOS, file))); console.log(`  added your photo: ${file}`); }
    catch { console.log(`  skipped ${file} (not a readable image)`); }
  }
}

const shareToken = addAlbum(demo, "Golden Hour", pick("pier-at-sunset.jpg", "rowing-boats.jpg", "long-jetty.jpg", "lake-glow.jpg"), photoIds["pier-at-sunset.jpg"], true);
addAlbum(demo, "Mountains", pick("misty-ridges.jpg", "desert-peak.jpg", "night-sky-peaks.jpg", "valley-fog.jpg", "snowy-peaks-dusk.jpg"), photoIds["night-sky-peaks.jpg"]);
addAlbum(demo, "Wildlife", pick("lizard-sunning.jpg", "bird-on-leaf.jpg", "hawk-on-ice.jpg"));
addAlbum(demo, "Winter", pick("hawk-on-ice.jpg", "snowy-peaks-dusk.jpg"));

// A second user, to show that accounts are separate.
await addPhoto(ids["guest@example.com"], "guest-photo.jpg", ["guest"], await makeJpeg({ color: "#0d9488", takenAt: "2024:03:03 12:00:00" }));

console.log("Seeded demo data.\n");
for (const u of DEMO) console.log(`  login: ${u.email} / ${u.password}`);
console.log(`\n  Shared album (public link): http://localhost:5173/s/${shareToken}`);
