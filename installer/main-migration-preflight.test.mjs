import { describe, expect, it } from "vitest";
import { classifyMainMigrationPreflight } from "./main-migration-preflight.mjs";

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
    }).allowed).toBe(true);
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
