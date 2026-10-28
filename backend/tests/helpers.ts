import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { LocalStorage } from "../src/storage.js";

/** A password that passes the password rules. */
export const TEST_PASSWORD = "Rain-forest-42-lamp";

/**
 * A fresh app with an in-memory database and a temp upload folder.
 * `clock.now` is the app's clock: tests move it forward to test expiry and lockouts without waiting.
 */
export function setup(opts: { cookieSecure?: boolean; bcryptRounds?: number; trustProxy?: boolean | number | string } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photo-albums-test-"));
  const config = {
    ...loadConfig({ BCRYPT_ROUNDS: String(opts.bcryptRounds ?? 4) } as NodeJS.ProcessEnv),
    uploadDir: dir,
    frontendDist: path.join(dir, "no-frontend"),
    cookieSecure: opts.cookieSecure ?? false,
    trustProxy: opts.trustProxy ?? false,
  };
  const db = openDb(":memory:");
  const storage = new LocalStorage(dir);
  const clock = { now: Date.now() };
  const app = createApp({ config, db, storage, now: () => clock.now });
  return { app, db, storage, dir, clock, config, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Registers a user and returns a supertest agent that keeps the login cookie. */
export async function signup(app: ReturnType<typeof createApp>, email = "user@example.com") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ email, password: TEST_PASSWORD });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export type Agent = Awaited<ReturnType<typeof signup>>;

export async function upload(
  agent: Agent,
  files: { data: Buffer; name: string }[],
  fields: Record<string, string> = {}
) {
  let req = agent.post("/api/photos");
  for (const f of files) req = req.attach("photos", f.data, f.name);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req;
}
