import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { makeJpeg } from "../src/devImages.js";
import { parseExifDate, processImage, readTakenAt, THUMB_SIZE, UnsupportedImageError } from "../src/images.js";

describe("image processing", () => {
  it("creates a small WebP thumbnail that keeps the aspect ratio", async () => {
    const original = await makeJpeg({ width: 2400, height: 1200 });
    const out = await processImage(original);
    const meta = await sharp(out.thumb).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(THUMB_SIZE);
    expect(meta.height).toBe(THUMB_SIZE / 2);
    expect(out.thumb.length).toBeLessThan(original.length);
    expect([out.width, out.height]).toEqual([2400, 1200]);
  });

  it("does not upscale small images", async () => {
    const out = await processImage(await makeJpeg({ width: 200, height: 100 }));
    expect((await sharp(out.thumb).metadata()).width).toBe(200);
  });

  it("reads the EXIF date taken", async () => {
    const jpeg = await makeJpeg({ takenAt: "2019:07:04 18:45:10" });
    expect(await readTakenAt(jpeg)).toBe("2019-07-04T18:45:10.000Z");
    expect((await processImage(jpeg)).takenAt).toBe("2019-07-04T18:45:10.000Z");
  });

  it("returns null when there is no EXIF data", async () => {
    expect((await processImage(await makeJpeg())).takenAt).toBeNull();
  });

  it("rejects bytes that are not an image, whatever the file name says", async () => {
    await expect(processImage(Buffer.from("definitely not an image"))).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("rejects unsupported image formats", async () => {
    const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).tiff().toBuffer();
    await expect(processImage(tiff)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("ignores impossible EXIF dates", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(parseExifDate("2020:13:40 10:00:00", now)).toBeNull(); // month 13
    expect(parseExifDate("2020:02:31 10:00:00", now)).toBeNull(); // Feb 31
    expect(parseExifDate("1970:01:01 00:00:00", now)).toBeNull(); // before 1990
    expect(parseExifDate("2031:01:01 00:00:00", now)).toBeNull(); // in the future
    expect(parseExifDate("0000:00:00 00:00:00", now)).toBeNull(); // common camera default
    expect(parseExifDate(undefined, now)).toBeNull();
  });
});
