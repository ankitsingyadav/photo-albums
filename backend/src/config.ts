import "dotenv/config";
import path from "node:path";

export interface Config {
  port: number;
  dbPath: string;
  uploadDir: string;
  maxUploadMb: number;
  maxFilesPerUpload: number;
  bcryptRounds: number;
  cookieSecure: boolean;
  /** Express "trust proxy" setting: false, or how many proxy hops to trust. */
  trustProxy: boolean | number | string;
  /** A session ends after this long without use... */
  sessionIdleMs: number;
  /** ...and never lasts longer than this in total, however active it is. */
  sessionMaxMs: number;
  frontendDist: string;
}

const DAY = 24 * 3600 * 1000;

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value); // number of proxy hops
  if (value === "true") throw new Error('TRUST_PROXY=true would trust spoofed X-Forwarded-For headers. Use a number of hops (e.g. 1) or "loopback".');
  return value; // e.g. "loopback"
}

/** Reads settings from environment variables. Every setting is listed in .env.example. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === "production";
  return {
    port: Number(env.PORT ?? 4000),
    dbPath: env.DATABASE_PATH ?? path.resolve("data/app.db"),
    uploadDir: env.UPLOAD_DIR ?? path.resolve("data/uploads"),
    maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 15),
    maxFilesPerUpload: Number(env.MAX_FILES_PER_UPLOAD ?? 20),
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? (isProd ? 12 : 10)),
    // Secure by default in production: the login cookie is then only ever sent over HTTPS.
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProd,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    sessionIdleMs: Number(env.SESSION_IDLE_DAYS ?? 7) * DAY,
    sessionMaxMs: Number(env.SESSION_MAX_DAYS ?? 30) * DAY,
    frontendDist: env.FRONTEND_DIST ?? path.resolve("../frontend/dist"),
  };
}
