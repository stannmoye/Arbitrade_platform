import { describe, expect, it } from "vitest";
import { calculateDueRewardSchedule } from "./stakeEarn";

const day = 24 * 60 * 60 * 1000;

describe("Stake & Earn reward catch-up schedule", () => {
  it("advances beyond every overdue daily period after a catch-up payout", () => {
    const nextAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-04T12:00:00.000Z");

    const result = calculateDueRewardSchedule(nextAt, "DAILY", now);

    expect(result.periodsDue).toBe(4);
    expect(result.nextRewardAt.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(result.nextRewardAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("advances by the number of overdue weekly periods", () => {
    const nextAt = new Date("2026-09-01T00:00:00.000Z");
    const now = new Date("2026-09-20T00:00:00.000Z");

    const result = calculateDueRewardSchedule(nextAt, "WEEKLY", now);

    expect(result.periodsDue).toBe(3);
    expect(result.nextRewardAt.toISOString()).toBe("2026-09-22T00:00:00.000Z");
    expect(result.nextRewardAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("keeps the next monthly period after now when multiple periods were missed", () => {
    const nextAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-03-15T00:00:00.000Z");

    const result = calculateDueRewardSchedule(nextAt, "MONTHLY", now);

    expect(result.periodsDue).toBe(3);
    expect(result.nextRewardAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(result.nextRewardAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("keeps one due period when the scheduled time is exactly now", () => {
    const nextAt = new Date("2026-10-18T12:00:00.000Z");

    const result = calculateDueRewardSchedule(nextAt, "DAILY", nextAt);

    expect(result.periodsDue).toBe(1);
    expect(result.nextRewardAt.getTime()).toBe(nextAt.getTime() + day);
  });
});
