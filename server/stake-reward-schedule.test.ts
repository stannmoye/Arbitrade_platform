import { describe, expect, it } from "vitest";
import { calculateAdditionalStakeReward, calculateDueRewardSchedule } from "./stakeEarn";

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

describe("Stake & Earn cumulative reward calculation", () => {
  it("calculates the first daily reward from the full elapsed schedule", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-02T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(10000, 10000, openedAt, "DAILY", 0, now)).toBe(27);
  });

  it("pays the next daily increment instead of subtracting lifetime rewards from one period", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-02T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(10000, 10000, openedAt, "DAILY", 27, now)).toBe(0);
    expect(calculateAdditionalStakeReward(10000, 10000, openedAt, "DAILY", 27, new Date("2026-10-03T00:00:00.000Z"))).toBe(27);
  });


  it("calculates cumulative weekly rewards after missed weekly periods", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-22T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(100000, 10000, openedAt, "WEEKLY", 0, now)).toBe(575);
    expect(calculateAdditionalStakeReward(100000, 10000, openedAt, "WEEKLY", 287, now)).toBe(288);
  });

  it("calculates cumulative monthly rewards and does not pay before a full period", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(100000, 10000, openedAt, "MONTHLY", 0, new Date("2026-10-30T00:00:00.000Z"))).toBe(0);
    expect(calculateAdditionalStakeReward(100000, 10000, openedAt, "MONTHLY", 0, new Date("2026-12-30T00:00:00.000Z"))).toBe(2465);
  });

  it("never returns a negative increment if previously posted rewards exceed the current target", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-02T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(10000, 10000, openedAt, "DAILY", 1000, now)).toBe(0);
  });

  it("catches up missed periods while subtracting previously posted cumulative rewards", () => {
    const openedAt = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-04T00:00:00.000Z");

    expect(calculateAdditionalStakeReward(10000, 10000, openedAt, "DAILY", 27, now)).toBe(55);
  });
});
