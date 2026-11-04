import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { assertExactlyOneAffectedRow } from "../db-mutation-guards";
import { balanceLedger, appSettings, opportunityPopupEvents, tradingTierQualificationJobs, v5AuditEvents, workerHealthRegistry } from "../../drizzle/schema";
import { parseTradeGlobalControlPolicy } from "../trading-global-policy";

export const WORKER_HEALTH_REGISTRY = [
  { key: "trading-tier-qualification", label: "Trading tier qualification", description: "Assigns or upgrades tiers from committed qualifying admin-credit jobs.", expectedIntervalMs: 5_000, staleAfterMs: 60_000 },
  { key: "trading-opportunities", label: "Trading opportunities and lifecycle", description: "Runs the bounded automatic opportunity and trade lifecycle cycle.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "settlement-reconciliation", label: "Settlement reconciliation", description: "Marks due records for administrator review; elapsed time alone never confirms or credits a trade.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "settlement-credit-posting", label: "Confirmed trade wallet credits", description: "Posts only administrator-confirmed results after their saved wallet-credit time.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "local-scheduled-jobs", label: "Local scheduled jobs", description: "Claims due application-local scheduled jobs using durable leases.", expectedIntervalMs: 15_000, staleAfterMs: 120_000 },
  { key: "notification-campaigns", label: "Notification campaigns", description: "Processes due and expired notification campaigns.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "email-outbox", label: "Email delivery outbox", description: "Processes queued and retryable email notifications when an email provider is configured.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "daily-digests", label: "Daily digest scheduler", description: "Queues scheduled account digests using the existing preferences and idempotency keys.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "mining-rewards", label: "Mining reward worker", description: "Processes the existing Mining background queue.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "mining-price-feeds", label: "Mining price feeds", description: "Refreshes configured Mining price-feed data.", expectedIntervalMs: 300_000, staleAfterMs: 1_200_000 },
  { key: "popup-retention", label: "Opportunity popup retention", description: "Prunes expired opportunity lifecycle and delivery records under retention policy.", expectedIntervalMs: 3_600_000, staleAfterMs: 10_800_000 },
  { key: "market-data-refresh", label: "Market data refresh", description: "Refreshes the configured market-data cache and eligible opportunity references.", expectedIntervalMs: 7_200_000, staleAfterMs: 14_400_000 },
] as const;

type WorkerKey = typeof WORKER_HEALTH_REGISTRY[number]["key"];
type PersistedStatus = "running" | "healthy" | "degraded";
export type DerivedWorkerStatus = PersistedStatus | "stale" | "not_started";
export type SafeWorkerErrorCode = "POLICY_DISABLED" | "INVALID_SOURCE" | "TIMEOUT" | "DATABASE_CONFLICT" | "DATABASE_UNAVAILABLE" | "PERMISSION_DENIED" | "CUSTOMER_CYCLE_FAILURES" | "WORKER_ERROR";
const qualificationLeaseTtlMs = 5 * 60_000;
export const OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT = 500;
const opportunityDeliverySettingKey = "trade.globalControls";

const instanceId = randomUUID();
let persistenceWarningLogged = false;
const inFlightCycles = new Map<WorkerKey, Promise<unknown>>();

export function sanitizeWorkerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[credentials-redacted]@")
    .replace(/\b(password|passwd|secret|token|authorization|api[_-]?key|credential)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[credential-redacted]")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 1000);
}

/** Map potentially sensitive free-text errors to a small, stable diagnostic vocabulary. */
export function safeWorkerErrorCode(error: unknown): SafeWorkerErrorCode | null {
  if (error == null) return null;
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) return null;
  if (/global tier policy is off/i.test(message)) return "POLICY_DISABLED";
  if (/customer opportunity sub-cycle failures/i.test(message)) return "CUSTOMER_CYCLE_FAILURES";
  if (/source ledger|qualifying attribution|qualification source/i.test(message) && /invalid|no longer|missing|not prove|does not/i.test(message)) return "INVALID_SOURCE";
  if (/permission|access denied|unauthori[sz]ed/i.test(message)) return "PERMISSION_DENIED";
  if (/deadlock|serialization failure|lock wait timeout/i.test(message)) return "DATABASE_CONFLICT";
  if (/timed? out|timeout|etimedout/i.test(message)) return "TIMEOUT";
  if (/database|connection|econn|enotfound|socket|unavailable/i.test(message)) return "DATABASE_UNAVAILABLE";
  return "WORKER_ERROR";
}

export function deriveWorkerHealthStatus(
  input: { status: PersistedStatus | null | undefined; heartbeatAt: Date | string | null | undefined },
  staleAfterMs: number,
  nowMs = Date.now(),
): DerivedWorkerStatus {
  if (!input.status) return "not_started";
  if (input.status === "degraded") return "degraded";
  if (!input.heartbeatAt) return "stale";
  const heartbeatMs = new Date(input.heartbeatAt).getTime();
  if (!Number.isFinite(heartbeatMs) || nowMs - heartbeatMs > staleAfterMs) return "stale";
  return input.status;
}

type CycleEvent = { status: PersistedStatus; durationMs?: number; errorMessage?: string };

async function persistCycleEvent(workerKey: WorkerKey, event: CycleEvent): Promise<void> {
  const definition = WORKER_HEALTH_REGISTRY.find((worker) => worker.key === workerKey);
  if (!definition) return;
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const errorMessage = event.status === "degraded" ? sanitizeWorkerErrorMessage(event.errorMessage ?? "Worker cycle failed") : null;
    await db.insert(workerHealthRegistry).values({
      workerKey,
      instanceId,
      displayName: definition.label,
      status: event.status,
      startedAt: event.status === "running" ? now : null,
      heartbeatAt: now,
      lastSuccessAt: event.status === "healthy" ? now : null,
      lastFailureAt: event.status === "degraded" ? now : null,
      lastDurationMs: event.durationMs ?? null,
      consecutiveFailures: event.status === "degraded" ? 1 : 0,
      lastError: errorMessage,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        displayName: definition.label,
        status: event.status,
        startedAt: event.status === "running" ? now : sql`${workerHealthRegistry.startedAt}`,
        heartbeatAt: now,
        lastSuccessAt: event.status === "healthy" ? now : sql`${workerHealthRegistry.lastSuccessAt}`,
        lastFailureAt: event.status === "degraded" ? now : sql`${workerHealthRegistry.lastFailureAt}`,
        lastDurationMs: event.durationMs === undefined ? sql`${workerHealthRegistry.lastDurationMs}` : event.durationMs,
        consecutiveFailures: event.status === "healthy" ? 0 : event.status === "degraded" ? sql`${workerHealthRegistry.consecutiveFailures} + 1` : sql`${workerHealthRegistry.consecutiveFailures}`,
        lastError: event.status === "healthy" ? null : event.status === "degraded" ? errorMessage : sql`${workerHealthRegistry.lastError}`,
        updatedAt: now,
      },
    });
  } catch (error) {
    // Monitoring failure must not prevent the actual worker from processing its durable work.
    if (!persistenceWarningLogged) {
      persistenceWarningLogged = true;
      console.warn("[WorkerHealth] Heartbeat persistence is unavailable. Verify migration 0084 and database connectivity.", error instanceof Error ? error.name : "UnknownError");
    }
  }
}

/** A successful outer cycle may still contain failed per-customer work. */
export type MonitoredWorkerCycleOptions<T> = {
  degradedWhen?: (result: T) => boolean;
  degradedMessage?: (result: T) => string;
};

/** Prevent overlapping timer ticks from repeating a long-running worker cycle. */
export function runMonitoredWorkerCycle<T>(
  workerKey: WorkerKey,
  task: () => Promise<T>,
  options: MonitoredWorkerCycleOptions<T> = {},
): Promise<T> {
  const current = inFlightCycles.get(workerKey);
  if (current) return current as Promise<T>;
  const cycle = (async () => {
    const startedAt = Date.now();
    await persistCycleEvent(workerKey, { status: "running" });
    try {
      const result = await task();
      if (options.degradedWhen?.(result)) {
        await persistCycleEvent(workerKey, {
          status: "degraded",
          durationMs: Math.max(0, Date.now() - startedAt),
          errorMessage: options.degradedMessage?.(result) ?? "Worker cycle completed with partial failures",
        });
      } else {
        await persistCycleEvent(workerKey, { status: "healthy", durationMs: Math.max(0, Date.now() - startedAt) });
      }
      return result;
    } catch (error) {
      await persistCycleEvent(workerKey, {
        status: "degraded",
        durationMs: Math.max(0, Date.now() - startedAt),
        errorMessage: sanitizeWorkerErrorMessage(error),
      });
      throw error;
    }
  })();
  inFlightCycles.set(workerKey, cycle);
  void cycle.finally(() => {
    if (inFlightCycles.get(workerKey) === cycle) inFlightCycles.delete(workerKey);
  }).catch(() => undefined);
  return cycle;
}

/** Wait for all currently running monitored cycles to settle during shutdown. */
export async function waitForMonitoredWorkerCycles(): Promise<void> {
  while (inFlightCycles.size > 0) {
    await Promise.allSettled([...inFlightCycles.values()]);
  }
}

export type DeadQualificationJob = {
  id: number;
  userId: number;
  sourceLedgerId: number;
  attempts: number;
  lastError: string | null;
  lastErrorCode: SafeWorkerErrorCode | null;
  updatedAt: string | null;
};

export type QualificationQueueDiagnostics = {
  backlog: number;
  oldestPendingCreatedAt: string | null;
  oldestPendingAgeMs: number | null;
  oldestProcessingLease: {
    leaseOwner: null;
    lockedAt: string | null;
    expiresAt: string | null;
    stale: boolean | null;
  } | null;
};

export type OpportunityDeliveryConfiguration = "enabled" | "disabled" | "unavailable";
type OpportunityDeliverySampleRow = { createdAt: Date | string | null; deliveryRetryAfter: Date | string | null };
type OpportunityDeliveryQueueSample = {
  queued: OpportunityDeliverySampleRow[];
  inProgress: OpportunityDeliverySampleRow[];
  retryWait: OpportunityDeliverySampleRow[];
  deadLetter: OpportunityDeliverySampleRow[];
};
export type OpportunityDeliveryQueueDiagnostics = {
  sampleLimit: number;
  sampledCounts: { queued: number; inProgress: number; retryWait: number; deadLetter: number };
  truncated: { queued: boolean; inProgress: boolean; retryWait: boolean; deadLetter: boolean };
  sampledPendingCount: number;
  pendingCountIsLowerBound: boolean;
  dueSampled: { queued: number; retryWait: number; total: number };
  oldestObservedPendingCreatedAt: string | null;
  oldestObservedPendingAgeMs: number | null;
  oldestDueRetryAt: string | null;
  oldestDueRetryLagMs: number | null;
};

/** A missing/malformed canonical setting is unavailable, not evidence that delivery is disabled. */
export function deriveOpportunityDeliveryConfiguration(raw: unknown): OpportunityDeliveryConfiguration {
  const policy = parseTradeGlobalControlPolicy(raw);
  if (!policy) return "unavailable";
  return policy.tierPolicyMasterEnabled && policy.informationalPopupDeliveryEnabled ? "enabled" : "disabled";
}

/** Summarize only a bounded sample; truncation makes counts and ages explicit lower-bound observations. */
export function deriveOpportunityDeliveryQueueDiagnostics(
  input: OpportunityDeliveryQueueSample | null,
  nowMs = Date.now(),
): OpportunityDeliveryQueueDiagnostics | null {
  if (!input) return null;
  const statusRows = { queued: input.queued, inProgress: input.inProgress, retryWait: input.retryWait, deadLetter: input.deadLetter };
  const sampledCounts = Object.fromEntries(Object.entries(statusRows).map(([key, rows]) => [
    key, Math.min(rows.length, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT),
  ])) as OpportunityDeliveryQueueDiagnostics["sampledCounts"];
  const truncated = Object.fromEntries(Object.entries(statusRows).map(([key, rows]) => [
    key, rows.length > OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT,
  ])) as OpportunityDeliveryQueueDiagnostics["truncated"];
  const pendingRows = [
    ...input.queued.slice(0, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT),
    ...input.inProgress.slice(0, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT),
    ...input.retryWait.slice(0, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT),
  ];
  const pendingTimes = pendingRows.map((row) => iso(row.createdAt)).filter((value): value is string => value !== null)
    .map((value) => Date.parse(value)).filter((value) => Number.isFinite(value) && value <= nowMs);
  const oldestObservedPendingMs = pendingTimes.length ? Math.min(...pendingTimes) : null;
  const dueRetryTimes = input.retryWait.slice(0, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT)
    .map((row) => iso(row.deliveryRetryAfter)).filter((value): value is string => value !== null)
    .map((value) => Date.parse(value)).filter((value) => Number.isFinite(value) && value <= nowMs);
  const dueQueued = sampledCounts.queued;
  const dueRetryWait = dueRetryTimes.length;
  const oldestDueRetryMs = dueRetryTimes.length ? Math.min(...dueRetryTimes) : null;
  return {
    sampleLimit: OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT,
    sampledCounts,
    truncated,
    sampledPendingCount: sampledCounts.queued + sampledCounts.inProgress + sampledCounts.retryWait,
    pendingCountIsLowerBound: truncated.queued || truncated.inProgress || truncated.retryWait,
    dueSampled: { queued: dueQueued, retryWait: dueRetryWait, total: dueQueued + dueRetryWait },
    oldestObservedPendingCreatedAt: oldestObservedPendingMs === null ? null : new Date(oldestObservedPendingMs).toISOString(),
    oldestObservedPendingAgeMs: oldestObservedPendingMs === null ? null : nowMs - oldestObservedPendingMs,
    oldestDueRetryAt: oldestDueRetryMs === null ? null : new Date(oldestDueRetryMs).toISOString(),
    oldestDueRetryLagMs: oldestDueRetryMs === null ? null : nowMs - oldestDueRetryMs,
  };
}

export type WorkerHealthSummary = {
  generatedAt: string;
  workers: Array<{
    workerKey: string;
    displayName: string;
    description: string;
    expectedIntervalMs: number;
    staleAfterMs: number;
    instanceId: string;
    status: DerivedWorkerStatus;
    healthRecordAvailable: boolean;
    heartbeatAt: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
    lastErrorCode: SafeWorkerErrorCode | null;
  }>;
  qualificationQueue: { pending: number; processing: number; completed: number; dead: number; total: number } | null;
  qualificationQueueDiagnostics: QualificationQueueDiagnostics | null;
  deadQualificationJobs: DeadQualificationJob[] | null;
  opportunityDelivery: {
    configuration: OpportunityDeliveryConfiguration;
    dispatchMode: "user_scoped_customer_request";
    dedicatedDispatcherHeartbeatAvailable: false;
    opportunityCycle: { status: DerivedWorkerStatus; healthRecordAvailable: boolean; heartbeatAt: string | null };
    queue: OpportunityDeliveryQueueDiagnostics | null;
  };
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Derive age and the queue's existing second-aligned five-minute reclaim threshold from persisted timestamps. */
export function deriveQualificationQueueDiagnostics(
  input: { backlog: number; oldestPendingCreatedAt: Date | string | null | undefined; processingCount: number; oldestProcessingLockedAt: Date | string | null | undefined } | null,
  nowMs = Date.now(),
): QualificationQueueDiagnostics | null {
  if (!input) return null;
  const oldestPendingCreatedAt = iso(input.oldestPendingCreatedAt);
  const pendingMs = oldestPendingCreatedAt ? Date.parse(oldestPendingCreatedAt) : Number.NaN;
  const oldestProcessingLockedAt = iso(input.oldestProcessingLockedAt);
  const lockedMs = oldestProcessingLockedAt ? Date.parse(oldestProcessingLockedAt) : Number.NaN;
  const hasPendingTimestamp = Number.isFinite(pendingMs) && pendingMs <= nowMs;
  const hasLeaseTimestamp = Number.isFinite(lockedMs);
  const lease = input.processingCount <= 0 ? null : {
    leaseOwner: null as null,
    lockedAt: oldestProcessingLockedAt,
    expiresAt: hasLeaseTimestamp ? new Date(lockedMs + qualificationLeaseTtlMs).toISOString() : null,
    stale: hasLeaseTimestamp ? lockedMs < Math.floor(nowMs / 1_000) * 1_000 - qualificationLeaseTtlMs : null,
  };
  return {
    backlog: input.backlog,
    oldestPendingCreatedAt,
    oldestPendingAgeMs: hasPendingTimestamp ? nowMs - pendingMs : null,
    oldestProcessingLease: lease,
  };
}

export async function getWorkerHealthSummary(): Promise<WorkerHealthSummary> {
  const db = await getDb();
  if (!db) throw new Error("Worker health database is unavailable.");
  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60_000);
  // Bound reads at the indexed database query so history cannot grow into a full-table scan.
  const rows = await db.select().from(workerHealthRegistry)
    .where(or(eq(workerHealthRegistry.instanceId, instanceId), gte(workerHealthRegistry.heartbeatAt, since)))
    .orderBy(desc(workerHealthRegistry.heartbeatAt)).limit(500);
  const workers: WorkerHealthSummary["workers"] = rows.map((row) => {
    const definition = WORKER_HEALTH_REGISTRY.find((worker) => worker.key === row.workerKey);
    const staleAfterMs = definition?.staleAfterMs ?? 60_000;
    return {
      workerKey: row.workerKey,
      displayName: row.displayName,
      description: definition?.description ?? "Worker status from a recent server instance.",
      expectedIntervalMs: definition?.expectedIntervalMs ?? 30_000,
      staleAfterMs,
      instanceId: row.instanceId.slice(0, 8),
      status: deriveWorkerHealthStatus({ status: row.status, heartbeatAt: row.heartbeatAt }, staleAfterMs, now),
      healthRecordAvailable: true,
      heartbeatAt: iso(row.heartbeatAt),
      lastAttemptAt: iso(row.startedAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      lastFailureAt: iso(row.lastFailureAt),
      lastDurationMs: row.lastDurationMs == null ? null : Number(row.lastDurationMs),
      consecutiveFailures: Number(row.consecutiveFailures ?? 0),
      lastError: row.lastError ? sanitizeWorkerErrorMessage(row.lastError) : null,
      lastErrorCode: safeWorkerErrorCode(row.lastError),
    };
  });
  for (const definition of WORKER_HEALTH_REGISTRY) {
    if (!rows.some((row) => row.workerKey === definition.key && row.instanceId === instanceId)) {
      workers.push({
        workerKey: definition.key,
        displayName: definition.label,
        description: definition.description,
        expectedIntervalMs: definition.expectedIntervalMs,
        staleAfterMs: definition.staleAfterMs,
        instanceId: instanceId.slice(0, 8),
        status: "not_started",
        healthRecordAvailable: false,
        heartbeatAt: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastDurationMs: null,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorCode: null,
      });
    }
  }

  let qualificationQueue: WorkerHealthSummary["qualificationQueue"] = null;
  let qualificationQueueDiagnostics: WorkerHealthSummary["qualificationQueueDiagnostics"] = null;
  let deadQualificationJobs: WorkerHealthSummary["deadQualificationJobs"] = null;
  try {
    const grouped = await db.select({
      status: tradingTierQualificationJobs.status,
      count: sql<number>`count(*)`,
    }).from(tradingTierQualificationJobs).groupBy(tradingTierQualificationJobs.status);
    qualificationQueue = { pending: 0, processing: 0, completed: 0, dead: 0, total: 0 };
    for (const item of grouped) {
      const count = Number(item.count ?? 0);
      qualificationQueue[item.status] = count;
      qualificationQueue.total += count;
    }
    const [pendingTiming] = await db.select({
      oldestPendingCreatedAt: sql<Date | null>`min(${tradingTierQualificationJobs.createdAt})`,
    }).from(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.status, "pending"));
    const [processingTiming] = await db.select({
      oldestProcessingLockedAt: sql<Date | null>`min(${tradingTierQualificationJobs.lockedAt})`,
    }).from(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.status, "processing"));
    qualificationQueueDiagnostics = deriveQualificationQueueDiagnostics({
      backlog: qualificationQueue.pending,
      oldestPendingCreatedAt: pendingTiming?.oldestPendingCreatedAt,
      processingCount: qualificationQueue.processing,
      oldestProcessingLockedAt: processingTiming?.oldestProcessingLockedAt,
    }, now);
    const deadRows = await db.select({
      id: tradingTierQualificationJobs.id,
      userId: tradingTierQualificationJobs.userId,
      sourceLedgerId: tradingTierQualificationJobs.sourceLedgerId,
      attempts: tradingTierQualificationJobs.attempts,
      lastError: tradingTierQualificationJobs.lastError,
      updatedAt: tradingTierQualificationJobs.updatedAt,
    }).from(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.status, "dead"))
      .orderBy(desc(tradingTierQualificationJobs.updatedAt), desc(tradingTierQualificationJobs.id)).limit(25);
    deadQualificationJobs = deadRows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.userId),
      sourceLedgerId: Number(row.sourceLedgerId),
      attempts: Number(row.attempts),
      lastError: row.lastError ? sanitizeWorkerErrorMessage(row.lastError) : null,
      lastErrorCode: safeWorkerErrorCode(row.lastError),
      updatedAt: iso(row.updatedAt),
    }));
  } catch {
    // Keep worker-health rows available while making a missing or unavailable queue explicit.
    qualificationQueue = null;
    qualificationQueueDiagnostics = null;
    deadQualificationJobs = null;
  }

  let opportunityDeliveryConfiguration: OpportunityDeliveryConfiguration = "unavailable";
  try {
    const [setting] = await db.select({ settingValue: appSettings.settingValue }).from(appSettings)
      .where(eq(appSettings.settingKey, opportunityDeliverySettingKey)).limit(1);
    if (setting) opportunityDeliveryConfiguration = deriveOpportunityDeliveryConfiguration(setting.settingValue);
  } catch {
    // Preserve queue and heartbeat visibility if the global setting cannot be read.
  }

  let opportunityDeliveryQueue: OpportunityDeliveryQueueDiagnostics | null = null;
  try {
    const statuses = ["queued", "in_progress", "retry_wait", "failed"] as const;
    const samples = await Promise.all(statuses.map((status) => db.select({
      createdAt: opportunityPopupEvents.createdAt,
      deliveryRetryAfter: opportunityPopupEvents.deliveryRetryAfter,
    }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.deliveryStatus, status))
      .limit(OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT + 1)));
    opportunityDeliveryQueue = deriveOpportunityDeliveryQueueDiagnostics({
      queued: samples[0],
      inProgress: samples[1],
      retryWait: samples[2],
      deadLetter: samples[3],
    }, now);
  } catch {
    // A missing delivery schema or failed query is unavailable, never an empty queue.
    opportunityDeliveryQueue = null;
  }
  const opportunityCycle = workers.find((worker) => worker.workerKey === "trading-opportunities" && worker.instanceId === instanceId.slice(0, 8));

  return {
    generatedAt: new Date(now).toISOString(),
    workers,
    qualificationQueue,
    qualificationQueueDiagnostics,
    deadQualificationJobs,
    opportunityDelivery: {
      configuration: opportunityDeliveryConfiguration,
      dispatchMode: "user_scoped_customer_request",
      dedicatedDispatcherHeartbeatAvailable: false,
      opportunityCycle: {
        status: opportunityCycle?.status ?? "not_started",
        healthRecordAvailable: opportunityCycle?.healthRecordAvailable ?? false,
        heartbeatAt: opportunityCycle?.heartbeatAt ?? null,
      },
      queue: opportunityDeliveryQueue,
    },
  };
}

export async function requeueDeadQualificationJob(input: { jobId: number; adminId: number; reason: string }) {
  const jobId = Number(input.jobId);
  const adminId = Number(input.adminId);
  const reason = String(input.reason ?? "").trim();
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "A valid qualification job ID is required." });
  if (!Number.isSafeInteger(adminId) || adminId < 1) throw new TRPCError({ code: "UNAUTHORIZED", message: "An authenticated administrator is required." });
  if (reason.length < 8 || reason.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a recovery reason between 8 and 500 characters." });

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Worker recovery database is unavailable." });
  return db.transaction(async (tx) => {
    const job = (await tx.select().from(tradingTierQualificationJobs)
      .where(eq(tradingTierQualificationJobs.id, jobId)).limit(1).for("update"))[0];
    if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Qualification job was not found." });
    if (job.status !== "dead") throw new TRPCError({ code: "CONFLICT", message: "Only a dead-lettered qualification job can be retried." });

    const source = (await tx.select().from(balanceLedger).where(and(
      eq(balanceLedger.id, job.sourceLedgerId),
      eq(balanceLedger.userId, job.userId),
    )).limit(1).for("update"))[0];
    if (!source || source.qualifyingDepositUsdMinor == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The source ledger entry no longer proves a qualifying credit or reversal; no retry was queued." });
    }
    const attributedUsdMinor = Number(source.qualifyingDepositUsdMinor);
    if (!Number.isSafeInteger(attributedUsdMinor)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The source ledger's USD attribution is invalid; no retry was queued." });
    }
    if (source.entryType === "admin_manual_deposit_credit") {
      if (attributedUsdMinor <= 0 || source.qualifyingDepositReversalOfId != null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The qualifying credit attribution is inconsistent; no retry was queued." });
      }
    } else if (source.entryType === "admin_manual_deposit_reversal") {
      if (attributedUsdMinor > 0 || source.qualifyingDepositReversalOfId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The qualifying reversal attribution is inconsistent; no retry was queued." });
      }
      const original = (await tx.select({
        id: balanceLedger.id,
        userId: balanceLedger.userId,
        entryType: balanceLedger.entryType,
        qualifyingDepositUsdMinor: balanceLedger.qualifyingDepositUsdMinor,
      }).from(balanceLedger).where(and(
        eq(balanceLedger.id, source.qualifyingDepositReversalOfId),
        eq(balanceLedger.userId, job.userId),
      )).limit(1).for("update"))[0];
      const originalUsdMinor = Number(original?.qualifyingDepositUsdMinor);
      if (!original || original.entryType !== "admin_manual_deposit_credit" || !Number.isSafeInteger(originalUsdMinor) || originalUsdMinor <= 0 || Math.abs(attributedUsdMinor) > originalUsdMinor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The reversal does not match a valid original qualifying credit; no retry was queued." });
      }
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The source ledger entry is not an eligible qualifying event." });
    }

    // Match the worker lease precision so a newly requeued job is immediately due.
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const update = await tx.update(tradingTierQualificationJobs).set({
      status: "pending",
      attempts: 0,
      availableAt: now,
      lockedAt: null,
      lastError: null,
      updatedAt: now,
    }).where(and(
      eq(tradingTierQualificationJobs.id, jobId),
      eq(tradingTierQualificationJobs.status, "dead"),
    ));
    assertExactlyOneAffectedRow(update, "Requeue dead Trading qualification job");
    await tx.insert(v5AuditEvents).values({
      actorUserId: adminId,
      action: "trading_tier_qualification_job.requeued",
      entityType: "trading_tier_qualification_job",
      entityId: String(jobId),
      reason,
      reference: String(job.sourceLedgerId),
      metadataJson: JSON.stringify({
        sourceLedgerId: Number(job.sourceLedgerId),
        userId: Number(job.userId),
        previousAttempts: Number(job.attempts),
        previousStatus: job.status,
      }),
    });
    return { success: true, jobId, sourceLedgerId: Number(job.sourceLedgerId), status: "pending" as const };
  });
}
