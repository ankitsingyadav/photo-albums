import type { Config } from "./config.js";
import type { DB } from "./db.js";
import type { Storage } from "./storage.js";

export interface AppContext {
  config: Config;
  db: DB;
  storage: Storage;
  /** The clock (ms since epoch). Tests replace it to fast-forward time. */
  now: () => number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;    // set by requireAuth
      sessionId?: string; // set by requireAuth (hash of the session token)
    }
  }
}
