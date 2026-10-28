import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type { AppContext } from "./types.js";
import { HttpError, notFound } from "./errors.js";
import { requireAuth } from "./auth.js";
import { csrfGuard, noStore, securityHeaders } from "./security/guards.js";
import { authRouter } from "./routes/auth.js";
import { photosRouter, statsRouter, tagsRouter } from "./routes/photos.js";
import { albumsRouter } from "./routes/albums.js";
import { publicRouter } from "./routes/public.js";

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable("x-powered-by");
  // Only believe X-Forwarded-For when you really run behind a proxy (TRUST_PROXY); otherwise anyone could fake their IP and dodge rate limits.
  app.set("trust proxy", ctx.config.trustProxy);
  app.use(...securityHeaders(ctx.config));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const auth = requireAuth(ctx);
  app.use("/api", csrfGuard()); // refuses cross-site requests that change data
  app.use("/api/auth", noStore, authRouter(ctx));
  app.use("/api/public", publicRouter(ctx)); // no login needed, token-checked instead
  app.use("/api/photos", auth, photosRouter(ctx));
  app.use("/api/albums", auth, albumsRouter(ctx));
  app.use("/api/tags", auth, tagsRouter(ctx));
  app.use("/api/stats", auth, statsRouter(ctx));
  app.use("/api", (_req, _res, next) => next(notFound("Unknown endpoint")));

  // In production the API also serves the built React app.
  const index = path.join(ctx.config.frontendDist, "index.html");
  if (fs.existsSync(index)) {
    app.use(express.static(ctx.config.frontendDist));
    app.use((req, res, next) => (req.method === "GET" ? res.sendFile(index) : next()));
  }

  // One place that turns every error into a clear JSON message.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
      res.status(err.status).json({ error: err.message, field: err.field, retryAfter: err.retryAfter });
      return;
    }
    if (err instanceof multer.MulterError) {
      const limit = ctx.config;
      const map: Record<string, [number, string]> = {
        LIMIT_FILE_SIZE: [413, `A photo is larger than the ${limit.maxUploadMb} MB limit`],
        LIMIT_FILE_COUNT: [400, `You can upload at most ${limit.maxFilesPerUpload} photos at once`],
        LIMIT_UNEXPECTED_FILE: [400, 'Upload photos using the "photos" field'],
      };
      const [status, message] = map[err.code] ?? [400, "Upload failed"];
      res.status(status).json({ error: message, field: "photos" });
      return;
    }
    if ((err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body is not valid JSON" });
      return;
    }
    if ((err as { type?: string }).type === "entity.too.large") {
      res.status(413).json({ error: "Request body is too large" });
      return;
    }
    console.error(`${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: "Something went wrong on the server" });
  });

  return app;
}
