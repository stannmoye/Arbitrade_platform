import { describe, expect, it } from "vitest";
import { safeDisplayText, safeFailureDetail } from "./recovery-utils.mjs";

describe("installer recovery report output safety", () => {
  it("removes terminal control characters from untrusted metadata", () => {
    expect(safeDisplayText("stage\u001B[31mRED\u001B[0m\u0007")).toBe("stageRED");
  });

  it("uses a fallback for non-string and empty values", () => {
    expect(safeDisplayText(null, "unknown-stage")).toBe("unknown-stage");
    expect(safeDisplayText("  ", "unknown-stage")).toBe("unknown-stage");
  });

  it("caps displayed metadata at 80 characters", () => {
    expect(safeDisplayText("x".repeat(100))).toHaveLength(80);
  });

  it("never prints failure details that could contain secrets or terminal output", () => {
    const sensitive = "DATABASE_URL=mysql://user:super-secret@host/db\u001B[2J";
    expect(safeFailureDetail(sensitive)).toBe("See private terminal output.");
    expect(safeFailureDetail(sensitive)).not.toContain("super-secret");
  });
});
