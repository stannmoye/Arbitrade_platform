import crypto from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { passwordHash } from "./_core/localAuth";
import { authEmailTokens, customerControls, users } from "../drizzle/schema";
import { enqueueEmail } from "./emailQueue";
import { isEmailDeliveryConfigured } from "./email";

export type AuthEmailPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET";
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function generateOneTimeCode() {
  return crypto.randomInt(0, 100_000_000).toString().padStart(8, "0");
}
export function hashOneTimeCode(code: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
}
export function isWithinResendCooldown(lastRequestedAt: Date, now = new Date()) {
  return now.getTime() - lastRequestedAt.getTime() < RESEND_COOLDOWN_MS;
}
export function canAttemptOneTimeCode(attempts: number) {
  return Number.isInteger(attempts) && attempts >= 0 && attempts < MAX_ATTEMPTS;
}
function codeMatches(code: string, salt: string, expected: string) {
  const actual = Buffer.from(hashOneTimeCode(code, salt), "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

async function issueCode(userId: number, purpose: AuthEmailPurpose) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = (await db.select({ id: users.id, email: users.email, loginMethod: users.loginMethod, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user?.email) return { issued: false, delivered: false };
  if (purpose === "PASSWORD_RESET" && (!user.passwordHash || !["password", "email"].includes(user.loginMethod || ""))) return { issued: false, delivered: false };
  if (!(await isEmailDeliveryConfigured())) return { issued: false, delivered: false };
  const previous = (await db.select().from(authEmailTokens).where(and(eq(authEmailTokens.userId, userId), eq(authEmailTokens.purpose, purpose))).limit(1))[0];
  const now = new Date();
  if (previous && isWithinResendCooldown(previous.lastRequestedAt, now)) return { issued: false, delivered: false, throttled: true };
  const code = generateOneTimeCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(now.getTime() + (purpose === "EMAIL_VERIFY" ? 15 : 30) * 60_000);
  await db.insert(authEmailTokens).values({ userId, purpose, tokenSalt: salt, tokenHash: hashOneTimeCode(code, salt), expiresAt, attempts: 0, lastRequestedAt: now, consumedAt: null })
    .onDuplicateKeyUpdate({ set: { tokenSalt: salt, tokenHash: hashOneTimeCode(code, salt), expiresAt, attempts: 0, lastRequestedAt: now, consumedAt: null } });
  const template = purpose === "EMAIL_VERIFY" ? "email_verification" : "password_reset";
  await enqueueEmail(user.email, template, { code }, `auth-code:${purpose.toLowerCase()}:${userId}:${now.getTime()}`);
  return { issued: true, delivered: true };
}

export async function requestEmailVerification(userId: number) {
  return issueCode(userId, "EMAIL_VERIFY");
}

export async function confirmEmailVerification(userId: number, code: string) {
  if (!/^\d{8}$/.test(code)) throw new Error("The verification code is invalid or expired");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = (await db.select().from(authEmailTokens).where(and(eq(authEmailTokens.userId, userId), eq(authEmailTokens.purpose, "EMAIL_VERIFY"))).limit(1))[0];
  const now = new Date();
  if (!row || row.consumedAt || row.expiresAt <= now || !canAttemptOneTimeCode(row.attempts)) throw new Error("The verification code is invalid or expired");
  if (!codeMatches(code, row.tokenSalt, row.tokenHash)) {
    await db.update(authEmailTokens).set({ attempts: sql`${authEmailTokens.attempts} + 1` }).where(and(eq(authEmailTokens.id, row.id), isNull(authEmailTokens.consumedAt), gt(authEmailTokens.expiresAt, now), lt(authEmailTokens.attempts, MAX_ATTEMPTS)));
    throw new Error("The verification code is invalid or expired");
  }
  await db.transaction(async tx => {
    const consumed = await tx.update(authEmailTokens).set({ consumedAt: now }).where(and(eq(authEmailTokens.id, row.id), isNull(authEmailTokens.consumedAt), gt(authEmailTokens.expiresAt, now), lt(authEmailTokens.attempts, MAX_ATTEMPTS)));
    if (Number((consumed as any)?.[0]?.affectedRows ?? (consumed as any)?.affectedRows ?? 0) !== 1) throw new Error("The verification code is invalid or expired");
    const control = (await tx.select({ userId: customerControls.userId }).from(customerControls).where(eq(customerControls.userId, userId)).limit(1))[0];
    if (control) await tx.update(customerControls).set({ emailVerified: true }).where(eq(customerControls.userId, userId));
    else await tx.insert(customerControls).values({ userId, emailVerified: true });
  });
  return { success: true };
}

export async function requestPasswordReset(email: string) {
  const db = await getDb();
  if (!db) return { accepted: true };
  const normalized = email.trim().toLowerCase();
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1))[0];
  if (user) {
    try { await issueCode(user.id, "PASSWORD_RESET"); } catch (error) { console.error("[Email] Password reset enqueue failed:", error instanceof Error ? error.name : "UnknownError"); }
  }
  return { accepted: true };
}

export async function resetPasswordWithCode(email: string, code: string, newPassword: string) {
  if (newPassword.length < 12 || newPassword.length > 200) throw new Error("Password must be between 12 and 200 characters");
  if (!/^\d{8}$/.test(code)) throw new Error("The reset code is invalid or expired");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = (await db.select({ id: users.id, loginMethod: users.loginMethod, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1))[0];
  if (!user?.passwordHash || !["password", "email"].includes(user.loginMethod || "")) throw new Error("The reset code is invalid or expired");
  const row = (await db.select().from(authEmailTokens).where(and(eq(authEmailTokens.userId, user.id), eq(authEmailTokens.purpose, "PASSWORD_RESET"))).limit(1))[0];
  const now = new Date();
  if (!row || row.consumedAt || row.expiresAt <= now || !canAttemptOneTimeCode(row.attempts)) throw new Error("The reset code is invalid or expired");
  if (!codeMatches(code, row.tokenSalt, row.tokenHash)) {
    await db.update(authEmailTokens).set({ attempts: sql`${authEmailTokens.attempts} + 1` }).where(and(eq(authEmailTokens.id, row.id), isNull(authEmailTokens.consumedAt), gt(authEmailTokens.expiresAt, now), lt(authEmailTokens.attempts, MAX_ATTEMPTS)));
    throw new Error("The reset code is invalid or expired");
  }
  const nextHash = passwordHash(newPassword);
  await db.transaction(async tx => {
    const consumed = await tx.update(authEmailTokens).set({ consumedAt: now }).where(and(eq(authEmailTokens.id, row.id), isNull(authEmailTokens.consumedAt), gt(authEmailTokens.expiresAt, now), lt(authEmailTokens.attempts, MAX_ATTEMPTS)));
    if (Number((consumed as any)?.[0]?.affectedRows ?? (consumed as any)?.affectedRows ?? 0) !== 1) throw new Error("The reset code is invalid or expired");
    await tx.update(users).set({ passwordHash: nextHash, authVersion: sql`${users.authVersion} + 1`, updatedAt: now }).where(eq(users.id, user.id));
    await tx.update(authEmailTokens).set({ consumedAt: now }).where(and(eq(authEmailTokens.userId, user.id), eq(authEmailTokens.purpose, "EMAIL_VERIFY")));
  });
  return { success: true };
}
