import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { LocalStorage } from "./storage.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp({ config, db: openDb(config.dbPath), storage: new LocalStorage(config.uploadDir), now: Date.now });
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
