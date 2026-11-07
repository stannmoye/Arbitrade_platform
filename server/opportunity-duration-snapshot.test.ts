import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOpportunityDurationWithinBounds, validateOpportunityDurationSnapshot } from "./modules/opportunity-duration-snapshot";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

const generatedAt = "2030-01-01T00:00:00.000Z";
const originalSnapshot = {
  minimumTradeDurationSeconds: 60,
  maximumTradeDurationSeconds: 180,
  configuredDurationSeconds: 120,
  completionDisplaySeconds: 8,
  generatedAt,
};
const originalTimestamps = {
  opensAt: "2030-01-01T00:00:00.000Z",
  rewardAt: "2030-01-01T00:02:00.000Z",
  closesAt: "2030-01-01T00:02:08.000Z",
  offerDurationSeconds: 120,
  eventDurationSeconds: 120,
  eventPopupDisplaySeconds: 128,
};

describe("immutable opportunity duration snapshots", () => {
  it("accepts the inclusive minimum and maximum duration boundaries", () => {
    expect(isOpportunityDurationWithinBounds(10, 86_400, 10)).toBe(true);
    expect(isOpportunityDurationWithinBounds(10, 86_400, 86_400)).toBe(true);
    expect(isOpportunityDurationWithinBounds(10, 86_400, 9)).toBe(false);
    expect(isOpportunityDurationWithinBounds(10, 86_400, 86_401)).toBe(false);
    expect(isOpportunityDurationWithinBounds(60, 59, 60)).toBe(false);
  });

  it("keeps a pending opportunity valid against its original bounds after admin edits", () => {
    const pending = validateOpportunityDurationSnapshot(originalSnapshot, originalTimestamps);
    const currentPackageSettings = { minimumTradeDurationSeconds: 10, maximumTradeDurationSeconds: 30 };
    expect(currentPackageSettings.maximumTradeDurationSeconds).toBeLessThan(originalSnapshot.configuredDurationSeconds);
    expect(pending).toMatchObject({ minimumTradeDurationSeconds: 60, maximumTradeDurationSeconds: 180, configuredDurationSeconds: 120 });
    expect(database).toContain("packageSnapshotJson:opportunityGenerationAssignments.packageSnapshotJson");
    expect(database).toContain("savedDurationSnapshot.minimumTradeDurationSeconds");
    expect(database).toContain("savedDurationSnapshot.maximumTradeDurationSeconds");
  });

  it("accepts allocation using the original persisted package snapshot", () => {
    expect(validateOpportunityDurationSnapshot(originalSnapshot, originalTimestamps)).toMatchObject({
      configuredDurationSeconds: 120,
      minimumTradeDurationSeconds: 60,
      maximumTradeDurationSeconds: 180,
      closesAtMs: Date.parse("2030-01-01T00:02:08.000Z"),
    });
    expect(database).toContain("effectiveDurationSeconds=input.deliveryEventId!==undefined?configuredDurationSeconds:Number(offer.durationSeconds)");
    expect(database).toContain("effectiveDurationSeconds!==savedDurationSnapshot.configuredDurationSeconds");
  });

  it("rejects a corrupted reward timestamp independently", () => {
    expect(validateOpportunityDurationSnapshot(originalSnapshot, {
      ...originalTimestamps,
      rewardAt: "2030-01-01T00:02:01.000Z",
    })).toBeNull();
  });

  it("rejects a corrupted closing timestamp independently", () => {
    expect(validateOpportunityDurationSnapshot(originalSnapshot, {
      ...originalTimestamps,
      closesAt: "2030-01-01T00:02:09.000Z",
    })).toBeNull();
  });

  it("uses updated package bounds for newly generated opportunities", () => {
    const updatedMinimum = 30;
    const updatedMaximum = 45;
    expect(isOpportunityDurationWithinBounds(updatedMinimum, updatedMaximum, 30)).toBe(true);
    expect(isOpportunityDurationWithinBounds(updatedMinimum, updatedMaximum, 45)).toBe(true);
    expect(isOpportunityDurationWithinBounds(updatedMinimum, updatedMaximum, 60)).toBe(false);
  });

  it("rejects missing, malformed, or mutually inconsistent saved timing fields", () => {
    expect(validateOpportunityDurationSnapshot({ ...originalSnapshot, maximumTradeDurationSeconds: null }, originalTimestamps)).toBeNull();
    expect(validateOpportunityDurationSnapshot(originalSnapshot, { ...originalTimestamps, eventPopupDisplaySeconds: 120 })).toBeNull();
    expect(validateOpportunityDurationSnapshot(originalSnapshot, { ...originalTimestamps, opensAt: "not-a-time" })).toBeNull();
  });
});
