import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppContext } from "../types.js";
import { HttpError, parse } from "../errors.js";
import { endAllSessions, endSession, requireAuth, startSession } from "../auth.js";
import { checkPasswordPolicy, hashPassword, needsRehash, verifyPassword } from "../security/passwords.js";
import { POLICIES, Throttle } from "../security/throttle.js";

const email = z.string({ error: "Email is required" }).trim().toLowerCase().email("Enter a valid email address").max(254, "Email is too long");
// For login we only require *something*: the password rules are not revealed (or applied) there.
const anyPassword = (label: string) => z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(1024, `${label} is too long`);

const registerBody = z.object({ email, password: anyPassword("Password") });
const loginBody = z.object({ email, password: anyPassword("Password") });
const changeBody = z.object({ currentPassword: anyPassword("Current password"), newPassword: anyPassword("New password") });

const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32); // keeps emails out of the throttle table

export function authRouter(ctx: AppContext) {
  const { db, config } = ctx;
  const r = Router();
  const throttle = new Throttle(db, ctx.now);
  const auth = requireAuth(ctx);
  const ip = (req: { ip?: string }) => req.ip ?? "unknown";

  // Used when the email doesn't exist, so the response time is the same either way (same cost as real hashes).
  let dummy: Promise<string> | null = null;
  const dummyHash = () => (dummy ??= hashPassword("not-a-real-password", config.bcryptRounds));

  r.post("/register", async (req, res) => {
    const regKey = `register:ip:${ip(req)}`;
    throttle.assertAllowed(regKey);
    throttle.fail(regKey, POLICIES.register); // every attempt counts, so accounts can't be mass-created
    const { email: address, password } = parse(registerBody, req.body);

    const problem = checkPasswordPolicy(password, address);
    if (problem) throw new HttpError(400, problem, "password");

    const hash = await hashPassword(password, config.bcryptRounds);
    try {
      const info = db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)").run(address, hash, new Date(ctx.now()).toISOString());
      const id = Number(info.lastInsertRowid);
      startSession(ctx, req, res, id);
      res.status(201).json({ user: { id, email: address } });
    } catch (e) {
      if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new HttpError(409, "An account with this email already exists", "email");
      }
      throw e;
    }
  });

  r.post("/login", async (req, res) => {
    const { email: address, password } = parse(loginBody, req.body);
    const acctKey = `login:acct:${short(address)}`; // keyed on what was TYPED, so unknown emails are limited exactly like real ones
    const ipKey = `login:ip:${ip(req)}`;
    throttle.assertAllowed(ipKey);
    throttle.assertAllowed(acctKey);

    const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(address) as
      | { id: number; email: string; password_hash: string }
      | undefined;
    // Always run a bcrypt comparison, even for unknown emails, so timing doesn't reveal which emails exist.
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
    if (!user || !ok) {
      throttle.fail(acctKey, POLICIES.loginAccount);
      throttle.fail(ipKey, POLICIES.loginIp);
      throw new HttpError(401, "Incorrect email or password"); // same message for both cases
    }

    throttle.reset(acctKey);
    throttle.cleanup();
    if (needsRehash(user.password_hash, config.bcryptRounds)) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password, config.bcryptRounds), user.id);
    }
    startSession(ctx, req, res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  });

  r.post("/logout", (req, res) => {
    endSession(ctx, req, res); // deletes the session on the server, so a copied cookie is useless from now on
    res.status(204).end();
  });

  // "Sign out everywhere": every device, including this one.
  r.post("/logout-all", auth, (req, res) => {
    endAllSessions(ctx, req.userId!);
    endSession(ctx, req, res);
    res.status(204).end();
  });

  r.post("/change-password", auth, async (req, res) => {
    const { currentPassword, newPassword } = parse(changeBody, req.body);
    const key = `pw:user:${req.userId}`; // someone with a stolen session must not be able to guess the current password
    throttle.assertAllowed(key);

    const user = db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(req.userId) as { id: number; email: string; password_hash: string };
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throttle.fail(key, POLICIES.changePassword);
      throw new HttpError(401, "Current password is incorrect", "currentPassword");
    }
    throttle.reset(key);

    const problem = checkPasswordPolicy(newPassword, user.email);
    if (problem) throw new HttpError(400, problem, "newPassword");
    if (newPassword === currentPassword) throw new HttpError(400, "New password must be different from the current one", "newPassword");

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(newPassword, config.bcryptRounds), user.id);
    // A password change signs out every OTHER device (this one stays signed in).
    const signedOut = endAllSessions(ctx, user.id, req.sessionId);
    res.json({ ok: true, signedOutOtherDevices: signedOut });
  });

  r.get("/me", auth, (req, res) => {
    res.json({ user: db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId) });
  });

  return r;
}
