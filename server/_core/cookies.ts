import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(_req: Request): CookieOptions {
  // Application sessions are host-only, HttpOnly and Secure. SameSite=None also supports direct provider OAuth redirects behind a TLS-terminating reverse proxy.
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}
