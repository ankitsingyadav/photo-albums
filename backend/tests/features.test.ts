import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { makeJpeg } from "../src/devImages.js";
import { openDb } from "../src/db.js";
import { setup, signup, upload, type Agent } from "./helpers.js";

let ctx: ReturnType<typeof setup>;
let alice: Agent;
let ids: number[];

beforeEach(async () => {
  ctx = setup();
  alice = await signup(ctx.app, "alice@example.com");
  const make = async (name: string, tags: string) =>
    (await upload(alice, [{ data: await makeJpeg(), name }], { tags })).body.photos[0].id as number;
  ids = [await make("Beach_Day.jpg", "beach"), await make("city-night.jpg", "city"), await make("100%_sure.jpg", "city,night")];
});
afterEach(() => ctx.cleanup());

const names = async (qs: string) =>
  (await alice.get(`/api/photos${qs}`)).body.photos.map((p: { filename: string }) => p.filename).sort();

describe("favourites", () => {
  it("can be switched on and off, and filtered", async () => {
    expect((await alice.get("/api/photos")).body.photos.every((p: { favorite: boolean }) => !p.favorite)).toBe(true);
    const res = await alice.patch(`/api/photos/${ids[0]}`).send({ favorite: true });
    expect(res.body.photo.favorite).toBe(true);
    expect(await names("?favorites=1")).toEqual(["Beach_Day.jpg"]);
    await alice.patch(`/api/photos/${ids[0]}`).send({ favorite: false });
    expect(await names("?favorites=1")).toEqual([]);
  });

  it("validates input and respects ownership", async () => {
    expect((await alice.patch(`/api/photos/${ids[0]}`).send({ favorite: "yes" })).status).toBe(400);
    const bob = await signup(ctx.app, "bob@example.com");
    expect((await bob.patch(`/api/photos/${ids[0]}`).send({ favorite: true })).status).toBe(404);
  });

  it("can be changed for many photos at once", async () => {
    const res = await alice.post("/api/photos/bulk-favorite").send({ photoIds: ids.slice(0, 2), favorite: true });
    expect(res.body.updated).toBe(2);
    expect(await names("?favorites=1")).toEqual(["Beach_Day.jpg", "city-night.jpg"]);
  });

  it("are not revealed on a public share link", async () => {
    await alice.patch(`/api/photos/${ids[0]}`).send({ favorite: true });
    const album = (await alice.post("/api/albums").send({ title: "A" })).body.album.id;
    await alice.post(`/api/albums/${album}/photos`).send({ photoIds: [ids[0]] });
    const token = (await alice.post(`/api/albums/${album}/share`)).body.album.shareToken;
    const pub = await request(ctx.app).get(`/api/public/albums/${token}`);
    expect(pub.body.photos[0]).not.toHaveProperty("favorite");
  });
});

describe("search by file name", () => {
  it("matches part of the name, ignoring case", async () => {
    expect(await names("?q=beach")).toEqual(["Beach_Day.jpg"]);
    expect(await names("?q=NIGHT")).toEqual(["city-night.jpg"]);
  });

  it("treats % and _ literally instead of as wildcards", async () => {
    expect(await names("?q=%25")).toEqual(["100%_sure.jpg"]); // a lone % must not match everything
    expect(await names("?q=_")).toEqual(["100%_sure.jpg", "Beach_Day.jpg"]);
  });

  it("combines with tags and rejects very long searches", async () => {
    expect(await names("?q=night&tags=night")).toEqual([]);
    expect(await names("?q=sure&tags=night")).toEqual(["100%_sure.jpg"]);
    expect((await alice.get(`/api/photos?q=${"x".repeat(101)}`)).status).toBe(400);
  });
});

describe("bulk tagging", () => {
  it("adds and removes tags on several photos", async () => {
    const res = await alice.post("/api/photos/bulk-tags").send({ photoIds: ids, add: ["Trip 2024"], remove: ["city"] });
    expect(res.body.updated).toBe(3);
    const photos = (await alice.get("/api/photos")).body.photos as { filename: string; tags: string[] }[];
    const by = Object.fromEntries(photos.map((p) => [p.filename, p.tags]));
    expect(by["Beach_Day.jpg"]).toEqual(["beach", "trip 2024"]);
    expect(by["city-night.jpg"]).toEqual(["trip 2024"]);
    expect(by["100%_sure.jpg"]).toEqual(["night", "trip 2024"]);
    expect((await alice.get("/api/tags")).body.tags.map((t: { name: string }) => t.name)).not.toContain("city"); // unused tag cleaned up
  });

  it("validates input and cannot touch other people's photos", async () => {
    expect((await alice.post("/api/photos/bulk-tags").send({ photoIds: ids })).status).toBe(400); // nothing to do
    expect((await alice.post("/api/photos/bulk-tags").send({ photoIds: [], add: ["x"] })).status).toBe(400);
    expect((await alice.post("/api/photos/bulk-tags").send({ photoIds: ids, add: ["bad!"] })).body.field).toBe("add");
    const bob = await signup(ctx.app, "bob@example.com");
    expect((await bob.post("/api/photos/bulk-tags").send({ photoIds: ids, add: ["mine"] })).status).toBe(404);
    expect((await names("?tags=mine"))).toEqual([]);
  });
});

describe("stats and migration", () => {
  it("reports library numbers", async () => {
    await alice.patch(`/api/photos/${ids[0]}`).send({ favorite: true });
    await alice.post("/api/albums").send({ title: "A" });
    const s = (await alice.get("/api/stats")).body;
    expect(s).toMatchObject({ photos: 3, favorites: 1, albums: 1, sharedAlbums: 0 });
    expect(s.bytes).toBeGreaterThan(0);
  });

  it("upgrades a database made by the previous version (adds the favorite column)", () => {
    const file = path.join(os.tmpdir(), `old-${Date.now()}.db`);
    const db = openDb(file);
    db.exec("ALTER TABLE photos DROP COLUMN favorite"); // pretend this is an old database
    db.close();
    const upgraded = openDb(file);
    const cols = (upgraded.prepare("PRAGMA table_info(photos)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("favorite");
    upgraded.close();
    fs.rmSync(file, { force: true });
  });
});
