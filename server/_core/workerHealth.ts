import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { tradingTierQualificationJobs, workerHealthRegistry } from "../../drizzle/schema";

export const WORKER_HEALTH_REGISTRY = [
  { key: "trading-tier-qualification", label: "Trading tier qualification", description: "Assigns or upgrades tiers from committed qualifying admin-credit jobs.", expectedIntervalMs: 5_000, staleAfterMs: 60_000 },
  { key: "trading-opportunities", label: "Trading opportunities and lifecycle", description: "Runs the bounded automatic opportunity and trade lifecycle cycle.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "settlement-reconciliation", label: "Settlement reconciliation", description: "Marks due records for confirmation; elapsed time alone never settles or credits a trade.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
  { key: "local-scheduled-jobs", label: "Local scheduled jobs", description: "Claims due application-local scheduled jobs using durable leases.", expectedIntervalMs: 15_000, staleAfterMs: 120_000 },
  { key: "notification-campaigns", label: "Notification campaigns", description: "Processes due and expired notification campaigns.", expectedIntervalMs: 30_000, staleAfterMs: 180_000 },
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

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]")
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
    const errorMessage = event.status === "degraded" ? safeErrorMessage(event.errorMessage ?? "Worker cycle failed") : null;
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

export async function runMonitoredWorkerCycle<T>(workerKey: WorkerKey, task: () => Promise<T>): Promise<T> {
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
      errorMessage: safeErrorMessage(error),
    });
    throw error;
  }
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
    heartbeatAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
  }>;
  qualificationQueue: { pending: number; processing: number; completed: number; dead: number; total: number } | null;
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
  const rows = await db.select().from(workerHealthRegistry).orderBy(workerHealthRegistry.workerKey, workerHealthRegistry.heartbeatAt);
  const visibleRows = rows.filter((row) => row.instanceId === instanceId || (iso(row.heartbeatAt) !== null && new Date(row.heartbeatAt).getTime() >= since.getTime()));
  const workers: WorkerHealthSummary["workers"] = visibleRows.map((row) => {
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
      lastError: row.lastError,
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
  } catch {
    // Keep worker-health rows available while making a missing or unavailable queue explicit.
    qualificationQueue = null;
  }

  return { generatedAt: new Date(now).toISOString(), workers, qualificationQueue };
}
