import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findCodeReviewMarkers, findUnregisteredWorkerKeys, summarizeDiagnosticChecks } from "./systemDiagnostics";

describe("system diagnostics summary", () => {
  it("counts each check outcome without treating unrun checks as passes", () => {
    expect(summarizeDiagnosticChecks([
      { id: "a", area: "server", status: "pass", title: "A", detail: "ok", recommendation: null },
      { id: "b", area: "database", status: "warning", title: "B", detail: "review", recommendation: "inspect" },
      { id: "c", area: "code", status: "fail", title: "C", detail: "broken", recommendation: "repair" },
      { id: "d", area: "code", status: "not_run", title: "D", detail: "not executed", recommendation: "run CI" },
    ])).toEqual({ pass: 1, warning: 1, fail: 1, not_run: 1 });
  });

  it("returns zero counts for an empty report", () => {
    expect(summarizeDiagnosticChecks([])).toEqual({ pass: 0, warning: 0, fail: 0, not_run: 0 });
  });
  it("reports source review markers with stable file and line references", () => {
    expect(findCodeReviewMarkers("server/example.ts", [
      "const ready = true;",
      "// TODO: wire provider response",
      "throw new NotImplementedError();",
      "// FIXME not implemented",
    ].join("\n"))).toEqual([
      { path: "server/example.ts", line: 2, marker: "TODO" },
      { path: "server/example.ts", line: 3, marker: "NOTIMPLEMENTEDERROR" },
      { path: "server/example.ts", line: 4, marker: "FIXME" },
      { path: "server/example.ts", line: 4, marker: "NOT_IMPLEMENTED" },
    ]);
  });

  it("recognizes worker registrations across the modules that own their cycles", () => {
    const registry = 'key: "email-outbox" key: "daily-digests" key: "local-scheduled-jobs"';
    expect(findUnregisteredWorkerKeys(registry, [
      'runMonitoredWorkerCycle("email-outbox", task)',
      'runMonitoredWorkerCycle("daily-digests", task)',
      'runMonitoredWorkerCycle("local-scheduled-jobs", task)',
    ])).toEqual([]);
    expect(findUnregisteredWorkerKeys(registry, ['runMonitoredWorkerCycle("email-outbox", task)']))
      .toEqual(["daily-digests", "local-scheduled-jobs"]);
  });

  it("checks the worker monitor against its actual Drizzle schema symbol", () => {
    const workerHealthSource = readFileSync(resolve(process.cwd(), "server/_core/workerHealth.ts"), "utf8");
    const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(workerHealthSource).toContain("workerHealthRegistry");
    expect(schemaSource).toContain('mysqlTable("worker_health_registry"');
  });

  it("wires the administrator diagnostics dashboard, verification and complete report exports", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const adminUiSource = readFileSync(resolve(process.cwd(), "client/src/components/AdminOperationsPages.tsx"), "utf8");
    const diagnosticsSource = readFileSync(resolve(process.cwd(), "server/_core/systemDiagnostics.ts"), "utf8");
    expect(routerSource).toContain("systemDiagnostics: adminProcedure.query(() => getSystemDiagnosticsReport())");
    expect(adminUiSource).toContain("trpc.adminOperations.systemDiagnostics.useQuery(undefined, { enabled: true, retry: false, staleTime: 60_000, refetchOnWindowFocus: false })");
    expect(adminUiSource).toContain('downloadJson("arbitrade-full-system-diagnostics-" + stamp + ".json", report)');
    expect(adminUiSource).toContain('downloadDiagnosticsCsv("arbitrade-system-diagnostics-" + stamp + ".csv", rows)');
    expect(adminUiSource).toContain("Print / PDF");
    expect(adminUiSource).toContain("Verify after fix");
    expect(adminUiSource).toContain("arbitrade-diagnostic-history-v1");
    expect(adminUiSource).toContain("report.sourceInventory?.files");
    expect(diagnosticsSource).toContain("operatingSystem.loadavg()");
    expect(diagnosticsSource).toContain("operatingSystem.totalmem()");
    expect(adminUiSource).toContain("Complete diagnostic exports");
  });
});
