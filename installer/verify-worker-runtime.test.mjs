import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  inspectWorkerHealthSchema,
  inspectWorkerStartupContract,
} from "./verify-worker-runtime.mjs";

const validIndexes = [
  { INDEX_NAME: "worker_health_worker_instance_uq", NON_UNIQUE: 0, SEQ_IN_INDEX: 1, COLUMN_NAME: "workerKey" },
  { INDEX_NAME: "worker_health_worker_instance_uq", NON_UNIQUE: 0, SEQ_IN_INDEX: 2, COLUMN_NAME: "instanceId" },
  { INDEX_NAME: "worker_health_heartbeat_idx", NON_UNIQUE: 1, SEQ_IN_INDEX: 1, COLUMN_NAME: "heartbeatAt" },
  { INDEX_NAME: "worker_health_status_heartbeat_idx", NON_UNIQUE: 1, SEQ_IN_INDEX: 1, COLUMN_NAME: "status" },
  { INDEX_NAME: "worker_health_status_heartbeat_idx", NON_UNIQUE: 1, SEQ_IN_INDEX: 2, COLUMN_NAME: "heartbeatAt" },
];
const validColumns = [
  "id", "workerKey", "instanceId", "displayName", "status", "startedAt",
  "heartbeatAt", "lastSuccessAt", "lastFailureAt", "lastDurationMs",
  "consecutiveFailures", "lastError", "createdAt", "updatedAt",
].map((COLUMN_NAME) => ({ COLUMN_NAME }));

describe("worker runtime installer verification", () => {
  it("accepts the supported persistent startup path and server-side worker registration", async () => {
    const [packageJson, wrapper, server] = await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../scripts/start-with-diagnostics.mjs", import.meta.url), "utf8"),
      readFile(new URL("../server/_core/index.ts", import.meta.url), "utf8"),
    ]);
    expect(inspectWorkerStartupContract(packageJson, wrapper, server)).toEqual([]);
  });

  it("fails closed when startup no longer runs schema preflight or worker loops", () => {
    const failures = inspectWorkerStartupContract(
      { scripts: { start: "node dist/index.js" } },
      'await runPhase("application-server", ["dist/index.js"]);',
      "startServer();",
    );
    expect(failures).toContain("package.json start must use scripts/start-with-diagnostics.mjs");
    expect(failures.some((failure) => failure.includes("worker schema preflight"))).toBe(true);
    expect(failures.some((failure) => failure.includes("five-second tier qualification poll"))).toBe(true);
  });


  it("keeps the existing installer diagnostics aligned with the canonical startup wrapper", async () => {
    const [installerVerifier, deploymentDiagnostic] = await Promise.all([
      readFile(new URL("./verify-install.mjs", import.meta.url), "utf8"),
      readFile(new URL("./diagnose-deployment.mjs", import.meta.url), "utf8"),
    ]);
    expect(installerVerifier).toContain('startCommand.includes("scripts/start-with-diagnostics.mjs")');
    expect(deploymentDiagnostic).toContain('start.includes("scripts/start-with-diagnostics.mjs")');
    expect(installerVerifier).not.toContain('startCommand.includes("NODE_ENV=production") && startCommand.includes("node dist/index.js")');
    expect(deploymentDiagnostic).not.toContain('start.includes("NODE_ENV=production") && start.includes("node dist/index.js")');
  });

  it("accepts the expected worker-health columns and unique/index ordering", () => {
    expect(inspectWorkerHealthSchema(validColumns, validIndexes)).toEqual([]);
  });

  it("detects missing worker-health columns and malformed indexes", () => {
    const failures = inspectWorkerHealthSchema(
      validColumns.filter((column) => column.COLUMN_NAME !== "heartbeatAt"),
      validIndexes.filter((index) => index.INDEX_NAME !== "worker_health_worker_instance_uq"),
    );
    expect(failures).toContain("worker_health_registry.heartbeatAt: required column is missing");
    expect(failures.some((failure) => failure.includes("worker_health_worker_instance_uq: expected columns"))).toBe(true);
  });
});
