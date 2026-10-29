import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0086_trading_popup_policy_ranges.sql", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const workerSchema = readFileSync(new URL("../scripts/worker-schema-contracts.mjs", import.meta.url), "utf8");

describe("administrator-managed Trading popup policy bounds and snapshots", () => {
  it("uses nullable paired policy bounds, approved badge styles and durable event snapshot columns", () => {
    for (const field of ["badgeLabel", "badgeStyle", "minimumPayoutRateBps", "maximumPayoutRateBps", "minimumTradeDurationSeconds", "maximumTradeDurationSeconds"]) {
      expect(schema).toContain(field);
      expect(migration).toContain(field);
      expect(router).toContain(field);
    }
    for (const field of ["policyVersion", "durationSeconds", "badgeLabel", "badgeStyle"]) {
      expect(migration).toContain(field);
      expect(lifecycle).toContain(field);
      expect(workerSchema).toContain(field);
    }
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("filters published values instead of synthesizing rates/durations and preserves existing popup snapshots", () => {
    expect(database).toContain("publishedRewardBps<Number(minRate)");
    expect(database).toContain("publishedDurationSeconds<Number(minDuration)");
    expect(database).toContain("durationSeconds:publishedDurationSeconds");
    expect(database).toContain("policyVersion:Number(configured?.policyVersion||1)");
    expect(database).toContain("badgeLabel:configured?.badgeLabel==null?null:String(configured.badgeLabel)");
    expect(lifecycle).toContain("ON DUPLICATE KEY UPDATE updatedAt=CURRENT_TIMESTAMP");
    expect(app).toContain("These bounds filter already-published offer estimates and durations.");
    expect(app).toContain("Existing pop-ups retain their original snapshots.");
  });

  it("limits badge styles to the allowlist and validates paired bounds in the service", () => {
    expect(database).toContain('["neutral","blue","purple","gold","green"].includes(badgeStyle)');
    expect(database).toContain("Set both published reward-rate bounds or leave both blank");
    expect(database).toContain("Set both published duration bounds or leave both blank");
    expect(app).toContain('value="purple"');
    expect(app).toContain("policyRowValid");
  });
});
