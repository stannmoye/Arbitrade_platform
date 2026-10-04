import crypto from "node:crypto";
import type { Request } from "express";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
function secret() {
  const value = process.env.SESSION_SECRET || process.env.MANUS_JWT_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return value || "development-only-session-secret";
}
function sign(value: string) { return crypto.createHmac("sha256", secret()).update(value).digest("base64url"); }
export function createLocalSession(userId: number) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
export function verifyLocalSession(token: string | undefined) {
  if (!token) return null;
  const [userIdText, expText, signature] = token.split(".");
  if (!userIdText || !expText || !signature || !/^\d+$/.test(userIdText) || !/^\d+$/.test(expText)) return null;
  const payload = `${userIdText}.${expText}`;
  const expected = sign(payload);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expText) <= Math.floor(Date.now() / 1000)) return null;
  return { userId: Number(userIdText), expiresAt: Number(expText) };
}
export function getLocalSessionFromRequest(req: Request) {
  const raw = req.headers.cookie?.match(/(?:^|;\s*)webdev_app_session=([^;]+)/)?.[1];
  return verifyLocalSession(raw);
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
  const legacyPepper = process.env.PASSWORD_PEPPER || "arbitrade-local-pepper";
  const actual = crypto.scryptSync(password, legacyPepper, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
