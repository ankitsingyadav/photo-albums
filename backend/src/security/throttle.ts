import type { DB } from "../db.js";
import { HttpError } from "../errors.js";

export interface Policy {
  max: number;       // failures allowed within the window
  windowMs: number;  // how long failures are remembered
  lockMs: number;    // how long to lock after reaching the limit (doubles with each repeat)
}

/** Policies used by the auth routes. */
export const POLICIES = {
  loginAccount: { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  loginIp: { max: 25, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  changePassword: { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  register: { max: 10, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
} satisfies Record<string, Policy>;

const FORGET_AFTER_MS = 24 * 3600_000; // a quiet day wipes the history, including repeat-offender escalation
const MAX_LOCK_MS = 24 * 3600_000;

interface Row { count: number; window_start: number; locked_until: number; strikes: number; updated_at: number }

/**
 * Slows down password guessing. After too many failures for a key (an account
 * or an IP address) further attempts are refused with 429 for a while, and each
 * repeat lock lasts twice as long. State is kept in SQLite, so it survives restarts.
 */
export class Throttle {
  constructor(private db: DB, private now: () => number) {}

  private get(key: string) {
    return this.db.prepare("SELECT count, window_start, locked_until, strikes, updated_at FROM auth_throttle WHERE key = ?").get(key) as Row | undefined;
  }

  /** Throws 429 if this key is currently locked. Call BEFORE checking the password. */
  assertAllowed(key: string) {
    const row = this.get(key);
    const now = this.now();
    if (row && row.locked_until > now) {
      const seconds = Math.ceil((row.locked_until - now) / 1000);
      throw new HttpError(429, `Too many attempts. Try again in ${humanize(seconds)}.`, undefined, seconds);
    }
  }

  /** Records one failed attempt (or, for registration, one attempt), locking the key when the limit is reached. */
  fail(key: string, policy: Policy) {
    const now = this.now();
    let row = this.get(key);
    if (!row || now - row.updated_at > FORGET_AFTER_MS) row = { count: 0, window_start: now, locked_until: 0, strikes: row && now - row.updated_at <= FORGET_AFTER_MS ? row.strikes : 0, updated_at: now };
    if (row.locked_until > now) return; // already locked: don't extend it
    if (now - row.window_start > policy.windowMs || row.locked_until !== 0) {
      row = { ...row, count: 0, window_start: now, locked_until: 0 }; // old window or finished lock: start counting again
    }
    row.count += 1;
    if (row.count >= policy.max) {
      row.locked_until = now + Math.min(policy.lockMs * 2 ** row.strikes, MAX_LOCK_MS);
      row.strikes += 1;
    }
    row.updated_at = now;
    this.db
      .prepare(
        `INSERT INTO auth_throttle (key, count, window_start, locked_until, strikes, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start,
           locked_until = excluded.locked_until, strikes = excluded.strikes, updated_at = excluded.updated_at`
      )
      .run(key, row.count, row.window_start, row.locked_until, row.strikes, row.updated_at);
  }

  /** A successful login clears the account's failures and repeat-offender history. */
  reset(key: string) {
    this.db.prepare("DELETE FROM auth_throttle WHERE key = ?").run(key);
  }

  /** Removes bookkeeping that is no longer needed. */
  cleanup() {
    this.db.prepare("DELETE FROM auth_throttle WHERE updated_at < ?").run(this.now() - FORGET_AFTER_MS);
  }
}

function humanize(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
