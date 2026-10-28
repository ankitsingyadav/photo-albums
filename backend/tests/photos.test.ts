import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import request from "supertest";
import sharp from "sharp";
import { makeJpeg } from "../src/devImages.js";
import { setup, signup, upload, type Agent } from "./helpers.js";

let ctx: ReturnType<typeof setup>;
let alice: Agent;

beforeEach(async () => {
  ctx = setup();
  alice = await signup(ctx.app, "alice@example.com");
});
afterEach(() => ctx.cleanup());

describe("uploading photos", () => {
  it("accepts several photos at once and generates a server-side thumbnail for each", async () => {
    const files = [
      { data: await makeJpeg({ width: 3000, height: 2000, color: "#ef4444" }), name: "a.jpg" },
      { data: await makeJpeg({ width: 1600, height: 1200, color: "#22c55e" }), name: "b.jpg" },
    ];
    const res = await upload(alice, files);
    expect(res.status).toBe(201);
    expect(res.body.photos).toHaveLength(2);
    expect(res.body.errors).toEqual([]);

    for (const [i, photo] of res.body.photos.entries()) {
      // The gallery URL points at the thumbnail endpoint...
      expect(photo.thumbUrl).toMatch(/\/thumb$/);
      const thumb = await alice.get(photo.thumbUrl).buffer(true).parse(binary);
      expect(thumb.status).toBe(200);
      expect(thumb.headers["content-type"]).toBe("image/webp");
      // ...and the thumbnail is much smaller than the original.
      expect(thumb.body.length).toBeLessThan(files[i].data.length / 2);
      expect((await sharp(thumb.body).metadata()).width).toBeLessThanOrEqual(480);
    }
    // The thumbnail files really exist on disk, next to the originals.
    const onDisk = fs.readdirSync(ctx.dir);
    expect(onDisk.filter((f) => f.endsWith("_thumb.webp"))).toHaveLength(2);
  });

  it("rejects a text file renamed to .jpg with a clear message, and stores nothing", async () => {
    const res = await upload(alice, [{ data: Buffer.from("just text"), name: "fake.jpg" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a valid image/i);
    expect(res.body.field).toBe("photos");
    expect(fs.readdirSync(ctx.dir)).toHaveLength(0);
  });

  it("keeps the good photos when one file in the batch is bad", async () => {
    const res = await upload(alice, [
      { data: await makeJpeg(), name: "good.jpg" },
      { data: Buffer.from("nope"), name: "bad.png" },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.photos).toHaveLength(1);
    expect(res.body.errors).toEqual([{ filename: "bad.png", message: expect.any(String) }]);
  });

  it("requires at least one file and a valid tag list", async () => {
    expect((await alice.post("/api/photos").field("tags", "x")).status).toBe(400);
    const res = await upload(alice, [{ data: await makeJpeg(), name: "a.jpg" }], { tags: "bad!tag" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("tags");
  });

  it("requires login", async () => {
    const res = await request(ctx.app).get("/api/photos");
    expect(res.status).toBe(401);
  });
});

describe("sorting by date taken", () => {
  it("uses the EXIF date, and falls back to the upload date when there is none", async () => {
    const old = await upload(alice, [{ data: await makeJpeg({ takenAt: "2015:01:01 12:00:00" }), name: "old.jpg" }]);
    const mid = await upload(alice, [{ data: await makeJpeg({ takenAt: "2020:06:15 12:00:00" }), name: "mid.jpg" }]);
    const noExif = await upload(alice, [{ data: await makeJpeg(), name: "no-exif.jpg" }]); // uploaded "now"

    expect(old.body.photos[0].dateSource).toBe("exif");
    expect(noExif.body.photos[0].dateSource).toBe("upload");

    const newestFirst = await alice.get("/api/photos?sort=date_desc");
    expect(newestFirst.body.photos.map((p: { filename: string }) => p.filename)).toEqual(["no-exif.jpg", "mid.jpg", "old.jpg"]);

    const oldestFirst = await alice.get("/api/photos?sort=date_asc");
    expect(oldestFirst.body.photos.map((p: { filename: string }) => p.filename)).toEqual(["old.jpg", "mid.jpg", "no-exif.jpg"]);

    expect((await alice.get("/api/photos?sort=sideways")).status).toBe(400);
  });
});

describe("tags", () => {
  it("searches by several tags using AND, and normalises tag names", async () => {
    const jpg = () => makeJpeg();
    await upload(alice, [{ data: await jpg(), name: "beach-sunset.jpg" }], { tags: "Beach, sunset" });
    await upload(alice, [{ data: await jpg(), name: "beach-day.jpg" }], { tags: "beach" });
    await upload(alice, [{ data: await jpg(), name: "city.jpg" }], { tags: "city,sunset" });

    const names = async (q: string) =>
      (await alice.get(`/api/photos?tags=${encodeURIComponent(q)}`)).body.photos.map((p: { filename: string }) => p.filename).sort();

    expect(await names("beach")).toEqual(["beach-day.jpg", "beach-sunset.jpg"]);
    expect(await names("Beach,Sunset")).toEqual(["beach-sunset.jpg"]); // both tags required, case-insensitive
    expect(await names("beach,city")).toEqual([]);

    const tags = (await alice.get("/api/tags")).body.tags;
    expect(tags).toEqual([
      { name: "beach", count: 2 },
      { name: "city", count: 1 },
      { name: "sunset", count: 2 },
    ]);
  });

  it("replaces a photo's tags and removes tags nobody uses", async () => {
    const up = await upload(alice, [{ data: await makeJpeg(), name: "a.jpg" }], { tags: "one,two" });
    const id = up.body.photos[0].id;
    const res = await alice.put(`/api/photos/${id}/tags`).send({ tags: ["two", "three"] });
    expect(res.body.photo.tags).toEqual(["three", "two"]);
    expect((await alice.get("/api/tags")).body.tags.map((t: { name: string }) => t.name)).toEqual(["three", "two"]);
    expect((await alice.put(`/api/photos/${id}/tags`).send({ tags: "nope" })).status).toBe(400);
  });
});

describe("ownership", () => {
  it("does not let another user see, change or delete my photos", async () => {
    const up = await upload(alice, [{ data: await makeJpeg(), name: "private.jpg" }]);
    const { id, thumbUrl } = up.body.photos[0];
    const bob = await signup(ctx.app, "bob@example.com");

    expect((await bob.get("/api/photos")).body.photos).toHaveLength(0);
    expect((await bob.get(thumbUrl)).status).toBe(404);
    expect((await bob.put(`/api/photos/${id}/tags`).send({ tags: ["x"] })).status).toBe(404);
    expect((await bob.delete(`/api/photos/${id}`)).status).toBe(404);
    expect((await alice.get(thumbUrl)).status).toBe(200); // still there
  });

  it("deletes the files from disk when a photo is deleted", async () => {
    const up = await upload(alice, [{ data: await makeJpeg(), name: "a.jpg" }]);
    expect(fs.readdirSync(ctx.dir)).toHaveLength(2); // original + thumbnail
    expect((await alice.delete(`/api/photos/${up.body.photos[0].id}`)).status).toBe(204);
    expect(fs.readdirSync(ctx.dir)).toHaveLength(0);
  });
});

// supertest helper: collect a binary response body into a Buffer
function binary(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}
