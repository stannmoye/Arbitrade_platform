import crypto from "node:crypto";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb, getUserById } from "../db";
import { localScheduledJobs } from "../../drizzle/schema";
import { verifyLocalSession } from "./localAuth";

export type HeartbeatJob = {
  name: string;
  /** Six-field UTC cron (sec min hour dom mon dow); runs at second zero. */
  cron: string;
  /** An application-local callback path, e.g. /api/scheduled/reconcile. */
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};
export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & { enable?: boolean };
export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

type CronField = { min: number; max: number; values: Set<number> };
const CRON_RANGES: Array<[number, number]> = [[0, 59], [0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function parseCronField(raw: string, min: number, max: number, normalizeDow = false): CronField {
  if (!raw) throw new TRPCError({ code: "BAD_REQUEST", message: "Cron fields cannot be empty." });
  const values = new Set<number>();
  for (const item of raw.split(",")) {
    const match = /^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/.exec(item);
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid cron field: ${raw}` });
    const step = Number(match[2] || 1);
    if (!Number.isSafeInteger(step) || step < 1 || step > max - min + 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Cron step is outside the supported range." });
    let start = min;
    let end = max;
    if (match[1] !== "*") {
      const bounds = match[1].split("-").map(Number);
      start = bounds[0];
      end = bounds.length === 2 ? bounds[1] : bounds[0];
    }
    if (start < min || end > max || start > end) throw new TRPCError({ code: "BAD_REQUEST", message: `Cron field values must be between ${min} and ${max}.` });
    for (let value = start; value <= end; value += step) {
      values.add(normalizeDow && value === 7 ? 0 : value);
    }
  }
  return { min, max, values };
}

function parseCron(expression: string): CronField[] {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 6) throw new TRPCError({ code: "BAD_REQUEST", message: "Cron must contain six UTC fields: sec min hour dom mon dow." });
  const fields = parts.map((part, index) => parseCronField(part, ...CRON_RANGES[index], index === 5));
  if (fields[0].values.size !== 1 || !fields[0].values.has(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Local schedules must run at second zero and cannot repeat more often than once per minute." });
  }
  return fields;
}

function matchesCron(date: Date, fields: CronField[]): boolean {
  const values = [date.getUTCSeconds(), date.getUTCMinutes(), date.getUTCHours(), date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
  const [seconds, minutes, hours, days, months, weekdays] = fields;
  const dayMatches = days.values.has(values[3]);
  const weekdayMatches = weekdays.values.has(values[5]);
  const dayFieldWildcard = days.values.size === days.max - days.min + 1;
  const weekdayFieldWildcard = weekdays.values.size === weekdays.max - weekdays.min + 1;
  const calendarMatch = dayFieldWildcard ? weekdayMatches : weekdayFieldWildcard ? dayMatches : dayMatches || weekdayMatches;
  return seconds.values.has(values[0]) && minutes.values.has(values[1]) && hours.values.has(values[2]) && months.values.has(values[4]) && calendarMatch;
}

export function computeNextExecution(expression: string, after = new Date()): Date {
  const fields = parseCron(expression);
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  // A bounded search prevents invalid/sparse cron schedules from looping forever.
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matchesCron(candidate, fields)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "No matching cron time found within the next year." });
}

function validateCallbackPath(value: string): string {
  if (!/^\/api\/scheduled\/[a-zA-Z0-9/_-]{1,480}$/.test(value) || value.includes("..") || value.includes("//")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Callback path must be a local /api/scheduled/... path without traversal or query parameters." });
  }
  return value;
}

function serializePayload(payload: unknown): string {
  let value: string;
  try { value = JSON.stringify(payload === undefined ? {} : payload); }
  catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled job payload must be JSON-serializable." }); }
  if (value === undefined || Buffer.byteLength(value, "utf8") > 64 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled job payload must be at most 64 KiB of JSON." });
  return value;
}

async function resolveActor(sessionToken: string): Promise<number> {
  if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "A local session is required to manage scheduled jobs." });
  const session = verifyLocalSession(sessionToken);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "A valid local session is required to manage scheduled jobs." });
  const user = await getUserById(session.userId);
  if (!user || user.loginMethod === "closed" || Number(user.authVersion ?? 0) !== Number(session.authVersion ?? 0)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "The local account or session is no longer active." });
  }
  return user.id;
}

function toJobInfo(row: typeof localScheduledJobs.$inferSelect): HeartbeatJobInfo {
  return {
    taskUid: row.taskUid,
    name: row.name,
    userId: String(row.ownerUserId),
    description: row.description,
    cronExpression: row.cronExpression,
    callbackPath: row.callbackPath,
    callbackMethod: row.callbackMethod,
    callbackPayload: row.callbackPayload,
    isEnable: row.isEnable,
    createdAt: row.createdAt?.toISOString() ?? null,
    lastExecutedAt: row.lastExecutedAt?.toISOString() ?? null,
    nextExecutionAt: row.nextExecutionAt?.toISOString() ?? null,
  };
}

export async function createHeartbeatJob(job: HeartbeatJob, userSession = ""): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Arbitrade database is not available." });
  if (!job.name?.trim() || job.name.trim().length > 160) throw new TRPCError({ code: "BAD_REQUEST", message: "Job name must be between 1 and 160 characters." });
  const callbackPath = validateCallbackPath(job.path);
  if (job.method && job.method !== "POST" && job.method !== "PUT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only POST and PUT callback methods are supported." });
  const nextExecutionAt = computeNextExecution(job.cron);
  const taskUid = crypto.randomUUID();
  const ownerUserId = await resolveActor(userSession);
  await db.insert(localScheduledJobs).values({
    taskUid, ownerUserId, name: job.name.trim(), cronExpression: job.cron.trim(), callbackPath,
    callbackMethod: job.method ?? "POST", callbackPayload: serializePayload(job.payload),
    description: (job.description ?? "").trim().slice(0, 1000), isEnable: true, nextExecutionAt,
  });
  return { taskUid, nextExecutionAt: nextExecutionAt.toISOString() };
}

export async function updateHeartbeatJob(taskUid: string, patch: HeartbeatJobUpdate, userSession = ""): Promise<{ nextExecutionAt?: string | null }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Arbitrade database is not available." });
  const ownerUserId = await resolveActor(userSession);
  const whereOwner = and(eq(localScheduledJobs.taskUid, taskUid), eq(localScheduledJobs.ownerUserId, ownerUserId));
  const current = (await db.select().from(localScheduledJobs).where(whereOwner).limit(1))[0];
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled job not found." });
  const values: Partial<typeof localScheduledJobs.$inferInsert> = { updatedAt: new Date() };
  if (patch.cron !== undefined) {
    values.cronExpression = patch.cron.trim();
    values.nextExecutionAt = computeNextExecution(values.cronExpression, new Date());
  }
  if (patch.path !== undefined) values.callbackPath = validateCallbackPath(patch.path);
  if (patch.method !== undefined) {
    if (patch.method !== "POST" && patch.method !== "PUT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only POST and PUT callback methods are supported." });
    values.callbackMethod = patch.method;
  }
  if (patch.payload !== undefined) values.callbackPayload = serializePayload(patch.payload);
  if (patch.description !== undefined) values.description = patch.description.trim().slice(0, 1000);
  if (patch.enable !== undefined) {
    values.isEnable = patch.enable;
    values.nextExecutionAt = patch.enable ? computeNextExecution(values.cronExpression ?? current.cronExpression, new Date()) : null;
    values.lockedUntil = null;
  }
  await db.update(localScheduledJobs).set(values).where(whereOwner);
  const next = values.nextExecutionAt ?? (values.isEnable === false ? null : current.nextExecutionAt);
  return { nextExecutionAt: next?.toISOString() ?? null };
}

export async function deleteHeartbeatJob(taskUid: string, userSession = ""): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Arbitrade database is not available." });
  const ownerUserId = await resolveActor(userSession);
  const whereOwner = and(eq(localScheduledJobs.taskUid, taskUid), eq(localScheduledJobs.ownerUserId, ownerUserId));
  await db.delete(localScheduledJobs).where(whereOwner);
}

export async function listHeartbeatJobs(userSession = "", pagination?: { page?: number; pageSize?: number }): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Arbitrade database is not available." });
  const ownerUserId = await resolveActor(userSession);
  const whereOwner = eq(localScheduledJobs.ownerUserId, ownerUserId);
  const page = Math.max(1, Math.floor(pagination?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination?.pageSize ?? 20)));
  const rows = await db.select().from(localScheduledJobs).where(whereOwner).orderBy(localScheduledJobs.createdAt).limit(pageSize).offset((page - 1) * pageSize);
  const totals = await db.select({ id: localScheduledJobs.id }).from(localScheduledJobs).where(whereOwner);
  return { total: totals.length, actorUserId: String(ownerUserId), jobs: rows.map(toJobInfo) };
}

function callbackSignature(taskUid: string, timestamp: string, body: string): string {
  const key = process.env.SESSION_SECRET;
  if (!key && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required to sign scheduled callbacks.");
  return crypto.createHmac("sha256", key || "development-only-session-secret").update(`${taskUid}.${timestamp}.${body}`).digest("hex");
}

/** Callback routes can use this to authenticate scheduler-originated requests. */
export function verifyScheduledCallback(taskUid: string, timestamp: string, body: string, signature: string): boolean {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;
  try {
    const expected = callbackSignature(taskUid, timestamp, body);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;
export async function runDueHeartbeatJobs(now = new Date(), limit = 20): Promise<{ claimed: number; succeeded: number; failed: number }> {
  if (workerRunning) return { claimed: 0, succeeded: 0, failed: 0 };
  const db = await getDb();
  if (!db) return { claimed: 0, succeeded: 0, failed: 0 };
  workerRunning = true;
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  try {
    const due = await db.select().from(localScheduledJobs).where(and(eq(localScheduledJobs.isEnable, true), lte(localScheduledJobs.nextExecutionAt, now), or(isNull(localScheduledJobs.lockedUntil), lte(localScheduledJobs.lockedUntil, now)))).orderBy(localScheduledJobs.nextExecutionAt).limit(Math.max(1, Math.min(100, limit)));
    for (const job of due) {
      const leaseUntil = new Date(Date.now() + 120_000);
      const claim = await db.update(localScheduledJobs).set({ lockedUntil: leaseUntil, lastStatus: "RUNNING", lastError: null, updatedAt: new Date() }).where(and(eq(localScheduledJobs.id, job.id), eq(localScheduledJobs.isEnable, true), lte(localScheduledJobs.nextExecutionAt, now), or(isNull(localScheduledJobs.lockedUntil), lte(localScheduledJobs.lockedUntil, now))));
      const affectedRows = Number((claim as any)?.[0]?.affectedRows ?? (claim as any)?.affectedRows ?? 0);
      if (affectedRows !== 1) continue;
      claimed++;
      const timestamp = String(Date.now());
      try {
        const body = job.callbackPayload || "{}";
        const signature = callbackSignature(job.taskUid, timestamp, body);
        const port = Number(process.env.PORT || "3000");
        const endpoint = new URL(job.callbackPath, `http://127.0.0.1:${port}`);
        const response = await fetch(endpoint, {
          method: job.callbackMethod,
          headers: {
            "content-type": "application/json",
            "x-arbitrade-scheduled-job": job.taskUid,
            "x-arbitrade-scheduled-at": timestamp,
            "x-arbitrade-scheduled-signature": signature,
          },
          body,
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Callback returned HTTP ${response.status}`);
        const next = computeNextExecution(job.cronExpression, new Date());
        await db.update(localScheduledJobs).set({
          nextExecutionAt: next, lastExecutedAt: new Date(), lockedUntil: null,
          executionCount: sql`${localScheduledJobs.executionCount} + 1`, lastStatus: "SUCCEEDED", lastError: null, updatedAt: new Date(),
        }).where(eq(localScheduledJobs.id, job.id));
        succeeded++;
      } catch (error) {
        let next: Date | null = null;
        try { next = computeNextExecution(job.cronExpression, new Date()); } catch {}
        await db.update(localScheduledJobs).set({
          nextExecutionAt: next, lastExecutedAt: new Date(), lockedUntil: null,
          executionCount: sql`${localScheduledJobs.executionCount} + 1`, lastStatus: "FAILED",
          lastError: (error instanceof Error ? error.message : "Callback failure").replace(/[\r\n]/g, " ").slice(0, 1000),
          updatedAt: new Date(),
        }).where(eq(localScheduledJobs.id, job.id));
        failed++;
        console.error("[LocalScheduler] Callback failed", { taskUid: job.taskUid, error: error instanceof Error ? error.name : "UnknownError" });
      }
    }
  } finally {
    workerRunning = false;
  }
  return { claimed, succeeded, failed };
}

export function startHeartbeatWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void runDueHeartbeatJobs().catch((error) => console.error("[LocalScheduler] Worker cycle failed:", error instanceof Error ? error.name : "UnknownError"));
  }, 15_000);
  workerTimer.unref();
}
