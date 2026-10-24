import crypto from "node:crypto";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return value || "development-only-session-secret";
}
function sign(value: string) { return crypto.createHmac("sha256", secret()).update(value).digest("base64url"); }
export function createLocalSession(userId: number, authVersion = 0) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${exp}.${authVersion}`;
  return `${payload}.${sign(payload)}`;
}
export function verifyLocalSession(token: string | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  const legacy = parts.length === 3;
  const [userIdText, expText, versionText, signature] = legacy
    ? [parts[0], parts[1], "0", parts[2]]
    : [parts[0], parts[1], parts[2], parts[3]];
  if (!userIdText || !expText || !versionText || !signature || !/^\d+$/.test(userIdText) || !/^\d+$/.test(expText) || !/^\d+$/.test(versionText)) return null;
  const payload = legacy ? `${userIdText}.${expText}` : `${userIdText}.${expText}.${versionText}`;
  const expected = sign(payload);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expText) <= Math.floor(Date.now() / 1000)) return null;
  return { userId: Number(userIdText), expiresAt: Number(expText), authVersion: Number(versionText) };
}
export function getLocalSessionFromRequest(req: Request) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifyLocalSession(cookies[COOKIE_NAME]);
}
export function passwordHash(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${digest}`;
}
export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, expected] = stored.split("$");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 32).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
  const legacyPepper = process.env.PASSWORD_PEPPER;
  if (!legacyPepper) return false;
  const actual = crypto.scryptSync(password, legacyPepper, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
