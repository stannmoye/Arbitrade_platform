import { describe, expect, it } from "vitest";
import { classifyPortalMigrationRecord } from "./portal-migration-tracker.mjs";

const checksum = "a".repeat(64);

describe("classifyPortalMigrationRecord", () => {
  it("allows a migration with no prior record to run", () => {
    expect(classifyPortalMigrationRecord(null, checksum).action).toBe("run");
  });

  it("skips a successfully applied migration with the same checksum", () => {
    expect(classifyPortalMigrationRecord({ checksum, status: "applied" }, checksum).action).toBe("skip");
  });

  it("labels an operator-confirmed baseline distinctly", () => {
    const result = classifyPortalMigrationRecord({ checksum, status: "baseline_confirmed" }, checksum);
    expect(result.action).toBe("skip");
    expect(result.reason).toContain("not independently verified");
  });

  it.each(["started", "failed"])("blocks automatic retry after status %s", (status) => {
    expect(classifyPortalMigrationRecord({ checksum, status }, checksum).action).toBe("stop");
  });

  it("blocks a changed SQL checksum", () => {
    expect(classifyPortalMigrationRecord({ checksum, status: "applied" }, "b".repeat(64)).action).toBe("stop");
  });

  it("blocks unknown statuses", () => {
    expect(classifyPortalMigrationRecord({ checksum, status: "mystery" }, checksum).action).toBe("stop");
  });
});
