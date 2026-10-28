import sharp, { type Metadata } from "sharp";
import exifr from "exifr";

export class UnsupportedImageError extends Error {}

const FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
  gif: { mime: "image/gif", ext: "gif" },
};

export const THUMB_SIZE = 480; // longest side, in pixels

export interface ProcessedImage {
  mime: string;
  ext: string;
  width: number;
  height: number;
  thumb: Buffer;
  takenAt: string | null;
}

/**
 * Validates the bytes really are a supported image (we never trust the file
 * extension or the browser's MIME type), builds the thumbnail, and reads the
 * date the photo was taken from EXIF.
 */
export async function processImage(data: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(data, { limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new UnsupportedImageError("File is not a valid image");
  }
  const format = meta.format ? FORMATS[meta.format] : undefined;
  if (!format || !meta.width || !meta.height) {
    throw new UnsupportedImageError("Only JPEG, PNG, WebP and GIF images are supported");
  }

  // EXIF orientation 5-8 means the photo is stored rotated by 90 degrees.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;

  const thumb = await sharp(data, { limitInputPixels: 80_000_000 })
    .rotate() // apply EXIF orientation so thumbnails are upright
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  return { ...format, width, height, thumb, takenAt: await readTakenAt(data) };
}

/**
 * Reads DateTimeOriginal (falling back to CreateDate) from EXIF.
 * EXIF dates look like "2020:05:17 10:30:00" and carry no time zone, so we
 * parse the raw text ourselves and treat it as UTC. That keeps results the
 * same on every machine. Returns null when missing or implausible.
 */
export async function readTakenAt(data: Buffer): Promise<string | null> {
  try {
    const tags = await exifr.parse(data, {
      pick: ["DateTimeOriginal", "CreateDate"],
      reviveValues: false,
    });
    return parseExifDate(tags?.DateTimeOriginal ?? tags?.CreateDate);
  } catch {
    return null; // no EXIF, or unreadable EXIF: caller falls back to upload date
  }
}

export function parseExifDate(raw: unknown, now = new Date()): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const valid =
    !Number.isNaN(date.getTime()) &&
    date.getUTCMonth() === mo - 1 && // rejects things like month 13 or Feb 31
    y >= 1990 &&
    date.getTime() <= now.getTime() + 24 * 3600 * 1000;
  return valid ? date.toISOString() : null;
}
