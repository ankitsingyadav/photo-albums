import { HttpError } from "./errors.js";
import type { DB } from "./db.js";

export const MAX_TAGS_PER_PHOTO = 20;
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;

/** trim, lower-case and collapse spaces, so "Beach  Trip" and "beach trip" are one tag. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Validates a list of tags and removes duplicates. Throws a 400 on bad input. */
export function normalizeTags(raw: unknown, field = "tags"): string[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "tags must be a list", field);
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") throw new HttpError(400, "Each tag must be text", field);
    const tag = normalizeTag(item);
    if (!tag) continue;
    if (tag.length > 30) throw new HttpError(400, `Tag "${tag.slice(0, 12)}…" is longer than 30 characters`, field);
    if (!TAG_RE.test(tag)) throw new HttpError(400, `Tag "${tag}" contains unsupported characters`, field);
    out.add(tag);
  }
  if (out.size > MAX_TAGS_PER_PHOTO) {
    throw new HttpError(400, `A photo can have at most ${MAX_TAGS_PER_PHOTO} tags`, field);
  }
  return [...out];
}

/** "beach, sunset" -> ["beach", "sunset"]  (used for ?tags= and the upload form) */
export function parseTagList(csv: unknown, field = "tags"): string[] {
  if (csv === undefined || csv === null || csv === "") return [];
  if (typeof csv !== "string") throw new HttpError(400, "tags must be text", field);
  return normalizeTags(csv.split(","), field);
}

/** Replaces the tags of one photo. Runs inside the caller's transaction. */
export function setPhotoTags(db: DB, ownerId: number, photoId: number, tags: string[]) {
  db.prepare("DELETE FROM photo_tags WHERE photo_id = ?").run(photoId);
  const upsert = db.prepare("INSERT OR IGNORE INTO tags (owner_id, name) VALUES (?, ?)");
  const find = db.prepare("SELECT id FROM tags WHERE owner_id = ? AND name = ?");
  const link = db.prepare("INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)");
  for (const name of tags) {
    upsert.run(ownerId, name);
    const row = find.get(ownerId, name) as { id: number };
    link.run(photoId, row.id);
  }
  // Remove tags that no photo uses any more, so the tag list stays clean.
  db.prepare(
    "DELETE FROM tags WHERE owner_id = ? AND id NOT IN (SELECT tag_id FROM photo_tags)"
  ).run(ownerId);
}
