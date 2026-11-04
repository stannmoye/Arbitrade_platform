import assert from "node:assert/strict";
import { getWorkerHealthSummary, runMonitoredWorkerCycle } from "../server/_core/workerHealth";
import { getDb } from "../server/db";

const db = await getDb();
if (!db) {
  throw new Error("Worker-health integration requires DATABASE_URL to point to the disposable migrated database.");
}

// Use the production monitor and its real persistence path. The task represents a
// partially successful customer batch: completed work is retained while one
// customer sub-cycle failed. The aggregate diagnostic must not contain identity
// or raw exception data.
const result = await runMonitoredWorkerCycle(
  "trading-opportunities",
  async () => ({ processedCustomers: 2, customerFailures: 1 }),
  {
    degradedWhen: (cycle) => cycle.customerFailures > 0,
    degradedMessage: (cycle) => `Customer opportunity sub-cycle failures: ${cycle.customerFailures}`,
  },
);

assert.deepEqual(result, { processedCustomers: 2, customerFailures: 1 });

const summary = await getWorkerHealthSummary();
const worker = summary.workers.find((item) => item.workerKey === "trading-opportunities");
assert.ok(worker, "The current process must expose its persisted opportunity-worker health record.");
assert.equal(worker.status, "degraded", "A partially failed batch must persist as degraded.");
assert.equal(worker.lastErrorCode, "CUSTOMER_CYCLE_FAILURES");
assert.match(worker.lastError ?? "", /^Customer opportunity sub-cycle failures: 1$/);
assert.doesNotMatch(worker.lastError ?? "", /customer[-_ ]?\d+|@example|password|token|secret/i);
assert.equal(worker.consecutiveFailures, 1);

console.log("Durable partial-batch worker-health integration passed:", {
  workerKey: worker.workerKey,
  status: worker.status,
  lastErrorCode: worker.lastErrorCode,
  consecutiveFailures: worker.consecutiveFailures,
});
