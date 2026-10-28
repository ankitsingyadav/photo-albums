import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeJpeg } from "../src/devImages.js";
import { setup, signup, upload, type Agent } from "./helpers.js";

let ctx: ReturnType<typeof setup>;
let alice: Agent;
let albumId: number;
let photoIds: number[];

beforeEach(async () => {
  ctx = setup();
  alice = await signup(ctx.app, "alice@example.com");
  const up = await upload(alice, [
    { data: await makeJpeg({ color: "#ef4444" }), name: "one.jpg" },
    { data: await makeJpeg({ color: "#22c55e" }), name: "two.jpg" },
  ]);
  photoIds = up.body.photos.map((p: { id: number }) => p.id);
  const album = await alice.post("/api/albums").send({ title: "Trip" });
  albumId = album.body.album.id;
  await alice.post(`/api/albums/${albumId}/photos`).send({ photoIds: [photoIds[0]] });
});
afterEach(() => ctx.cleanup());

const enable = async () => (await alice.post(`/api/albums/${albumId}/share`)).body.album.shareToken as string;

describe("public share links", () => {
  it("shows a shared album to anyone with the link, without logging in", async () => {
    const token = await enable();
    const res = await request(ctx.app).get(`/api/public/albums/${token}`); // no cookie
    expect(res.status).toBe(200);
    expect(res.body.album.title).toBe("Trip");
    expect(res.body.photos).toHaveLength(1);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toMatch(/alice|owner|original_key|thumb_key/);

    const thumb = await request(ctx.app).get(res.body.photos[0].thumbUrl);
    expect(thumb.status).toBe(200);
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect((await request(ctx.app).get(res.body.photos[0].fileUrl)).status).toBe(200);
  });

  it("stops working IMMEDIATELY when sharing is turned off (page, thumbnails and full images)", async () => {
    const token = await enable();
    const page = await request(ctx.app).get(`/api/public/albums/${token}`);
    const { thumbUrl, fileUrl } = page.body.photos[0];
    expect((await request(ctx.app).get(thumbUrl)).status).toBe(200);

    const off = await alice.delete(`/api/albums/${albumId}/share`);
    expect(off.status).toBe(200);
    expect(off.body.album.shareEnabled).toBe(false);

    // The very next requests fail. The server checked the database every time.
    expect((await request(ctx.app).get(`/api/public/albums/${token}`)).status).toBe(404);
    expect((await request(ctx.app).get(thumbUrl)).status).toBe(404);
    expect((await request(ctx.app).get(fileUrl)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/public/albums/${token}/zip`)).status).toBe(404);
  });

  it("gives a NEW link when sharing is turned back on; the old link stays dead", async () => {
    const first = await enable();
    await alice.delete(`/api/albums/${albumId}/share`);
    const second = await enable();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(43);
    expect((await request(ctx.app).get(`/api/public/albums/${first}`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/public/albums/${second}`)).status).toBe(200);
  });

  it("returns the same link if sharing is already on", async () => {
    expect(await enable()).toBe(await enable());
  });

  it("cannot be used to fetch a photo that is not in the shared album", async () => {
    const token = await enable();
    // photoIds[1] belongs to Alice but is NOT in the shared album.
    const res = await request(ctx.app).get(`/api/public/albums/${token}/photos/${photoIds[1]}/thumb`);
    expect(res.status).toBe(404);
  });

  it("rejects guessed or malformed tokens", async () => {
    expect((await request(ctx.app).get("/api/public/albums/abc")).status).toBe(404);
    expect((await request(ctx.app).get(`/api/public/albums/${"a".repeat(43)}`)).status).toBe(404);
  });

  it("only the owner can turn sharing on or off", async () => {
    const token = await enable();
    const bob = await signup(ctx.app, "bob@example.com");
    expect((await bob.delete(`/api/albums/${albumId}/share`)).status).toBe(404);
    expect((await bob.post(`/api/albums/${albumId}/share`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/public/albums/${token}`)).status).toBe(200); // still shared
    expect((await request(ctx.app).post(`/api/albums/${albumId}/share`)).status).toBe(401);
  });
});
