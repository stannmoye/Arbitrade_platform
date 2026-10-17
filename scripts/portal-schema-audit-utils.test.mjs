import { describe, expect, it } from "vitest";
import { classifySchemaAudit } from "./portal-schema-audit-utils.mjs";

describe("classifySchemaAudit", () => {
  it("does not claim migration execution when all schema signals match", () => {
    const result = classifySchemaAudit([{ ok: true }, { ok: true }]);
    expect(result.status).toBe("schema_signals_match");
    expect(result.explanation).toContain("not proof");
  });
  it("flags all missing signals", () => {
    expect(classifySchemaAudit([{ ok: false }, { ok: false }]).status).toBe("expected_signals_missing");
  });
  it("flags mixed signals as potentially partial", () => {
    expect(classifySchemaAudit([{ ok: true }, { ok: false }]).status).toBe("mixed_or_incomplete");
  });
  it("handles an empty check list conservatively", () => {
    expect(classifySchemaAudit([]).status).toBe("cannot_assess");
  });
});
