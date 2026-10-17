import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createAuthRateLimiter } from "./authRateLimit";

const STATE_COOKIE = "arbitrade_provider_oauth";
type Provider = "google" | "microsoft";
type ProviderConfig = { clientId?: string; clientSecret?: string; redirectUri?: string; authorize: string; token: string; scope: string; userinfo: string };

function config(provider: Provider): ProviderConfig {
  if (provider === "google") return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  };
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid profile email User.Read",
    userinfo: "https://graph.microsoft.com/oidc/userinfo",
  };
}
function providerFrom(value: unknown): Provider | undefined { return value === "google" || value === "microsoft" ? value : undefined; }
function origin(req: Request) { return process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`; }
function redirectUri(req: Request, provider: Provider) { return config(provider).redirectUri || `${origin(req)}/api/oauth/${provider}/callback`; }
function safeError(res: Response, status: number, message: string) { res.status(status).json({ error: message }); }

export function registerProviderOAuthRoutes(app: Express) {
  const startRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 20, message: "Too many OAuth sign-in attempts. Try again later." });
  const callbackRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 60, message: "Too many OAuth callback attempts. Try again later." });
  app.get("/api/oauth/:provider/start", startRateLimit, (req, res) => {
    const provider = providerFrom(req.params.provider);
    if (!provider) return safeError(res, 404, "Unsupported OAuth provider");
    const c = config(provider);
    if (!c.clientId || !c.clientSecret) return safeError(res, 503, `${provider} OAuth is not configured. Complete the installer credentials first.`);
    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    res.cookie(STATE_COOKIE, JSON.stringify({ state, verifier, provider }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 });
    const params = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(req, provider), response_type: "code", scope: c.scope, state, code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "select_account" });
    return res.redirect(302, `${c.authorize}?${params.toString()}`);
  });

  app.get("/api/oauth/:provider/callback", callbackRateLimit, async (req, res) => {
    const provider = providerFrom(req.params.provider); const code = typeof req.query.code === "string" ? req.query.code : undefined; const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!provider || !code || !state) return safeError(res, 400, "OAuth callback is missing required parameters");
    const cookies = parseCookieHeader(req.headers.cookie ?? ""); let saved: { state?: string; verifier?: string; provider?: Provider } = {};
    try { saved = JSON.parse(cookies[STATE_COOKIE] || "{}"); } catch { return safeError(res, 403, "Invalid OAuth state"); }
    if (saved.state !== state || saved.provider !== provider || !saved.verifier) return safeError(res, 403, "Invalid or expired OAuth state");
    res.clearCookie(STATE_COOKIE, { path: "/", secure: process.env.NODE_ENV === "production", sameSite: "lax" });
    const c = config(provider);
    try {
      const tokenResponse = await fetch(c.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId!, client_secret: c.clientSecret!, code, redirect_uri: redirectUri(req, provider), grant_type: "authorization_code", code_verifier: saved.verifier }) });
      if (!tokenResponse.ok) return safeError(res, 502, "OAuth token exchange failed");
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) return safeError(res, 502, "OAuth provider returned no access token");
      const profileResponse = await fetch(c.userinfo, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!profileResponse.ok) return safeError(res, 502, "OAuth profile request failed");
      const profile = await profileResponse.json() as { sub?: string; id?: string; email?: string; preferred_username?: string; name?: string; given_name?: string; family_name?: string };
      const externalId = profile.sub || profile.id; const email = profile.email || profile.preferred_username;
      if (!externalId || !email) return safeError(res, 422, "OAuth profile did not provide a stable identifier and email");
      const openId = `${provider}:${externalId}`;
      const name = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || email;
      await db.upsertUser({ openId, name, email, loginMethod: provider, lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      return res.redirect(302, `/customer?oauth=complete&provider=${provider}`);
    } catch (error) { console.error(`[OAuth:${provider}] callback failed`, error instanceof Error ? error.message : "unknown error"); return safeError(res, 500, "OAuth callback failed"); }
  });
}
