import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

// Dates are stored as ISO-8601 UTC strings, so sorting them as text is also
// sorting them chronologically.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Login sessions. The cookie holds a random token; only its SHA-256 hash is stored here,
-- so a copy of the database can't be used to take over accounts.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,              -- sha256(token) as hex
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,              -- ms since epoch
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Failed-attempt counters used to slow down password guessing (see security/throttle.ts).
CREATE TABLE IF NOT EXISTS auth_throttle (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0,
  strikes      INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id           INTEGER PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  original_key TEXT NOT NULL,
  thumb_key    TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  taken_at     TEXT,              -- from EXIF, NULL when the photo has none
  uploaded_at  TEXT NOT NULL,
  favorite     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_id);

CREATE TABLE IF NOT EXISTS albums (
  id             INTEGER PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  cover_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  share_token    TEXT UNIQUE,     -- NULL while sharing is off
  share_enabled  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_albums_owner ON albums(owner_id);

CREATE TABLE IF NOT EXISTS album_photos (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (album_id, photo_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id       INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);
`;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Upgrades databases created by an older version of the app (adds columns that are missing). */
function migrate(db: DB) {
  const cols = db.prepare("PRAGMA table_info(photos)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "favorite")) {
    db.exec("ALTER TABLE photos ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
  }
}
