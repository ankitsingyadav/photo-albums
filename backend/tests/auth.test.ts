import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { checkPasswordPolicy } from "../src/security/passwords.js";
import { hashToken } from "../src/auth.js";
import { setup, signup, TEST_PASSWORD } from "./helpers.js";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let ctx: ReturnType<typeof setup>;

beforeEach(() => { ctx = setup(); });
afterEach(() => ctx.cleanup());

const register = (email: string, password: string, app = ctx.app) => request(app).post("/api/auth/register").send({ email, password });
const login = (email: string, password: string, agent: { post: typeof request.agent extends never ? never : any } | undefined = undefined) =>
  (agent ?? request(ctx.app)).post("/api/auth/login").send({ email, password });
const cookieOf = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[]) ?? [])[0] ?? "";

describe("password rules", () => {
  const bad = (pw: string, email = "me@example.com") => checkPasswordPolicy(pw, email);

  it("requires at least 10 characters", () => expect(bad("Short-1!x")).toMatch(/at least 10/));
  it("rejects common passwords, including decorated ones", () => {
    for (const pw of ["password123", "Password123!", "P@ssw0rd!!!!", "Passw0rd2024", "qwertyuiop1", "iloveyou2024", "Adm1nistrator!"]) expect(bad(pw), pw).toMatch(/common|keyboard/);
    for (const fine of ["Tr0ub4dor&3-horse", "purple-Giraffe-lamp-9", "Rain-forest-42-lamp"]) expect(bad(fine), fine).toBeNull(); // no false alarms
  });
  it("rejects simple sequences, keyboard runs and repeated characters", () => {
    expect(bad("1234567890")).toBeTruthy();
    expect(bad("abcdefghijk")).toBeTruthy();
    expect(bad("aaaaaaaaaaaa")).toMatch(/variety/);
    expect(bad("qwertyuiopas")).toBeTruthy();
  });
  it("rejects a password containing the email name", () => {
    expect(bad("ankitsingh-2024-x", "ankitsingh@example.com")).toMatch(/email/);
  });
  it("rejects passwords over bcrypt's 72-BYTE limit instead of silently truncating them", () => {
    expect(bad("é".repeat(40))).toMatch(/too long/); // 40 characters but 80 bytes
    expect(bad("é".repeat(30) + "xyz-Q")).toBeNull(); // 65 bytes is fine
  });
  it("accepts a strong passphrase", () => expect(bad(TEST_PASSWORD)).toBeNull());

  it("is enforced when registering (field = password)", async () => {
    const res = await register("new@example.com", "password123");
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("password");
    expect((await register("new@example.com", TEST_PASSWORD)).status).toBe(201);
  });
  it("is NOT applied at login (so the rules aren't revealed and older passwords still work)", async () => {
    const hash = bcrypt.hashSync("password123", 4);
    ctx.db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)").run("old@example.com", hash, "x");
    expect((await login("old@example.com", "password123")).status).toBe(200);
  });
});

describe("sessions", () => {
  it("sets a hardened cookie: HttpOnly, SameSite=Lax, Path=/", async () => {
    const c = cookieOf(await register("a@example.com", TEST_PASSWORD));
    expect(c).toMatch(/^session=/);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/Secure/i); // plain http in tests
  });

  it("uses the __Host- prefix and Secure when COOKIE_SECURE is on", async () => {
    const secure = setup({ cookieSecure: true });
    const c = cookieOf(await register("a@example.com", TEST_PASSWORD, secure.app));
    expect(c).toMatch(/^__Host-session=/);
    expect(c).toMatch(/Secure/i);
    expect(c).not.toMatch(/Domain=/i);
    secure.cleanup();
  });

  it("stores only a hash of the token, never the token itself", async () => {
    const res = await register("a@example.com", TEST_PASSWORD);
    const token = cookieOf(res).split(";")[0].split("=")[1];
    const rows = ctx.db.prepare("SELECT id FROM sessions").all() as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hashToken(token));
    expect(rows[0].id).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits of randomness
  });

  it("gives every login a new, different token", async () => {
    await register("a@example.com", TEST_PASSWORD);
    const t1 = cookieOf(await login("a@example.com", TEST_PASSWORD));
    const t2 = cookieOf(await login("a@example.com", TEST_PASSWORD));
    expect(t1).not.toBe(t2);
  });

  it("logging out kills the session on the server, so a copied cookie stops working", async () => {
    const reg = await register("a@example.com", TEST_PASSWORD);
    const stolen = cookieOf(reg).split(";")[0];
    expect((await request(ctx.app).get("/api/auth/me").set("Cookie", stolen)).status).toBe(200);
    await request(ctx.app).post("/api/auth/logout").set("Cookie", stolen);
    expect((await request(ctx.app).get("/api/auth/me").set("Cookie", stolen)).status).toBe(401); // replaying the old cookie fails
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });

  it("rejects forged or junk cookies", async () => {
    for (const bad of ["session=", "session=abc", `session=${"a".repeat(43)}`, `session=${"x".repeat(500)}`]) {
      expect((await request(ctx.app).get("/api/auth/me").set("Cookie", bad)).status, bad).toBe(401);
    }
  });

  it("expires after 7 days without use", async () => {
    const cookie = cookieOf(await register("a@example.com", TEST_PASSWORD)).split(";")[0];
    ctx.clock.now += 6 * DAY;
    expect((await request(ctx.app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    ctx.clock.now += 8 * DAY; // 8 quiet days after the last use
    const res = await request(ctx.app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("stays alive while used, but never beyond 30 days in total", async () => {
    const cookie = cookieOf(await register("a@example.com", TEST_PASSWORD)).split(";")[0];
    let status = 200, day = 0;
    for (; day < 40 && status === 200; day++) {
      ctx.clock.now += DAY; // used once a day: the idle limit never triggers
      status = (await request(ctx.app).get("/api/auth/me").set("Cookie", cookie)).status;
    }
    expect(status).toBe(401);
    expect(day).toBe(30); // alive on days 1-29, rejected on day 30: the absolute limit is exactly 30 days
  });

  it("'sign out everywhere' ends every device's session", async () => {
    await register("a@example.com", TEST_PASSWORD);
    const phone = cookieOf(await login("a@example.com", TEST_PASSWORD)).split(";")[0];
    const laptop = cookieOf(await login("a@example.com", TEST_PASSWORD)).split(";")[0];
    expect((await request(ctx.app).post("/api/auth/logout-all").set("Cookie", laptop)).status).toBe(204);
    expect((await request(ctx.app).get("/api/auth/me").set("Cookie", phone)).status).toBe(401);
    expect((await request(ctx.app).get("/api/auth/me").set("Cookie", laptop)).status).toBe(401);
  });

  it("deleting a user removes their sessions", async () => {
    await register("a@example.com", TEST_PASSWORD);
    ctx.db.prepare("DELETE FROM users").run();
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });
});

describe("login", () => {
  beforeEach(async () => { await register("victim@example.com", TEST_PASSWORD); });

  it("gives the identical answer for a wrong password and an unknown email (no account enumeration)", async () => {
    const wrong = await login("victim@example.com", "wrong-password-1");
    const unknown = await login("nobody@example.com", "wrong-password-1");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("locks the account after 5 wrong passwords, even for the right password, and says how long", async () => {
    for (let i = 0; i < 5; i++) expect((await login("victim@example.com", `wrong-${i}-password`)).status).toBe(401);
    const locked = await login("victim@example.com", TEST_PASSWORD); // correct password, but locked
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/15 minutes/);
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(14 * 60);
    expect(locked.body.retryAfter).toBeGreaterThan(14 * 60);
  });

  it("unlocks after the lock time, and a successful login clears the history", async () => {
    for (let i = 0; i < 5; i++) await login("victim@example.com", `wrong-${i}-password`);
    ctx.clock.now += 14 * MIN;
    expect((await login("victim@example.com", TEST_PASSWORD)).status).toBe(429); // still locked
    ctx.clock.now += 2 * MIN;
    expect((await login("victim@example.com", TEST_PASSWORD)).status).toBe(200); // lock over
    // history was cleared: another 4 failures don't lock again
    for (let i = 0; i < 4; i++) await login("victim@example.com", `wrong-${i}-password`);
    expect((await login("victim@example.com", TEST_PASSWORD)).status).toBe(200);
  });

  it("makes each repeat lock twice as long", async () => {
    for (let i = 0; i < 5; i++) await login("victim@example.com", `wrong-${i}-password`);
    ctx.clock.now += 16 * MIN; // first lock (15 min) over
    for (let i = 0; i < 5; i++) await login("victim@example.com", `wrong-${i}-password`);
    const second = await login("victim@example.com", TEST_PASSWORD);
    expect(second.status).toBe(429);
    expect(second.body.retryAfter).toBeGreaterThan(29 * 60); // 30 minutes this time
  });

  it("limits an unknown email exactly like a real one (the lockout can't be used to find accounts)", async () => {
    const outcomes = async (email: string) => {
      const r = [];
      for (let i = 0; i < 7; i++) r.push((await login(email, `wrong-${i}-password`)).status);
      return r;
    };
    expect(await outcomes("nobody@example.com")).toEqual(await outcomes("someone-else@example.com"));
    const real = [];
    for (let i = 0; i < 7; i++) real.push((await login("victim@example.com", `wrong-${i}-password`)).status);
    expect(real).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });

  it("limits one IP address that tries many different accounts (password spraying)", async () => {
    let status = 0, tries = 0;
    for (; tries < 40 && status !== 429; tries++) status = (await login(`user${tries}@example.com`, "spray-password-1")).status;
    expect(status).toBe(429);
    expect(tries).toBe(26); // 25 failures allowed, the 26th attempt is refused
    expect((await login("victim@example.com", TEST_PASSWORD)).status).toBe(429); // same IP is now locked out entirely
  });

  it("can't be dodged by faking X-Forwarded-For (it is ignored unless TRUST_PROXY is set)", async () => {
    let status = 0;
    for (let i = 0; i < 30 && status !== 429; i++) {
      status = (await request(ctx.app).post("/api/auth/login").set("X-Forwarded-For", `10.0.0.${i}`).send({ email: `user${i}@example.com`, password: "spray-password-1" })).status;
    }
    expect(status).toBe(429);
  });

  it("limits how many accounts one IP can create per hour", async () => {
    const other = setup();
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await register(`bot${i}@example.com`, TEST_PASSWORD, other.app)).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    other.cleanup();
  });

  it("upgrades an older, weaker password hash after a successful login", async () => {
    const strong = setup({ bcryptRounds: 6 });
    strong.db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)").run("old@example.com", bcrypt.hashSync("Old-but-fine-pass-9", 4), "x");
    expect((await login("old@example.com", "Old-but-fine-pass-9").then(() => request(strong.app).post("/api/auth/login").send({ email: "old@example.com", password: "Old-but-fine-pass-9" }))).status).toBe(200);
    const { password_hash } = strong.db.prepare("SELECT password_hash FROM users WHERE email = ?").get("old@example.com") as { password_hash: string };
    expect(bcrypt.getRounds(password_hash)).toBe(6);
    strong.cleanup();
  });

  it("validates the input", async () => {
    expect((await login("not-an-email", "x")).body.field).toBe("email");
    expect((await request(ctx.app).post("/api/auth/login").send({ email: "a@example.com" })).body.field).toBe("password");
    expect((await request(ctx.app).post("/api/auth/login").send("garbage")).status).toBe(400);
    expect((await register("VICTIM@example.com", TEST_PASSWORD)).status).toBe(409); // email is case-insensitive
  });
});

describe("changing the password", () => {
  const change = (agent: ReturnType<typeof request.agent>, currentPassword: string, newPassword: string) =>
    agent.post("/api/auth/change-password").send({ currentPassword, newPassword });

  it("needs the current password, enforces the rules, and signs out other devices", async () => {
    const laptop = await signup(ctx.app, "me@example.com");
    const phone = request.agent(ctx.app);
    await login("me@example.com", TEST_PASSWORD, phone);

    expect((await change(laptop, "wrong-current-1", "Brand-new-pass-77")).status).toBe(401);
    expect((await change(laptop, TEST_PASSWORD, "short")).body.field).toBe("newPassword");
    expect((await change(laptop, TEST_PASSWORD, "password123")).status).toBe(400);
    expect((await change(laptop, TEST_PASSWORD, TEST_PASSWORD)).body.error).toMatch(/different/);

    const ok = await change(laptop, TEST_PASSWORD, "Brand-new-pass-77");
    expect(ok.status).toBe(200);
    expect(ok.body.signedOutOtherDevices).toBe(1);
    expect((await laptop.get("/api/auth/me")).status).toBe(200); // this device stays signed in
    expect((await phone.get("/api/auth/me")).status).toBe(401); // the other one is out

    expect((await login("me@example.com", TEST_PASSWORD)).status).toBe(401); // old password is dead
    expect((await login("me@example.com", "Brand-new-pass-77")).status).toBe(200);
  });

  it("can't be used to guess the current password: locks after 5 wrong tries", async () => {
    const agent = await signup(ctx.app, "me@example.com");
    for (let i = 0; i < 5; i++) expect((await change(agent, `wrong-${i}-password`, "Brand-new-pass-77")).status).toBe(401);
    expect((await change(agent, TEST_PASSWORD, "Brand-new-pass-77")).status).toBe(429);
  });

  it("requires being signed in", async () => {
    expect((await request(ctx.app).post("/api/auth/change-password").send({ currentPassword: "a", newPassword: "b" })).status).toBe(401);
  });
});

describe("cross-site request protection and headers", () => {
  it("refuses state-changing requests from another site, even with a valid login cookie", async () => {
    const agent = await signup(ctx.app, "me@example.com");
    const evil = await agent.post("/api/albums").set("Origin", "https://evil.example").send({ title: "hacked" });
    expect(evil.status).toBe(403);
    expect((await agent.post("/api/albums").set("Sec-Fetch-Site", "cross-site").send({ title: "hacked" })).status).toBe(403);
    expect((await agent.post("/api/albums").set("Origin", "null").send({ title: "hacked" })).status).toBe(403);
    expect((await agent.get("/api/albums")).body.albums).toHaveLength(0); // nothing was created
  });

  it("blocks cross-site login attempts too", async () => {
    expect((await request(ctx.app).post("/api/auth/login").set("Origin", "https://evil.example").send({ email: "a@example.com", password: "x" })).status).toBe(403);
  });

  it("allows same-origin requests (the real app)", async () => {
    const agent = await signup(ctx.app, "me@example.com");
    const res = await agent.post("/api/albums").set("Host", "app.test").set("Origin", "http://app.test").set("Sec-Fetch-Site", "same-origin").send({ title: "ok" });
    expect(res.status).toBe(201);
  });

  it("trusts the browser's Sec-Fetch-Site header, so it still works behind a proxy that rewrites Host (Vite dev server)", async () => {
    const agent = await signup(ctx.app, "me@example.com");
    // What Firefox sends through the dev proxy: Origin = the page, Host = rewritten to the API's own address
    const viaProxy = await agent.post("/api/albums").set("Host", "localhost:4000").set("Origin", "http://localhost:5173").set("Sec-Fetch-Site", "same-origin").send({ title: "dev" });
    expect(viaProxy.status).toBe(201);
    // same-site (e.g. a sibling subdomain) is NOT the same origin
    expect((await agent.post("/api/albums").set("Sec-Fetch-Site", "same-site").send({ title: "x" })).status).toBe(403);
    // without the header (old browser) the Origin/Host comparison still protects
    expect((await agent.post("/api/albums").set("Host", "localhost:4000").set("Origin", "http://localhost:5173").send({ title: "x" })).status).toBe(403);
  });

  it("does not block reading (GET), and leaves requests without an Origin alone (curl, tests)", async () => {
    const agent = await signup(ctx.app, "me@example.com");
    expect((await agent.get("/api/albums").set("Origin", "https://other.example")).status).toBe(200);
    expect((await agent.post("/api/albums").send({ title: "no origin" })).status).toBe(201);
  });

  it("sends security headers", async () => {
    const res = await request(ctx.app).get("/api/health");
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeUndefined(); // only when served over HTTPS
  });

  it("turns on HSTS when running over HTTPS", async () => {
    const secure = setup({ cookieSecure: true });
    expect((await request(secure.app).get("/api/health")).headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    secure.cleanup();
  });

  it("never lets browsers cache auth responses", async () => {
    const res = await register("a@example.com", TEST_PASSWORD);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("refuses TRUST_PROXY=true, which would let anyone fake their IP", async () => {
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig({ TRUST_PROXY: "true" } as NodeJS.ProcessEnv)).toThrow(/spoofed/);
    expect(loadConfig({ TRUST_PROXY: "1" } as NodeJS.ProcessEnv).trustProxy).toBe(1);
    expect(loadConfig({} as NodeJS.ProcessEnv).trustProxy).toBe(false);
  });

  it("is secure by default in production", async () => {
    const { loadConfig } = await import("../src/config.js");
    const prod = loadConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(prod.cookieSecure).toBe(true);
    expect(prod.bcryptRounds).toBeGreaterThanOrEqual(12);
  });
});
