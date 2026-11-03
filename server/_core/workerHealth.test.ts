import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveOpportunityDeliveryConfiguration,
  deriveOpportunityDeliveryQueueDiagnostics,
  deriveQualificationQueueDiagnostics,
  deriveWorkerHealthStatus,
  OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT,
  safeWorkerErrorCode,
  sanitizeWorkerErrorMessage,
} from "./workerHealth";
import { FAIL_CLOSED_TRADE_GLOBAL_CONTROLS } from "../trading-global-policy";

const workerHealthSource = readFileSync(new URL("./workerHealth.ts", import.meta.url), "utf8");
const workerAdminUiSource = readFileSync(new URL("../../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("deriveWorkerHealthStatus", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  const threshold = 60_000;

  it("reports workers that have not run as not_started", () => {
    expect(deriveWorkerHealthStatus({ status: null, heartbeatAt: null }, threshold, now)).toBe("not_started");
  });

  it("keeps a recent successful cycle healthy", () => {
    expect(deriveWorkerHealthStatus({ status: "healthy", heartbeatAt: new Date(now - 5_000) }, threshold, now)).toBe("healthy");
  });

  it("marks a previously healthy worker stale when its heartbeat expires", () => {
    expect(deriveWorkerHealthStatus({ status: "healthy", heartbeatAt: new Date(now - threshold - 1) }, threshold, now)).toBe("stale");
  });

  it("preserves degraded status until a successful cycle completes", () => {
    expect(deriveWorkerHealthStatus({ status: "degraded", heartbeatAt: new Date(now - 10_000) }, threshold, now)).toBe("degraded");
  });

  it("marks an abandoned running cycle stale after its health window", () => {
    expect(deriveWorkerHealthStatus({ status: "running", heartbeatAt: new Date(now - threshold - 1) }, threshold, now)).toBe("stale");
  });
});


describe("sanitizeWorkerErrorMessage", () => {
  it("removes connection credentials and common secret fields from errors", () => {
    const message = sanitizeWorkerErrorMessage(
      "mysql://user:password@db.example/app password=hunter2 Bearer abc.def.ghi API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
    );
    expect(message).not.toContain("user:password");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("abc.def.ghi");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(message).toContain("[redacted]");
  });
});

describe("deriveQualificationQueueDiagnostics", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");

  it("derives pending age and the processing reclaim threshold from persisted timestamps", () => {
    const diagnostics = deriveQualificationQueueDiagnostics({
      backlog: 3,
      oldestPendingCreatedAt: new Date(now - 12 * 60_000),
      processingCount: 2,
      oldestProcessingLockedAt: new Date(now - 6 * 60_000),
    }, now);
    expect(diagnostics).toEqual({
      backlog: 3,
      oldestPendingCreatedAt: new Date(now - 12 * 60_000).toISOString(),
      oldestPendingAgeMs: 12 * 60_000,
      oldestProcessingLease: {
        leaseOwner: null,
        lockedAt: new Date(now - 6 * 60_000).toISOString(),
        expiresAt: new Date(now - 60_000).toISOString(),
        stale: true,
      },
    });
  });

  it("represents an empty queue as an observed zero without fabricating pending age or a lease", () => {
    expect(deriveQualificationQueueDiagnostics({
      backlog: 0,
      oldestPendingCreatedAt: null,
      processingCount: 0,
      oldestProcessingLockedAt: null,
    }, now)).toEqual({
      backlog: 0,
      oldestPendingCreatedAt: null,
      oldestPendingAgeMs: null,
      oldestProcessingLease: null,
    });
  });

  it("keeps a recent processing lease fresh and does not invent a lease owner", () => {
    const diagnostics = deriveQualificationQueueDiagnostics({
      backlog: 0,
      oldestPendingCreatedAt: null,
      processingCount: 1,
      oldestProcessingLockedAt: new Date(now - 30_000),
    }, now);
    expect(diagnostics?.oldestProcessingLease).toMatchObject({
      leaseOwner: null,
      expiresAt: new Date(now + 270_000).toISOString(),
      stale: false,
    });
  });

  it("matches the queue worker's second-aligned reclaim threshold at the lease boundary", () => {
    const subsecondNow = now + 900;
    const diagnostics = deriveQualificationQueueDiagnostics({
      backlog: 0,
      oldestPendingCreatedAt: null,
      processingCount: 1,
      oldestProcessingLockedAt: new Date(now - 5 * 60_000 + 500),
    }, subsecondNow);
    expect(diagnostics?.oldestProcessingLease?.stale).toBe(false);
  });

  it("returns unavailable rather than zero when queue metrics cannot be read", () => {
    expect(deriveQualificationQueueDiagnostics(null, now)).toBeNull();
  });

  it("does not infer an age or expiry when the corresponding stored timestamp is missing", () => {
    expect(deriveQualificationQueueDiagnostics({
      backlog: 1,
      oldestPendingCreatedAt: null,
      processingCount: 1,
      oldestProcessingLockedAt: null,
    }, now)).toEqual({
      backlog: 1,
      oldestPendingCreatedAt: null,
      oldestPendingAgeMs: null,
      oldestProcessingLease: { leaseOwner: null, lockedAt: null, expiresAt: null, stale: null },
    });
  });
});

describe("opportunity delivery configuration and queue diagnostics", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  const policy = { ...FAIL_CLOSED_TRADE_GLOBAL_CONTROLS, policyVersion: 1, updatedBy: 7, updatedAt: null };
  const queueRow = (minutesAgo: number, retryMinutesAgo: number | null = null) => ({
    createdAt: new Date(now - minutesAgo * 60_000),
    deliveryRetryAfter: retryMinutesAgo === null ? null : new Date(now + retryMinutesAgo * 60_000),
  });

  it("distinguishes configured delivery from stale or absent runtime evidence", () => {
    expect(deriveOpportunityDeliveryConfiguration({ ...policy, tierPolicyMasterEnabled: true, informationalPopupDeliveryEnabled: true })).toBe("enabled");
    expect(deriveOpportunityDeliveryConfiguration({ ...policy, tierPolicyMasterEnabled: false, informationalPopupDeliveryEnabled: true })).toBe("disabled");
    expect(deriveOpportunityDeliveryConfiguration(null)).toBe("unavailable");
    expect(deriveOpportunityDeliveryConfiguration("malformed")).toBe("unavailable");
    expect(deriveWorkerHealthStatus({ status: "healthy", heartbeatAt: new Date(now - 181_000) }, 180_000, now)).toBe("stale");
  });

  it("returns unavailable rather than zero when delivery queue rows cannot be read", () => {
    expect(deriveOpportunityDeliveryQueueDiagnostics(null, now)).toBeNull();
  });

  it("reports sampled queued, active, retry-wait, dead-letter, due and lag evidence", () => {
    const diagnostics = deriveOpportunityDeliveryQueueDiagnostics({
      queued: [queueRow(18), queueRow(7)],
      inProgress: [queueRow(9)],
      retryWait: [queueRow(24, -5), queueRow(4, -2), queueRow(3, 20)],
      deadLetter: [queueRow(40)],
    }, now);
    expect(diagnostics).toMatchObject({
      sampledCounts: { queued: 2, inProgress: 1, retryWait: 3, deadLetter: 1 },
      truncated: { queued: false, inProgress: false, retryWait: false, deadLetter: false },
      sampledPendingCount: 6,
      pendingCountIsLowerBound: false,
      dueSampled: { queued: 2, retryWait: 2, total: 4 },
      oldestObservedPendingCreatedAt: new Date(now - 24 * 60_000).toISOString(),
      oldestObservedPendingAgeMs: 24 * 60_000,
      oldestDueRetryAt: new Date(now - 5 * 60_000).toISOString(),
      oldestDueRetryLagMs: 5 * 60_000,
    });
  });

  it("caps backlog observations and marks them as lower bounds when a status sample overflows", () => {
    const queued = Array.from({ length: OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT + 1 }, (_, index) => queueRow(index + 1));
    const diagnostics = deriveOpportunityDeliveryQueueDiagnostics({ queued, inProgress: [], retryWait: [], deadLetter: [] }, now);
    expect(diagnostics?.sampledCounts.queued).toBe(OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
    expect(diagnostics?.truncated.queued).toBe(true);
    expect(diagnostics?.sampledPendingCount).toBe(OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
    expect(diagnostics?.pendingCountIsLowerBound).toBe(true);
  });

  it("does not infer retry due time, age, or lag from missing and future timestamps", () => {
    const diagnostics = deriveOpportunityDeliveryQueueDiagnostics({
      queued: [{ createdAt: null, deliveryRetryAfter: null }],
      inProgress: [],
      retryWait: [{ createdAt: null, deliveryRetryAfter: null }, { createdAt: new Date(now + 60_000), deliveryRetryAfter: new Date(now + 60_000) }],
      deadLetter: [],
    }, now);
    expect(diagnostics).toMatchObject({
      dueSampled: { queued: 1, retryWait: 0, total: 1 },
      oldestObservedPendingCreatedAt: null,
      oldestObservedPendingAgeMs: null,
      oldestDueRetryAt: null,
      oldestDueRetryLagMs: null,
    });
  });
});

describe("safeWorkerErrorCode", () => {
  it("maps known operational failures to bounded codes instead of returning error text", () => {
    expect(safeWorkerErrorCode("Global tier policy is OFF; retained for review")).toBe("POLICY_DISABLED");
    expect(safeWorkerErrorCode("Source ledger attribution is invalid; no retry queued")).toBe("INVALID_SOURCE");
    expect(safeWorkerErrorCode("database connection unavailable at mysql://user:secret@host/db")).toBe("DATABASE_UNAVAILABLE");
    expect(safeWorkerErrorCode("request timed out after 30 seconds")).toBe("TIMEOUT");
    expect(safeWorkerErrorCode("password=hunter2 opaque failure")).toBe("WORKER_ERROR");
    expect(safeWorkerErrorCode(null)).toBeNull();
  });
});

describe("worker health snapshot safety contract", () => {
  it("keeps diagnostics read-only and outside wallet, ledger, settlement and payout effects", () => {
    const start = workerHealthSource.indexOf("export async function getWorkerHealthSummary()");
    const end = workerHealthSource.indexOf("export async function requeueDeadQualificationJob", start);
    const snapshot = workerHealthSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(snapshot).not.toMatch(/\.(?:insert|update|delete|transaction)\s*\(/);
    expect(snapshot).not.toMatch(/balanceLedger|wallet|settlement|payout/i);
  });

  it("preserves unavailable monitor records in CSV and print/PDF exports", () => {
    expect(workerAdminUiSource).toContain('worker.healthRecordAvailable === true');
    expect(workerAdminUiSource).toContain('["Worker", "Runtime record"');
    expect(workerAdminUiSource).toContain('worker.consecutiveFailures ?? "Not recorded" : "Unavailable"');
    expect(workerAdminUiSource).toContain("const workers = workerRows.map");
    expect(workerAdminUiSource).toContain("<th>Safe error code</th>");
    expect(workerAdminUiSource).toContain("Oldest pending job age since creation");
  });

  it("keeps opportunity queue diagnostics read-only, capped, and explicit about request-scoped dispatch", () => {
    const start = workerHealthSource.indexOf("export async function getWorkerHealthSummary()");
    const end = workerHealthSource.indexOf("export async function requeueDeadQualificationJob", start);
    const snapshot = workerHealthSource.slice(start, end);
    expect(snapshot).toContain(".limit(OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT + 1)");
    expect(snapshot).toContain('dispatchMode: "user_scoped_customer_request"');
    expect(snapshot).toContain("dedicatedDispatcherHeartbeatAvailable: false");
    expect(snapshot).not.toMatch(/\.(?:insert|update|delete|transaction)\s*\(/);
    expect(snapshot).not.toMatch(/wallet|settlement|payout/i);
  });
});
