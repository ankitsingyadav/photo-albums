import type { DB } from "./db.js";

export interface PhotoRow {
  id: number;
  owner_id: number;
  filename: string;
  original_key: string;
  thumb_key: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  uploaded_at: string;
  favorite: number;
}

export type SortOrder = "date_desc" | "date_asc";

/** The date a photo is sorted by: EXIF date taken, otherwise the upload date. */
export const SORT_DATE_SQL = "COALESCE(p.taken_at, p.uploaded_at)";

export function orderBySql(order: SortOrder) {
  const dir = order === "date_asc" ? "ASC" : "DESC";
  return `ORDER BY ${SORT_DATE_SQL} ${dir}, p.id ${dir}`;
}

export interface PhotoQuery {
  ownerId: number;
  albumId?: number;
  tags?: string[]; // photo must have ALL of these tags
  favoritesOnly?: boolean;
  search?: string; // matches part of the file name
  order?: SortOrder;
}

export function listPhotos(db: DB, q: PhotoQuery): (PhotoRow & { tags: string[] })[] {
  const where = ["p.owner_id = ?"];
  const params: (string | number)[] = [q.ownerId];

  if (q.albumId !== undefined) {
    where.push("p.id IN (SELECT photo_id FROM album_photos WHERE album_id = ?)");
    params.push(q.albumId);
  }

  if (q.favoritesOnly) where.push("p.favorite = 1");

  const search = q.search?.trim();
  if (search) {
    // Escape % and _ so they are matched literally, not as wildcards.
    where.push("p.filename LIKE ? ESCAPE '\\'");
    params.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
  }

  const tags = q.tags ?? [];
  if (tags.length > 0) {
    // AND search: count how many of the requested tags this photo has and
    // require that to equal the number requested.
    where.push(`(
      SELECT COUNT(DISTINCT t.name) FROM photo_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.photo_id = p.id AND t.name IN (${tags.map(() => "?").join(",")})
    ) = ?`);
    params.push(...tags, tags.length);
  }

  const rows = db
    .prepare(`SELECT p.* FROM photos p WHERE ${where.join(" AND ")} ${orderBySql(q.order ?? "date_desc")}`)
    .all(...params) as PhotoRow[];
  return attachTags(db, rows);
}

/** Loads the tags for a list of photos with a single query (no N+1). */
export function attachTags(db: DB, rows: PhotoRow[]): (PhotoRow & { tags: string[] })[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tagRows = db
    .prepare(
      `SELECT pt.photo_id AS photoId, t.name FROM photo_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.photo_id IN (${ids.map(() => "?").join(",")}) ORDER BY t.name`
    )
    .all(...ids) as { photoId: number; name: string }[];
  const byPhoto = new Map<number, string[]>();
  for (const r of tagRows) {
    const list = byPhoto.get(r.photoId) ?? [];
    list.push(r.name);
    byPhoto.set(r.photoId, list);
  }
  return rows.map((r) => ({ ...r, tags: byPhoto.get(r.id) ?? [] }));
}

export interface UrlBuilder {
  thumb(id: number): string;
  file(id: number): string;
}

export const privateUrls: UrlBuilder = {
  thumb: (id) => `/api/photos/${id}/thumb`,
  file: (id) => `/api/photos/${id}/file`,
};

export function publicUrls(token: string): UrlBuilder {
  return {
    thumb: (id) => `/api/public/albums/${token}/photos/${id}/thumb`,
    file: (id) => `/api/public/albums/${token}/photos/${id}/file`,
  };
}

/** What the API sends to the browser. Never includes storage keys or owner ids. */
export function serializePhoto(p: PhotoRow & { tags: string[] }, urls: UrlBuilder) {
  return {
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
    size: p.size,
    takenAt: p.taken_at,
    uploadedAt: p.uploaded_at,
    sortDate: p.taken_at ?? p.uploaded_at,
    favorite: p.favorite === 1,
    dateSource: p.taken_at ? ("exif" as const) : ("upload" as const),
    tags: p.tags,
    thumbUrl: urls.thumb(p.id),
    fileUrl: urls.file(p.id),
  };
}
