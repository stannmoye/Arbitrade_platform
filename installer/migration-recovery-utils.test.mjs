import { describe, expect, it } from "vitest";
import { classifyMigrationTracker } from "./migration-recovery-utils.mjs";

describe("classifyMigrationTracker", () => {
  it("does not assume a missing tracker means migrations never ran", () => {
    expect(classifyMigrationTracker({ trackerExists: false, appliedCount: 0, expectedCount: 34 }).status).toBe("cannot_verify");
  });

  it("identifies a present empty tracker as not started", () => {
    expect(classifyMigrationTracker({ trackerExists: true, appliedCount: 0, expectedCount: 34 }).status).toBe("not_started");
  });

  it("flags fewer recorded migrations as incomplete or potentially partial", () => {
    expect(classifyMigrationTracker({ trackerExists: true, appliedCount: 12, expectedCount: 34 }).status).toBe("incomplete_or_partial");
  });

  it("does not claim schema integrity just because the tracker count matches", () => {
    expect(classifyMigrationTracker({ trackerExists: true, appliedCount: 34, expectedCount: 34 }).status).toBe("tracker_count_complete_schema_unverified");
  });

  it("does not treat an unexpected higher count as healthy", () => {
    expect(classifyMigrationTracker({ trackerExists: true, appliedCount: 40, expectedCount: 34 }).status).toBe("cannot_verify");
  });

  it("handles invalid counts conservatively", () => {
    expect(classifyMigrationTracker({ trackerExists: true, appliedCount: -1, expectedCount: 34 }).status).toBe("cannot_verify");
  });
});
