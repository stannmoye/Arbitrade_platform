import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { assertExactlyOneAffectedRow } from "../db-mutation-guards";
import { balanceLedger, tradingTierQualificationJobs, v5AuditEvents, workerHealthRegistry } from "../../drizzle/schema";

export const WORKER_HEALTH_REGISTRY = [
  { key: "trading-tier-qualification", label: "Trading tier qualification", description: "Assigns or upgrades tiers from committed qualifying admin-credit jobs.", expectedIntervalMs: 5_000, staleAfterMs: 60_000 },
  { key: "trading-opportunities", label: "Trading opportunities and lifecycle", description: "Runs the bounded automatic opportunity and trade lifecycle cycle.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "settlement-reconciliation", label: "Settlement reconciliation", description: "Marks due records for confirmation; elapsed time alone never settles or credits a trade.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
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

/** Prevent overlapping timer ticks from repeating a long-running worker cycle. */
export function runMonitoredWorkerCycle<T>(workerKey: WorkerKey, task: () => Promise<T>): Promise<T> {
  const current = inFlightCycles.get(workerKey);
  if (current) return current as Promise<T>;
  const cycle = (async () => {
    const startedAt = Date.now();
    await persistCycleEvent(workerKey, { status: "running" });
    try {
      const result = await task();
      await persistCycleEvent(workerKey, { status: "healthy", durationMs: Math.max(0, Date.now() - startedAt) });
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

export type DeadQualificationJob = {
  id: number;
  userId: number;
  sourceLedgerId: number;
  attempts: number;
  lastError: string | null;
  updatedAt: string | null;
};

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
    heartbeatAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
  }>;
  qualificationQueue: { pending: number; processing: number; completed: number; dead: number; total: number } | null;
  deadQualificationJobs: DeadQualificationJob[] | null;
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
      heartbeatAt: iso(row.heartbeatAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      lastFailureAt: iso(row.lastFailureAt),
      lastDurationMs: row.lastDurationMs == null ? null : Number(row.lastDurationMs),
      consecutiveFailures: Number(row.consecutiveFailures ?? 0),
      lastError: row.lastError ? sanitizeWorkerErrorMessage(row.lastError) : null,
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
        heartbeatAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastDurationMs: null,
        consecutiveFailures: 0,
        lastError: null,
      });
    }
  }

  let qualificationQueue: WorkerHealthSummary["qualificationQueue"] = null;
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
      updatedAt: iso(row.updatedAt),
    }));
  } catch {
    // Keep worker-health rows available while making a missing or unavailable queue explicit.
    qualificationQueue = null;
    deadQualificationJobs = null;
  }

  return { generatedAt: new Date(now).toISOString(), workers, qualificationQueue, deadQualificationJobs };
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

    const now = new Date();
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
