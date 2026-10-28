import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeJpeg } from "../src/devImages.js";
import { setup, signup, upload, type Agent } from "./helpers.js";

let ctx: ReturnType<typeof setup>;
let alice: Agent;
let photoIds: number[];

beforeEach(async () => {
  ctx = setup();
  alice = await signup(ctx.app, "alice@example.com");
  const up = await upload(alice, [
    { data: await makeJpeg({ takenAt: "2018:01:01 10:00:00" }), name: "a.jpg" },
    { data: await makeJpeg({ takenAt: "2019:01:01 10:00:00" }), name: "b.jpg" },
  ], { tags: "trip" });
  photoIds = up.body.photos.map((p: { id: number }) => p.id);
});
afterEach(() => ctx.cleanup());

describe("albums", () => {
  it("creates, renames, adds photos, picks a cover and removes photos", async () => {
    const created = await alice.post("/api/albums").send({ title: "  Summer  " });
    expect(created.status).toBe(201);
    expect(created.body.album.title).toBe("Summer"); // trimmed
    const id = created.body.album.id;

    const renamed = await alice.patch(`/api/albums/${id}`).send({ title: "Summer 2019" });
    expect(renamed.body.album.title).toBe("Summer 2019");

    const added = await alice.post(`/api/albums/${id}/photos`).send({ photoIds });
    expect(added.body.album.photoCount).toBe(2);
    expect(added.body.album.coverPhotoId).toBe(photoIds[1]); // automatic cover = newest photo

    const cover = await alice.patch(`/api/albums/${id}`).send({ coverPhotoId: photoIds[0] });
    expect(cover.body.album.coverPhotoId).toBe(photoIds[0]);
    expect(cover.body.album.hasCustomCover).toBe(true);

    // Removing the cover photo from the album falls back to the automatic cover.
    const removed = await alice.delete(`/api/albums/${id}/photos/${photoIds[0]}`);
    expect(removed.body.album.photoCount).toBe(1);
    expect(removed.body.album.hasCustomCover).toBe(false);
    expect(removed.body.album.coverPhotoId).toBe(photoIds[1]);

    // The photo itself is not deleted, only removed from the album.
    expect((await alice.get("/api/photos")).body.photos).toHaveLength(2);
  });

  it("lets the same photo be in several albums", async () => {
    const a = (await alice.post("/api/albums").send({ title: "A" })).body.album.id;
    const b = (await alice.post("/api/albums").send({ title: "B" })).body.album.id;
    await alice.post(`/api/albums/${a}/photos`).send({ photoIds: [photoIds[0]] });
    await alice.post(`/api/albums/${b}/photos`).send({ photoIds: [photoIds[0]] });
    expect((await alice.get(`/api/albums/${a}`)).body.photos).toHaveLength(1);
    expect((await alice.get(`/api/albums/${b}`)).body.photos).toHaveLength(1);
  });

  it("sorts and tag-filters inside an album", async () => {
    const id = (await alice.post("/api/albums").send({ title: "A" })).body.album.id;
    await alice.post(`/api/albums/${id}/photos`).send({ photoIds });
    const asc = await alice.get(`/api/albums/${id}?sort=date_asc`);
    expect(asc.body.photos.map((p: { filename: string }) => p.filename)).toEqual(["a.jpg", "b.jpg"]);
    expect((await alice.get(`/api/albums/${id}?tags=trip`)).body.photos).toHaveLength(2);
    expect((await alice.get(`/api/albums/${id}?tags=nothing`)).body.photos).toHaveLength(0);
  });

  it("validates input with clear messages", async () => {
    const bad = await alice.post("/api/albums").send({ title: "   " });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "Title is required", field: "title" });
    expect((await alice.post("/api/albums").send({ title: "x".repeat(101) })).status).toBe(400);
    expect((await alice.post("/api/albums").send("not json")).status).toBe(400);

    const id = (await alice.post("/api/albums").send({ title: "A" })).body.album.id;
    expect((await alice.post(`/api/albums/${id}/photos`).send({ photoIds: [] })).status).toBe(400);
    expect((await alice.post(`/api/albums/${id}/photos`).send({ photoIds: ["x"] })).status).toBe(400);
    expect((await alice.post(`/api/albums/${id}/photos`).send({ photoIds: [99999] })).status).toBe(404);
    // A cover must be a photo that is in the album.
    expect((await alice.patch(`/api/albums/${id}`).send({ coverPhotoId: photoIds[0] })).status).toBe(400);
    expect((await alice.patch(`/api/albums/abc`).send({ title: "x" })).status).toBe(400);
  });

  it("does not let another user touch my albums or add my photos to theirs", async () => {
    const id = (await alice.post("/api/albums").send({ title: "Mine" })).body.album.id;
    const bob = await signup(ctx.app, "bob@example.com");
    expect((await bob.get(`/api/albums/${id}`)).status).toBe(404);
    expect((await bob.patch(`/api/albums/${id}`).send({ title: "hacked" })).status).toBe(404);
    expect((await bob.delete(`/api/albums/${id}`)).status).toBe(404);
    const bobAlbum = (await bob.post("/api/albums").send({ title: "Bob's" })).body.album.id;
    expect((await bob.post(`/api/albums/${bobAlbum}/photos`).send({ photoIds })).status).toBe(404);
  });

  it("downloads an album as a ZIP", async () => {
    const id = (await alice.post("/api/albums").send({ title: "Zip me" })).body.album.id;
    await alice.post(`/api/albums/${id}/photos`).send({ photoIds });
    const res = await alice.get(`/api/albums/${id}/zip`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.body.subarray(0, 2).toString()).toBe("PK"); // zip magic number
    expect(res.body.toString("latin1")).toContain("a.jpg");
  });
});
