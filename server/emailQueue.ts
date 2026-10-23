import crypto from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { sendRenderedEmail, isEmailDeliveryConfigured, renderEmail, isValidEmailAddress, type EmailPayload, type EmailTemplate } from "./email";
import { authEmailTokens, customerControls, customerEmailPreferences, customerNotifications, emailOutbox, balanceLedger, users } from "../drizzle/schema";

function encryptionKey(secret = process.env.SESSION_SECRET): Buffer {
  if (!secret && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required to encrypt queued email payloads");
  return crypto.createHash("sha256").update(`wisebond-email-outbox:${secret || "development-only-email-key"}`).digest();
}

export function encryptEmailPayload(payload: EmailPayload, secret?: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptEmailPayload(value: string, secret?: string): EmailPayload {
  const [ivText, tagText, bodyText] = value.split(".");
  if (!ivText || !tagText || !bodyText) throw new Error("Invalid encrypted email payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const json = Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(json) as EmailPayload;
}

export async function enqueueEmail(to: string, template: EmailTemplate, payload: EmailPayload, idempotencyKey: string) {
  if (!isValidEmailAddress(to)) throw new Error("Invalid email recipient");
  if (!idempotencyKey || idempotencyKey.length > 190) throw new Error("Invalid email idempotency key");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(emailOutbox).values({ recipient: to.trim().toLowerCase(), templateKey: template, encryptedPayload: encryptEmailPayload(payload), idempotencyKey })
    .onDuplicateKeyUpdate({ set: { idempotencyKey } });
  return { queued: true, idempotencyKey };
}

async function canEmailUser(userId: number, preference: "systemAlerts" | "transactionAlerts" | "dailyTradingReports" | "adminMessages") {
  const db = await getDb();
  if (!db) return null;
  const user = (await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user?.email || !isValidEmailAddress(user.email)) return null;
  const control = (await db.select({ emailVerified: customerControls.emailVerified }).from(customerControls).where(eq(customerControls.userId, userId)).limit(1))[0];
  if (!control?.emailVerified) return null;
  const prefs = (await db.select().from(customerEmailPreferences).where(eq(customerEmailPreferences.userId, userId)).limit(1))[0];
  if (preference !== "adminMessages" && prefs && prefs[preference] === false) return null;
  return { id: user.id, email: user.email, role: user.role };
}

export async function enqueueSystemNotificationEmail(userId: number, title: string, body: string, key: string) {
  const user = await canEmailUser(userId, "systemAlerts");
  if (!user) return { queued: false, reason: "recipient_unverified_or_opted_out" };
  return enqueueEmail(user.email!, "system_notification", { title, body }, `system:${userId}:${key}`);
}

export async function enqueueWalletAdjustmentEmail(userId: number, mode: "credit" | "debit", amount: string | number, currency: string, reference: string) {
  const user = await canEmailUser(userId, "transactionAlerts");
  if (!user) return { queued: false, reason: "recipient_unverified_or_opted_out" };
  return enqueueEmail(user.email!, "wallet_adjustment", { mode, amount, currency, reference }, `wallet-adjustment:${reference}`);
}

export async function enqueueAdminMessage(userId: number, subject: string, body: string, idempotencyKey: string = crypto.randomUUID()) {
  const user = await canEmailUser(userId, "adminMessages");
  if (!user || user.role !== "user") throw new Error("Customer email must be verified before admin messaging");
  return enqueueEmail(user.email!, "admin_message", { subject, body }, `admin-message:${idempotencyKey}`);
}

export async function sendEmailTest(userId: number) {
  if (!isEmailDeliveryConfigured()) throw new Error("SMTP is not configured; no test email was queued");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = (await db.select({ email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user?.email || (user.role === "user" && !(await canEmailUser(userId, "systemAlerts")))) throw new Error("A verified email recipient is required");
  return enqueueEmail(user.email, "email_test", { testId: crypto.randomUUID() }, `email-test:${userId}:${crypto.randomUUID()}`);
}

export async function getCustomerEmailPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  let row = (await db.select().from(customerEmailPreferences).where(eq(customerEmailPreferences.userId, userId)).limit(1))[0];
  if (!row) {
    await db.insert(customerEmailPreferences).values({ userId });
    row = (await db.select().from(customerEmailPreferences).where(eq(customerEmailPreferences.userId, userId)).limit(1))[0];
  }
  return row;
}

export async function updateCustomerEmailPreferences(userId: number, input: { dailyTradingReports?: boolean; systemAlerts?: boolean; transactionAlerts?: boolean; adminMessages?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await getCustomerEmailPreferences(userId);
  await db.update(customerEmailPreferences).set(input).where(eq(customerEmailPreferences.userId, userId));
  return getCustomerEmailPreferences(userId);
}

export function getDailyDigestSchedule(env: NodeJS.ProcessEnv = process.env) {
  const time = env.EMAIL_DAILY_DIGEST_TIME?.trim() || "";
  const timezone = env.EMAIL_DAILY_DIGEST_TIMEZONE?.trim() || "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !timezone) return null;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date()); }
  catch { return null; }
  return { time, timezone };
}

export function getZonedMinute(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value || "00";
  return { dateKey: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export async function enqueueDailyDigests(now = new Date(), schedule = getDailyDigestSchedule()) {
  if (!schedule || !isEmailDeliveryConfigured()) return 0;
  const local = getZonedMinute(now, schedule.timezone);
  if (local.time !== schedule.time) return 0;
  const db = await getDb();
  if (!db) return 0;
  const customers = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "user"));
  let queued = 0;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  for (const customer of customers) {
    if (!customer.email) continue;
    const control = (await db.select({ emailVerified: customerControls.emailVerified }).from(customerControls).where(eq(customerControls.userId, customer.id)).limit(1))[0];
    if (!control?.emailVerified) continue;
    const pref = (await db.select().from(customerEmailPreferences).where(eq(customerEmailPreferences.userId, customer.id)).limit(1))[0];
    if (pref?.dailyTradingReports === false) continue;
    const activity = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(and(eq(balanceLedger.userId, customer.id), gte(balanceLedger.createdAt, since)));
    const unread = await db.select({ id: customerNotifications.id }).from(customerNotifications).where(and(eq(customerNotifications.userId, customer.id), isNull(customerNotifications.readAt)));
    const result = await enqueueEmail(customer.email, "daily_digest", { date: local.dateKey, timezone: schedule.timezone, activityCount: activity.length, unreadCount: unread.length }, `daily-digest:${customer.id}:${local.dateKey}`);
    if (result.queued) queued++;
  }
  return queued;
}

const retryDelaysMs = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
let flushing = false;
export async function flushEmailOutbox(limit = 20) {
  if (flushing || !isEmailDeliveryConfigured()) return { sent: 0, failed: 0 };
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  const now = new Date();
  try {
    const claimable = or(
      inArray(emailOutbox.status, ["QUEUED", "RETRYING"]),
      and(eq(emailOutbox.status, "PROCESSING"), or(isNull(emailOutbox.leaseUntil), lte(emailOutbox.leaseUntil, now))),
    );
    const rows = await db.select().from(emailOutbox).where(and(claimable, lte(emailOutbox.nextAttemptAt, now))).orderBy(emailOutbox.createdAt).limit(Math.max(1, Math.min(limit, 100)));
    for (const row of rows) {
      const eligible = or(
        inArray(emailOutbox.status, ["QUEUED", "RETRYING"]),
        and(eq(emailOutbox.status, "PROCESSING"), or(isNull(emailOutbox.leaseUntil), lte(emailOutbox.leaseUntil, now))),
      );
      const claim = await db.update(emailOutbox).set({ status: "PROCESSING", attempts: sql`${emailOutbox.attempts} + 1`, leaseUntil: new Date(Date.now() + 120_000) }).where(and(eq(emailOutbox.id, row.id), eligible, lte(emailOutbox.nextAttemptAt, now)));
      const affected = Number((claim as any)?.[0]?.affectedRows ?? (claim as any)?.affectedRows ?? 0);
      if (affected !== 1) continue;
      const attempt = Number(row.attempts) + 1;
      try {
        const rendered = renderEmail(row.templateKey as EmailTemplate, decryptEmailPayload(row.encryptedPayload));
        const result = await sendRenderedEmail(row.recipient, rendered);
        await db.update(emailOutbox).set({ status: "SENT", encryptedPayload: "", providerMessageId: result.messageId || null, sentAt: new Date(), leaseUntil: null, lastError: null }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "PROCESSING")));
        sent++;
      } catch (error) {
        const terminal = attempt >= 5;
        const retryDelay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)];
        const safeError = error instanceof Error ? error.name.slice(0, 120) : "DeliveryError";
        await db.update(emailOutbox).set({ status: terminal ? "FAILED" : "RETRYING", nextAttemptAt: terminal ? now : new Date(Date.now() + retryDelay), leaseUntil: null, lastError: safeError }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "PROCESSING")));
        if (terminal) failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

let emailWorkerTimer: NodeJS.Timeout | null = null;
export function startEmailWorkers() {
  if (emailWorkerTimer) return;
  emailWorkerTimer = setInterval(() => {
    void flushEmailOutbox().catch(error => console.error("[Email] Outbox worker failed:", error instanceof Error ? error.name : "UnknownError"));
    void enqueueDailyDigests().catch(error => console.error("[Email] Daily digest scheduler failed:", error instanceof Error ? error.name : "UnknownError"));
  }, 30_000);
  emailWorkerTimer.unref();
}
