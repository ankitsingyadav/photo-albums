import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AppContext } from "./types.js";
import { HttpError } from "./errors.js";

/*
 * Login sessions.
 *
 * At login we create a random 256-bit token and put it in a cookie. The database only
 * stores its SHA-256 hash. So:
 *  - a leaked copy of the database can't be used to log in as anyone;
 *  - logging out deletes the row, so a copied cookie stops working immediately
 *    (unlike a signed JWT, which stays valid until it expires).
 */

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** In production the cookie gets the "__Host-" prefix: browsers then insist on Secure + Path=/ + no Domain. */
export const cookieName = (ctx: AppContext) => (ctx.config.cookieSecure ? "__Host-session" : "session");

const cookieBase = (ctx: AppContext) => ({
  httpOnly: true,            // JavaScript on the page can't read it (limits damage from XSS)
  sameSite: "lax" as const,  // not sent on cross-site POSTs
  secure: ctx.config.cookieSecure,
  path: "/",
});

const REFRESH_AFTER_MS = 60 * 60_000; // extend an active session at most once an hour

export function startSession(ctx: AppContext, req: Request, res: Response, userId: number) {
  const token = randomBytes(32).toString("base64url"); // always a NEW token at login (prevents session fixation)
  const now = ctx.now();
  ctx.db
    .prepare("INSERT INTO sessions (id, user_id, created_at, last_used_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
    .run(hashToken(token), userId, now, now, now + ctx.config.sessionIdleMs, (req.get("user-agent") ?? "").slice(0, 200));
  res.cookie(cookieName(ctx), token, { ...cookieBase(ctx), maxAge: ctx.config.sessionIdleMs });
  ctx.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now); // tidy up old sessions
}

export function endSession(ctx: AppContext, req: Request, res: Response) {
  const token = req.cookies?.[cookieName(ctx)];
  if (typeof token === "string") ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  res.clearCookie(cookieName(ctx), cookieBase(ctx));
}

/** Deletes every session of a user (optionally keeping one). Returns how many were removed. */
export function endAllSessions(ctx: AppContext, userId: number, exceptId?: string) {
  const info = exceptId
    ? ctx.db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(userId, exceptId)
    : ctx.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return info.changes;
}

export function requireAuth(ctx: AppContext): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[cookieName(ctx)];
    if (typeof token !== "string" || token.length === 0 || token.length > 200) return next(new HttpError(401, "Please sign in"));

    const id = hashToken(token);
    const now = ctx.now();
    const s = ctx.db.prepare("SELECT user_id, created_at, last_used_at, expires_at FROM sessions WHERE id = ?").get(id) as
      | { user_id: number; created_at: number; last_used_at: number; expires_at: number }
      | undefined;
    if (!s) return next(new HttpError(401, "Please sign in"));
    if (s.expires_at <= now) {
      ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return next(new HttpError(401, "Your session has expired, please sign in again"));
    }

    // Sliding expiry: activity keeps you signed in, but never beyond the absolute maximum.
    if (now - s.last_used_at > REFRESH_AFTER_MS) {
      const expires = Math.min(now + ctx.config.sessionIdleMs, s.created_at + ctx.config.sessionMaxMs);
      ctx.db.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?").run(now, expires, id);
      res.cookie(cookieName(ctx), token, { ...cookieBase(ctx), maxAge: expires - now });
    }
    req.userId = s.user_id;
    req.sessionId = id;
    next();
  };
}
