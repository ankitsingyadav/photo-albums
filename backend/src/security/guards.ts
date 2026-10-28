import type { RequestHandler } from "express";
import helmet from "helmet";
import type { Config } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Blocks cross-site requests that try to change something (CSRF).
 * The SameSite=Lax cookie already stops the browser sending the login cookie on cross-site POSTs;
 * this is a second, independent check.
 *
 * Modern browsers describe where a request came from in the Sec-Fetch-Site header, which page scripts
 * cannot forge, so that is trusted first. (It also keeps working behind a proxy that rewrites the Host
 * header, such as the Vite dev server.) Only when it is missing (older browsers) do we compare the
 * Origin header with the Host.
 */
export function csrfGuard(): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const reject = () => res.status(403).json({ error: "Cross-site request blocked" });

    const site = req.get("sec-fetch-site");
    if (site) return site === "same-origin" || site === "none" ? next() : reject(); // "none" = typed in the address bar

    const origin = req.get("origin");
    if (origin !== undefined) {
      try {
        if (new URL(origin).host !== req.host) return reject();
      } catch {
        return reject(); // e.g. "Origin: null"
      }
    }
    next();
  };
}

/** Security headers: CSP (only our own scripts/styles/images load), no framing, no sniffing, no referrer leaks. */
export function securityHeaders(config: Config): RequestHandler[] {
  const permissions: RequestHandler = (_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
  };
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"], // blob: for upload previews
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: "deny" }, // older browsers: same as frame-ancestors 'none'
      // The share token is part of the URL, so never send it to other sites in a Referer header.
      referrerPolicy: { policy: "no-referrer" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      strictTransportSecurity: config.cookieSecure ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    }),
    permissions,
  ];
}

/** Auth responses must never be stored by browsers or proxies. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
