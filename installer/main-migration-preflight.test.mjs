import { describe, expect, it } from "vitest";
import { classifyMainMigrationPreflight, validateMainMigrationHistory } from "./main-migration-preflight.mjs";

describe("main migration preflight", () => {
  it("does not require a Drizzle tracker for a verified fresh install", () => {
    expect(classifyMainMigrationPreflight({
      mode: "fresh",
      tableCount: 0,
      trackerExists: false,
      trackerCount: 0,
    }).allowed).toBe(true);
  });

  it("blocks an existing schema without a Drizzle migration tracker", () => {
    const result = classifyMainMigrationPreflight({
      mode: "existing",
      tableCount: 109,
      trackerExists: false,
      trackerCount: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("no __drizzle_migrations tracker");
  });

  it("blocks an existing schema with an empty migration tracker", () => {
    const result = classifyMainMigrationPreflight({
      mode: "existing",
      tableCount: 109,
      trackerExists: true,
      trackerCount: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("empty or unreadable");
  });

  it("allows an existing schema with recorded migration history", () => {
    expect(classifyMainMigrationPreflight({
      mode: "existing",
      tableCount: 109,
      trackerExists: true,
      trackerCount: 34,
      trackerHistoryValid: true,
    }).allowed).toBe(true);
  });

  it("blocks a non-empty tracker unless its recorded history was verified", () => {
    expect(classifyMainMigrationPreflight({ mode: "existing", tableCount: 109, trackerExists: true, trackerCount: 1, trackerHistoryValid: false }).allowed).toBe(false);
  });

  it("accepts only unique known migration hashes with matching timestamps", () => {
    const expected = [{ hash: "a".repeat(64), createdAt: 1000 }, { hash: "b".repeat(64), createdAt: 2000 }];
    expect(validateMainMigrationHistory([{ hash: "a".repeat(64), created_at: "1000" }, { hash: "b".repeat(64), created_at: 2000 }], expected).allowed).toBe(true);
    expect(validateMainMigrationHistory([{ hash: "c".repeat(64), created_at: 1000 }], expected).allowed).toBe(false);
    expect(validateMainMigrationHistory([{ hash: "a".repeat(64), created_at: 999 }], expected).allowed).toBe(false);
    expect(validateMainMigrationHistory([{ hash: "a".repeat(64), created_at: 1000 }, { hash: "a".repeat(64), created_at: 1000 }], expected).allowed).toBe(false);
  });

  it("fails closed when database inventory counts are malformed", () => {
    for (const tableCount of [Number.NaN, 1.5, -1]) {
      expect(classifyMainMigrationPreflight({
        mode: "existing",
        tableCount,
        trackerExists: true,
        trackerCount: 34,
      }).allowed).toBe(false);
    }
  });

  it("fails closed when migration tracker counts are malformed", () => {
    for (const trackerCount of [Number.NaN, 1.5, -1]) {
      expect(classifyMainMigrationPreflight({
        mode: "existing",
        tableCount: 109,
        trackerExists: true,
        trackerCount,
      }).allowed).toBe(false);
    }
  });

  it("blocks an empty database selected for existing-database mode", () => {
    expect(classifyMainMigrationPreflight({
      mode: "existing",
      tableCount: 0,
      trackerExists: false,
      trackerCount: 0,
    }).allowed).toBe(false);
  });
});
