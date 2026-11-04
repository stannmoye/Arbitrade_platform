import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { deriveOpportunityDeliveryQueueDiagnostics, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT } from "../server/_core/workerHealth";

const iterations = Math.max(100, Math.min(50_000, Number(process.env.WORKER_HEALTH_PROFILE_ITERATIONS ?? 5_000)));
const rowsPerState = OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT + 1;
const now = Date.now();
const sample = () => ({
  createdAt: new Date(now - 60_000),
  deliveryRetryAfter: new Date(now - 1_000),
});
const input = {
  queued: Array.from({ length: rowsPerState }, sample),
  inProgress: Array.from({ length: rowsPerState }, sample),
  retryWait: Array.from({ length: rowsPerState }, sample),
  deadLetter: Array.from({ length: rowsPerState }, sample),
};

const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
gc?.();
const before = process.memoryUsage();
const durations: number[] = [];
let peakHeapUsed = before.heapUsed;
for (let index = 0; index < iterations; index += 1) {
  const start = performance.now();
  const result = deriveOpportunityDeliveryQueueDiagnostics(input, now);
  durations.push(performance.now() - start);
  assert.ok(result);
  assert.equal(result.sampledCounts.queued, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
  assert.equal(result.sampledCounts.inProgress, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
  assert.equal(result.sampledCounts.retryWait, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
  assert.equal(result.sampledCounts.deadLetter, OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT);
  assert.equal(result.pendingCountIsLowerBound, true);
  peakHeapUsed = Math.max(peakHeapUsed, process.memoryUsage().heapUsed);
}
gc?.();
const after = process.memoryUsage();
durations.sort((a, b) => a - b);
const percentile = (p: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)];
const report = {
  profile: "synthetic-worker-health-diagnostics-only",
  iterations,
  inputRowsPerState: rowsPerState,
  boundedRowsPerState: OPPORTUNITY_DELIVERY_DIAGNOSTIC_SAMPLE_LIMIT,
  p50Ms: Number(percentile(0.50).toFixed(4)),
  p95Ms: Number(percentile(0.95).toFixed(4)),
  maxMs: Number(durations[durations.length - 1].toFixed(4)),
  heapBeforeBytes: before.heapUsed,
  heapPeakObservedBytes: peakHeapUsed,
  heapAfterGcBytes: after.heapUsed,
  heapDeltaAfterGcBytes: after.heapUsed - before.heapUsed,
  rssAfterBytes: after.rss,
  gcAvailable: Boolean(gc),
};
console.log(JSON.stringify(report, null, 2));
