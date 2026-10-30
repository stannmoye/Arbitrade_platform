import { describe, expect, it } from "vitest";
import { findCodeReviewMarkers, summarizeDiagnosticChecks } from "./systemDiagnostics";

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
    ].join("\\n"))).toEqual([
      { path: "server/example.ts", line: 2, marker: "TODO" },
      { path: "server/example.ts", line: 3, marker: "NOTIMPLEMENTEDERROR" },
      { path: "server/example.ts", line: 4, marker: "FIXME" },
      { path: "server/example.ts", line: 4, marker: "NOT_IMPLEMENTED" },
    ]);
  });
});
