import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(req: Request): CookieOptions {
  // The self-hosted portal does not need cross-site iframe cookies. Lax reduces
  // cross-site request risk; Secure is enforced for production and trusted HTTPS.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || req.secure,
  };
}
