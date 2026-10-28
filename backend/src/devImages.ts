import sharp from "sharp";

/**
 * Generates small test/demo JPEGs, optionally with an EXIF "date taken".
 * Used by the automated tests and the seed script (no image files to commit).
 */
export async function makeJpeg(opts: {
  color?: string;
  width?: number;
  height?: number;
  takenAt?: string; // EXIF format: "2020:05:17 10:30:00"
} = {}): Promise<Buffer> {
  const { color = "#4f46e5", width = 800, height = 600, takenAt } = opts;
  const c2 = shift(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.7}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.15}" fill="rgba(255,255,255,0.35)"/>
    <rect x="${width * 0.1}" y="${height * 0.6}" width="${width * 0.5}" height="${height * 0.25}" rx="12" fill="rgba(0,0,0,0.2)"/>
  </svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return takenAt ? injectExifDate(jpeg, takenAt) : jpeg;
}

function shift(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v));
  const r = f((n >> 16) - 60), g = f(((n >> 8) & 255) - 60), b = f((n & 255) + 40);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Inserts a minimal EXIF block (big-endian TIFF) holding DateTimeOriginal. */
export function injectExifDate(jpeg: Buffer, takenAt: string): Buffer {
  const str = Buffer.from(takenAt + "\0", "ascii"); // 20 bytes incl. terminator
  const tiff = Buffer.alloc(44 + str.length);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4);              // offset of IFD0
  tiff.writeUInt16BE(1, 8);              // IFD0: one entry
  tiff.writeUInt16BE(0x8769, 10);        //   ExifIFD pointer
  tiff.writeUInt16BE(4, 12);             //   type LONG
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);            //   offset of the Exif IFD
  tiff.writeUInt32BE(0, 22);             //   no next IFD
  tiff.writeUInt16BE(1, 26);             // Exif IFD: one entry
  tiff.writeUInt16BE(0x9003, 28);        //   DateTimeOriginal
  tiff.writeUInt16BE(2, 30);             //   type ASCII
  tiff.writeUInt32BE(str.length, 32);
  tiff.writeUInt32BE(44, 36);            //   offset of the string
  tiff.writeUInt32BE(0, 40);
  str.copy(tiff, 44);

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  // JPEG = SOI marker (2 bytes) + segments. Put our APP1 right after the SOI.
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}
