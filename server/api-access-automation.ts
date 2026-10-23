import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import {
  apiNotificationDeliveries,
  apiPlatformIncidents,
  customerApiNotificationPreferences,
  customerApiWebhooks,
} from "../drizzle/schema";
import { createNotification, getAppSetting, getDb } from "./db";
import { decryptVaultValue, encryptVaultValue, readApiProviderCredential } from "./api-access-vault";

export const API_AUTOMATION_EVENTS = [
  "deposit.confirmed",
  "deposit.delayed",
  "deposit.failed",
  "withdrawal.status",
  "trade.completed",
  "daily.activity",
  "daily.statement",
  "tax.report.ready",
  "fee.recorded",
  "fee.summary",
  "report.ready",
  "platform.status",
  "security.alert",
  "api.key.created",
  "api.key.revoked",
] as const;
export type ApiAutomationEvent = typeof API_AUTOMATION_EVENTS[number];
type Channel = "in_app" | "whatsapp" | "webhook";
type PreferenceInput = {
  whatsappNumber: string;
  whatsappOptIn: boolean;
  whatsappEvents: ApiAutomationEvent[];
  inAppEnabled: boolean;
  dailySummaryEnabled: boolean;
  dailyStatementEnabled: boolean;
  feeSummaryEnabled: boolean;
  securityAlertsEnabled: boolean;
  timezone: string;
  dailyReportTime: string;
};
const DEFAULT_PREFERENCES: PreferenceInput = {
  whatsappNumber: "",
  whatsappOptIn: false,
  whatsappEvents: [],
  inAppEnabled: true,
  dailySummaryEnabled: false,
  dailyStatementEnabled: false,
  feeSummaryEnabled: false,
  securityAlertsEnabled: true,
  timezone: "Africa/Lagos",
  dailyReportTime: "08:00",
};

function parseEvents(value: string | null | undefined): ApiAutomationEvent[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is ApiAutomationEvent =>
      typeof item === "string" && (API_AUTOMATION_EVENTS as readonly string[]).includes(item)))];
  } catch { return []; }
}

function preferenceView(row: typeof customerApiNotificationPreferences.$inferSelect | undefined) {
  if (!row) return { ...DEFAULT_PREFERENCES, whatsappVerified: false };
  return {
    whatsappNumber: row.whatsappNumber,
    whatsappOptIn: row.whatsappOptIn,
    whatsappVerified: Boolean(row.whatsappVerifiedAt),
    whatsappVerifiedAt: row.whatsappVerifiedAt,
    whatsappEvents: parseEvents(row.whatsappEventsJson),
    inAppEnabled: row.inAppEnabled,
    dailySummaryEnabled: row.dailySummaryEnabled,
    dailyStatementEnabled: row.dailyStatementEnabled,
    feeSummaryEnabled: row.feeSummaryEnabled,
    securityAlertsEnabled: row.securityAlertsEnabled,
    timezone: row.timezone,
    dailyReportTime: row.dailyReportTime,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCustomerApiNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const row = (await db.select().from(customerApiNotificationPreferences)
    .where(eq(customerApiNotificationPreferences.userId, userId)).limit(1))[0];
  return preferenceView(row);
}

export async function saveCustomerApiNotificationPreferences(userId: number, input: PreferenceInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const phone = input.whatsappNumber.replace(/[\s()-]/g, "");
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Enter a WhatsApp number in international format, such as +2348012345678.");
  }
  if (input.whatsappOptIn && !phone) throw new Error("Enter a WhatsApp number before enabling WhatsApp notifications.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dailyReportTime)) throw new Error("Choose a valid daily report time.");
  try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(new Date()); }
  catch { throw new Error("Choose a valid IANA time zone."); }
  const old = (await db.select().from(customerApiNotificationPreferences)
    .where(eq(customerApiNotificationPreferences.userId, userId)).limit(1))[0];
  const phoneChanged = Boolean(old && old.whatsappNumber !== phone);
  const safeEvents = [...new Set(input.whatsappEvents)].filter((item) =>
    (API_AUTOMATION_EVENTS as readonly string[]).includes(item));
  const values = {
    userId,
    whatsappNumber: phone,
    whatsappOptIn: input.whatsappOptIn,
    whatsappVerifiedAt: phoneChanged ? null : (old?.whatsappVerifiedAt ?? null),
    whatsappVerificationCodeHash: phoneChanged ? null : (old?.whatsappVerificationCodeHash ?? null),
    whatsappVerificationExpiresAt: phoneChanged ? null : (old?.whatsappVerificationExpiresAt ?? null),
    whatsappVerificationSentAt: phoneChanged ? null : (old?.whatsappVerificationSentAt ?? null),
    whatsappVerificationAttempts: phoneChanged ? 0 : (old?.whatsappVerificationAttempts ?? 0),
    whatsappEventsJson: JSON.stringify(safeEvents),
    inAppEnabled: input.inAppEnabled,
    dailySummaryEnabled: input.dailySummaryEnabled,
    dailyStatementEnabled: input.dailyStatementEnabled,
    feeSummaryEnabled: input.feeSummaryEnabled,
    securityAlertsEnabled: input.securityAlertsEnabled,
    timezone: input.timezone,
    dailyReportTime: input.dailyReportTime,
  };
  await db.insert(customerApiNotificationPreferences).values(values).onDuplicateKeyUpdate({
    set: {
      whatsappNumber: values.whatsappNumber,
      whatsappOptIn: values.whatsappOptIn,
      whatsappVerifiedAt: values.whatsappVerifiedAt,
      whatsappVerificationCodeHash: values.whatsappVerificationCodeHash,
      whatsappVerificationExpiresAt: values.whatsappVerificationExpiresAt,
      whatsappVerificationSentAt: values.whatsappVerificationSentAt,
      whatsappVerificationAttempts: values.whatsappVerificationAttempts,
      whatsappEventsJson: values.whatsappEventsJson,
      inAppEnabled: values.inAppEnabled,
      dailySummaryEnabled: values.dailySummaryEnabled,
      dailyStatementEnabled: values.dailyStatementEnabled,
      feeSummaryEnabled: values.feeSummaryEnabled,
      securityAlertsEnabled: values.securityAlertsEnabled,
      timezone: values.timezone,
      dailyReportTime: values.dailyReportTime,
      updatedAt: new Date(),
    },
  });
  return getCustomerApiNotificationPreferences(userId);
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 0 && c === 0)))
    || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    || (a === 203 && b === 0 && c === 113)
    || (a === 100 && b >= 64 && b <= 127);
}
function isPublicAddress(address: string) {
  if (isIP(address) === 4) return !isPrivateIpv4(address);
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (normalized.startsWith("2") || normalized.startsWith("3"))
      && !normalized.startsWith("2001:db8:");
  }
  return false;
}
async function validateWebhookUrl(rawUrl: string) {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Enter a valid webhook URL."); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port && parsed.port !== "443"
    || isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".example")) {
    throw new Error("Webhook URLs must use public HTTPS domains on the standard HTTPS port.");
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error("The webhook hostname could not be verified. Check the public DNS records and try again."); }
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
    throw new Error("The webhook hostname resolves to a private or reserved network address and cannot be used.");
  }
  return parsed.toString();
}

export async function listCustomerApiWebhooks(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const rows = await db.select({
    id: customerApiWebhooks.id,
    name: customerApiWebhooks.name,
    endpointUrl: customerApiWebhooks.endpointUrl,
    eventsJson: customerApiWebhooks.eventsJson,
    createdAt: customerApiWebhooks.createdAt,
    revokedAt: customerApiWebhooks.revokedAt,
    lastDeliveredAt: customerApiWebhooks.lastDeliveredAt,
    lastResponseCode: customerApiWebhooks.lastResponseCode,
    lastErrorCode: customerApiWebhooks.lastErrorCode,
  }).from(customerApiWebhooks).where(eq(customerApiWebhooks.userId, userId))
    .orderBy(desc(customerApiWebhooks.createdAt), desc(customerApiWebhooks.id)).limit(50);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    endpointUrl: row.endpointUrl,
    events: parseEvents(row.eventsJson),
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    status: row.revokedAt ? "revoked" as const : "active" as const,
    lastDeliveredAt: row.lastDeliveredAt,
    lastResponseCode: row.lastResponseCode,
    lastErrorCode: row.lastErrorCode,
  }));
}

export async function createCustomerApiWebhook(userId: number, name: string, rawUrl: string, events: ApiAutomationEvent[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const normalizedName = name.trim();
  if (normalizedName.length < 3 || normalizedName.length > 80) throw new Error("Webhook name must contain 3–80 characters.");
  const normalizedUrl = await validateWebhookUrl(rawUrl);
  const selectedEvents = [...new Set(events)].filter((event) =>
    (API_AUTOMATION_EVENTS as readonly string[]).includes(event));
  if (!selectedEvents.length) throw new Error("Select at least one webhook event.");
  const count = (await db.select().from(customerApiWebhooks)
    .where(and(eq(customerApiWebhooks.userId, userId), isNull(customerApiWebhooks.revokedAt))).limit(21)).length;
  if (count >= 20) throw new Error("You can have at most 20 active webhooks per customer.");
  const secret = "whsec_" + crypto.randomBytes(32).toString("base64url");
  const result = await db.insert(customerApiWebhooks).values({
    userId,
    name: normalizedName,
    endpointUrl: normalizedUrl,
    eventsJson: JSON.stringify(selectedEvents),
    secretCiphertext: encryptVaultValue(secret),
  });
  const id = Number(result[0].insertId);
  return {
    webhook: { id, name: normalizedName, endpointUrl: normalizedUrl, events: selectedEvents, status: "active" as const },
    secret,
    warning: "Copy this webhook signing secret now. It is encrypted for delivery and will not be shown again.",
  };
}

export async function revokeCustomerApiWebhook(userId: number, webhookId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const result = await db.update(customerApiWebhooks).set({ revokedAt: new Date() })
    .where(and(eq(customerApiWebhooks.id, webhookId), eq(customerApiWebhooks.userId, userId), isNull(customerApiWebhooks.revokedAt)));
  return { success: true, alreadyRevoked: false, result };
}

function hashDedupe(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function insertDelivery(userId: number, eventKey: ApiAutomationEvent, channel: Channel, payload: Record<string, unknown>, identity: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const dedupeKey = hashDedupe([userId, eventKey, channel, identity].join(":"));
  try {
    await db.insert(apiNotificationDeliveries).values({
      userId, eventKey, channel, status: "queued", payloadJson: JSON.stringify(payload),
      dedupeKey, nextAttemptAt: new Date(),
    });
  } catch (error) {
    // A duplicate outbox key means this exact event already exists; do not fan it out twice.
    if (!(error instanceof Error) || !/duplicate|unique/i.test(error.message)) throw error;
  }
}

export async function enqueueCustomerApiEvent(userId: number, eventKey: ApiAutomationEvent, payload: Record<string, unknown>, identity?: string) {
  if (!(API_AUTOMATION_EVENTS as readonly string[]).includes(eventKey)) throw new Error("Unsupported API automation event.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const row = (await db.select().from(customerApiNotificationPreferences)
    .where(eq(customerApiNotificationPreferences.userId, userId)).limit(1))[0];
  const prefs = preferenceView(row);
  const eventId = identity || (typeof payload.reference === "string" ? payload.reference : typeof payload.eventId === "string" ? payload.eventId : crypto.randomUUID());
  const envelope = { id: eventId, type: eventKey, createdAt: new Date().toISOString(), data: payload };
  if (prefs.inAppEnabled) await insertDelivery(userId, eventKey, "in_app", envelope, eventId);
  const specialEnabled = eventKey === "daily.activity" ? prefs.dailySummaryEnabled
    : eventKey === "daily.statement" ? prefs.dailyStatementEnabled
    : eventKey === "fee.summary" ? prefs.feeSummaryEnabled
    : eventKey === "security.alert" ? prefs.securityAlertsEnabled : false;
  if (prefs.whatsappOptIn && prefs.whatsappVerified && prefs.whatsappNumber
      && (prefs.whatsappEvents.includes(eventKey) || specialEnabled)) {
    await insertDelivery(userId, eventKey, "whatsapp", envelope, eventId);
  }
  const hooks = await db.select().from(customerApiWebhooks)
    .where(and(eq(customerApiWebhooks.userId, userId), isNull(customerApiWebhooks.revokedAt))).limit(20);
  for (const hook of hooks) {
    if (!parseEvents(hook.eventsJson).includes(eventKey)) continue;
    await insertDelivery(userId, eventKey, "webhook", { ...envelope, webhookId: hook.id }, eventId + ":webhook:" + hook.id);
  }
  return { eventId, queued: true };
}

function interpolateTemplate(template: string, data: Record<string, unknown>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    return typeof value === "string" || typeof value === "number" ? String(value).slice(0, 500) : "";
  }).slice(0, 3000);
}
function eventTitle(eventKey: string) {
  const labels: Record<string, string> = {
    "deposit.confirmed": "Deposit confirmed",
    "deposit.delayed": "Deposit update",
    "deposit.failed": "Deposit status changed",
    "withdrawal.status": "Withdrawal status update",
    "trade.completed": "Trade history update",
    "daily.activity": "Daily activity summary",
    "daily.statement": "Statement update",
    "tax.report.ready": "Tax-support report update",
    "fee.recorded": "Fee record update",
    "fee.summary": "Fee summary",
    "report.ready": "Report ready",
    "platform.status": "Platform status update",
    "security.alert": "Security alert",
    "api.key.created": "API key created",
    "api.key.revoked": "API key revoked",
  };
  return labels[eventKey] || "Account update";
}
function jsonSetting(value: string | null, fallback: Record<string, unknown>) {
  try { return { ...fallback, ...JSON.parse(value || "{}") }; } catch { return fallback; }
}

async function sendMetaWhatsApp(recipient: string, message: string) {
  const credentials = await readApiProviderCredential("whatsapp_meta");
  if (!credentials?.accessToken || !credentials.phoneNumberId) throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  const settings = jsonSetting(await getAppSetting("apiAccess.settings"), {});
  if (settings.whatsappEnabled !== true) throw new Error("WHATSAPP_POLICY_DISABLED");
  const version = /^v\d+\.\d+$/.test(credentials.graphApiVersion || "") ? credentials.graphApiVersion! : "v22.0";
  const response = await fetch("https://graph.facebook.com/" + version + "/" + encodeURIComponent(credentials.phoneNumberId) + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + credentials.accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: message },
    }),
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(response.status >= 500 ? "WHATSAPP_PROVIDER_TEMPORARY_ERROR" : "WHATSAPP_PROVIDER_REJECTED");
}

async function deliverWebhook(payload: Record<string, unknown>) {
  const webhookId = Number(payload.webhookId);
  if (!Number.isSafeInteger(webhookId) || webhookId <= 0) throw new Error("WEBHOOK_CONFIGURATION_MISSING");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const hook = (await db.select().from(customerApiWebhooks).where(eq(customerApiWebhooks.id, webhookId)).limit(1))[0];
  if (!hook || hook.revokedAt) throw new Error("WEBHOOK_REVOKED");
  const endpoint = await validateWebhookUrl(hook.endpointUrl);
  const envelope = { id: payload.id, type: payload.type, createdAt: payload.createdAt, data: payload.data };
  const body = JSON.stringify(envelope);
  const secret = decryptVaultValue(hook.secretCiphertext);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arbitrade-Event": String(payload.type || "unknown"),
      "X-Arbitrade-Signature": "sha256=" + signature,
      "Idempotency-Key": String(payload.id || ""),
    },
    body,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  await db.update(customerApiWebhooks).set({
    lastDeliveredAt: response.ok ? new Date() : hook.lastDeliveredAt,
    lastResponseCode: response.status,
    lastErrorCode: response.ok ? null : response.status >= 500 ? "WEBHOOK_SERVER_ERROR" : "WEBHOOK_REJECTED",
  }).where(eq(customerApiWebhooks.id, webhookId));
  if (!response.ok) throw new Error(response.status >= 500 ? "WEBHOOK_SERVER_ERROR" : "WEBHOOK_REJECTED");
}

async function processOneDelivery(id: number) {
  const db = await getDb();
  if (!db) return;
  const row = await db.transaction(async (tx) => {
    const found = (await tx.select().from(apiNotificationDeliveries)
      .where(eq(apiNotificationDeliveries.id, id)).limit(1).for("update"))[0];
    if (!found || found.status !== "queued" || found.nextAttemptAt > new Date()) return null;
    await tx.update(apiNotificationDeliveries).set({
      status: "sending", attempts: found.attempts + 1, lastAttemptAt: new Date(), errorCode: null,
    }).where(eq(apiNotificationDeliveries.id, id));
    return { ...found, attempts: found.attempts + 1 };
  });
  if (!row) return;
  try {
    const payload: Record<string, unknown> = JSON.parse(row.payloadJson);
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    if (row.channel === "in_app") {
      await createNotification(row.userId, eventTitle(row.eventKey),
        "An update is available in your account. Sign in to view the details.", {
          eventKey: "api-automation:" + row.dedupeKey,
          category: row.eventKey.includes("withdrawal") ? "withdrawal" : row.eventKey.includes("deposit") ? "deposit" : "account",
          priority: row.eventKey === "security.alert" ? "high" : "normal",
          href: "/customer",
        });
    } else if (row.channel === "whatsapp") {
      const prefs = await getCustomerApiNotificationPreferences(row.userId);
      if (!prefs.whatsappOptIn || !prefs.whatsappVerified || !prefs.whatsappNumber) throw new Error("WHATSAPP_DESTINATION_NOT_VERIFIED");
      const setting = jsonSetting(await getAppSetting("apiAccess.settings"), {});
      const templates = (setting.templates && typeof setting.templates === "object" ? setting.templates : {}) as Record<string, string>;
      const templateKey = row.eventKey.replace(/[^a-z0-9]+/gi, "_");
      const defaultText = eventTitle(row.eventKey) + ". Sign in to your secure account to review details.";
      const template = typeof templates[templateKey] === "string" && templates[templateKey].trim() ? templates[templateKey] : defaultText;
      const enriched = { ...data, customer_name: typeof data.customer_name === "string" ? data.customer_name : "Customer", event: eventTitle(row.eventKey), status_url: "", secure_link: "" };
      await sendMetaWhatsApp(prefs.whatsappNumber, interpolateTemplate(template, enriched));
    } else if (row.channel === "webhook") {
      await deliverWebhook(payload);
    }
    await db.update(apiNotificationDeliveries).set({ status: "sent", sentAt: new Date(), errorCode: null })
      .where(eq(apiNotificationDeliveries.id, row.id));
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "DELIVERY_FAILED";
    const retryable = !/NOT_CONFIGURED|POLICY_DISABLED|NOT_VERIFIED|REVOKED|REJECTED|private|reserved/i.test(code) && row.attempts < 5;
    await db.update(apiNotificationDeliveries).set({
      status: retryable ? "queued" : "failed",
      errorCode: code,
      nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 15_000 * (2 ** Math.min(row.attempts, 7)))),
    }).where(eq(apiNotificationDeliveries.id, row.id));
  }
}

async function enqueueDailySchedules() {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(customerApiNotificationPreferences).limit(5000);
  const now = new Date();
  for (const row of rows) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: row.timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(now);
      const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
      const localDate = part("year") + "-" + part("month") + "-" + part("day");
      const localTime = part("hour") + ":" + part("minute");
      if (localTime !== row.dailyReportTime || row.lastDailyReportDate === localDate) continue;
      await db.update(customerApiNotificationPreferences).set({ lastDailyReportDate: localDate })
        .where(and(eq(customerApiNotificationPreferences.id, row.id), eq(customerApiNotificationPreferences.lastDailyReportDate, row.lastDailyReportDate)));
      if (row.dailySummaryEnabled) await enqueueCustomerApiEvent(row.userId, "daily.activity", { reportDate: localDate, message: "Your daily account activity summary is ready. Sign in to review the latest activity." }, "daily-activity:" + localDate);
      if (row.dailyStatementEnabled) await enqueueCustomerApiEvent(row.userId, "daily.statement", { reportDate: localDate, message: "Your daily account statement is ready. Sign in to review your statement." }, "daily-statement:" + localDate);
      if (row.feeSummaryEnabled) await enqueueCustomerApiEvent(row.userId, "fee.summary", { reportDate: localDate, message: "Your fee summary is ready. Sign in to review available fee records." }, "fee-summary:" + localDate);
    } catch (error) {
      console.error("[API automation] Daily schedule skipped:", error instanceof Error ? error.name : "UnknownError");
    }
  }
}

let workerRunning = false;
export async function processApiNotificationOutbox() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await enqueueDailySchedules();
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const due = await db.select({ id: apiNotificationDeliveries.id })
      .from(apiNotificationDeliveries)
      .where(and(eq(apiNotificationDeliveries.status, "queued"), lte(apiNotificationDeliveries.nextAttemptAt, now)))
      .orderBy(asc(apiNotificationDeliveries.id)).limit(25);
    for (const item of due) await processOneDelivery(item.id);
  } catch (error) {
    console.error("[API automation] Outbox worker failed:", error instanceof Error ? error.name : "UnknownError");
  } finally {
    workerRunning = false;
  }
}

export async function listCustomerApiNotificationHistory(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  return db.select({
    id: apiNotificationDeliveries.id,
    eventKey: apiNotificationDeliveries.eventKey,
    channel: apiNotificationDeliveries.channel,
    status: apiNotificationDeliveries.status,
    attempts: apiNotificationDeliveries.attempts,
    lastAttemptAt: apiNotificationDeliveries.lastAttemptAt,
    sentAt: apiNotificationDeliveries.sentAt,
    errorCode: apiNotificationDeliveries.errorCode,
    createdAt: apiNotificationDeliveries.createdAt,
  }).from(apiNotificationDeliveries).where(eq(apiNotificationDeliveries.userId, userId))
    .orderBy(desc(apiNotificationDeliveries.createdAt), desc(apiNotificationDeliveries.id)).limit(100);
}

export async function listApiPlatformIncidents() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  return db.select().from(apiPlatformIncidents).orderBy(desc(apiPlatformIncidents.createdAt), desc(apiPlatformIncidents.id)).limit(100);
}
