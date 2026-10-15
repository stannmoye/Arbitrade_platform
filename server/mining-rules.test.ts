import { describe, expect, it } from "vitest";
import { calculateMiningConversion, calculateMiningDifficultyIndex, calculateMiningReward, calculatePackageDailyReward, canStartMiningAccrual, getBoostCooldownWindow, getBoostScheduleWindow, isQuoteFresh, isRateWithinDeviation, overlapSeconds } from "./mining-rules";

describe("mining reward rules", () => {
  it("uses the configured tokens per TH/s-hour formula with decimal precision", () => {
    expect(calculateMiningReward([{ baseThs: "10", boostThs: "0", rewardTokensPerThsHour: "2", elapsedSeconds: 60 }])).toBe("0.33333333");
  });

  it("adds boost hash power only during its active portion of a fixed interval", () => {
    const intervalStart = new Date("2026-10-11T12:00:00.000Z");
    const intervalEnd = new Date("2026-10-11T12:01:00.000Z");
    const boostStart = new Date("2026-10-11T12:00:30.000Z");
    const boostedSeconds = overlapSeconds(intervalStart, intervalEnd, boostStart, intervalEnd);
    const baseSeconds = 60 - boostedSeconds;
    expect(boostedSeconds).toBe(30);
    expect(calculateMiningReward([
      { baseThs: "10", boostThs: "0", rewardTokensPerThsHour: "60", elapsedSeconds: baseSeconds },
      { baseThs: "10", boostThs: "5", rewardTokensPerThsHour: "60", elapsedSeconds: boostedSeconds },
    ])).toBe("12.50000000");
  });

  it("preserves millisecond boost overlap across a full minute without losing fractional seconds", () => {
    const intervalStart = new Date("2026-10-12T14:47:00.000Z");
    const intervalEnd = new Date("2026-10-12T14:48:00.000Z");
    const boostStart = new Date("2026-10-12T14:46:59.093Z");
    const boostEnd = new Date("2026-10-12T14:47:19.093Z");
    const boostedSeconds = overlapSeconds(intervalStart, intervalEnd, boostStart, boostEnd);
    const baseSeconds = 60 - boostedSeconds;
    expect(boostedSeconds).toBe(19.093);
    expect(baseSeconds + boostedSeconds).toBe(60);
    expect(calculateMiningReward([
      { baseThs: "1", boostThs: "0", rewardTokensPerThsHour: "0.0390625", elapsedSeconds: baseSeconds },
      { baseThs: "1", boostThs: "0.25", rewardTokensPerThsHour: "0.0390625", elapsedSeconds: boostedSeconds },
    ])).toBe("0.00070283");
  });

  it("stops adding boost reward after the boost expiry time", () => {
    const intervalStart = new Date("2026-10-11T12:00:00.000Z");
    const intervalEnd = new Date("2026-10-11T12:01:00.000Z");
    const boostStart = new Date("2026-10-11T12:00:10.000Z");
    const boostEnd = new Date("2026-10-11T12:00:30.000Z");
    const boostedSeconds = overlapSeconds(intervalStart, intervalEnd, boostStart, boostEnd);
    const baseOnlySeconds = 60 - boostedSeconds;
    expect(boostedSeconds).toBe(20);
    expect(calculatePackageDailyReward([
      { expectedDailyRewardCki: "86400", baseThs: "1", boostThs: "0", eligibleSeconds: baseOnlySeconds },
      { expectedDailyRewardCki: "86400", baseThs: "1", boostThs: "1", eligibleSeconds: boostedSeconds },
    ])).toBe("80.000000000000000000");
  });

  it("rejects invalid and overlong segments instead of trusting unchecked rates", () => {
    expect(() => calculateMiningReward([{ baseThs: "-1", boostThs: "0", rewardTokensPerThsHour: "1", elapsedSeconds: 60 }])).toThrow(/non-negative/);
    expect(() => calculateMiningReward([{ baseThs: "1", boostThs: "0", rewardTokensPerThsHour: "1", elapsedSeconds: 61 }])).toThrow(/sixty seconds/);
  });
});

describe("package daily reward model", () => {
  it("prorates a configured package estimate for six eligible hours", () => {
    expect(calculatePackageDailyReward([{ expectedDailyRewardCki: "2", baseThs: "1", boostThs: "0", eligibleSeconds: 21_600 }])).toBe("0.500000000000000000");
  });

  it("sums purchased packages and proportionally attributes a boost", () => {
    expect(calculatePackageDailyReward([
      { expectedDailyRewardCki: "2", baseThs: "1", boostThs: "0.5", eligibleSeconds: 60 },
      { expectedDailyRewardCki: "3", baseThs: "3", boostThs: "0", eligibleSeconds: 60 },
    ])).toBe("0.004166666666666666");
  });

  it("does not invent rewards for a package with no configured daily estimate", () => {
    expect(calculatePackageDailyReward([{ expectedDailyRewardCki: null, baseThs: "1", boostThs: "0", eligibleSeconds: 60 }])).toBe("0.000000000000000000");
  });

  it("rejects negative daily estimates and boosts without purchased base capacity", () => {
    expect(() => calculatePackageDailyReward([{ expectedDailyRewardCki: "-1", baseThs: "1", boostThs: "0", eligibleSeconds: 60 }])).toThrow(/non-negative/);
    expect(() => calculatePackageDailyReward([{ expectedDailyRewardCki: "1", baseThs: "0", boostThs: "1", eligibleSeconds: 60 }])).toThrow(/positive base/);
  });
});

describe("immediate mining accrual gate", () => {
  it("does not run while simulated package estimate posting is disabled", () => {
    expect(canStartMiningAccrual({ simulatedRewardsEnabled: false, expectedDailyRewardCki: "1.25" })).toBe(false);
  });

  it("requires a positive configured daily estimate before immediate accrual", () => {
    expect(canStartMiningAccrual({ simulatedRewardsEnabled: true, expectedDailyRewardCki: null })).toBe(false);
    expect(canStartMiningAccrual({ simulatedRewardsEnabled: true, expectedDailyRewardCki: "0" })).toBe(false);
    expect(canStartMiningAccrual({ simulatedRewardsEnabled: true, expectedDailyRewardCki: "0.0001" })).toBe(true);
  });
});

describe("simulated network difficulty index", () => {
  it("scales aggregate hash power against a 100 TH/s simulation reference", () => {
    expect(calculateMiningDifficultyIndex("0", "100")).toBe("1.00");
    expect(calculateMiningDifficultyIndex("12.5", "100")).toBe("1.13");
    expect(calculateMiningDifficultyIndex("100", "100")).toBe("2.00");
  });

  it("rejects negative hash power and a zero reference", () => {
    expect(() => calculateMiningDifficultyIndex("-1", "100")).toThrow(/non-negative/);
    expect(() => calculateMiningDifficultyIndex("1", "0")).toThrow(/greater than zero/);
  });
});

describe("mining conversion rules", () => {
  it("uses the configured internal reference, rate direction, fee, and target precision", () => {
    expect(calculateMiningConversion({ tokenAmount: "1000", tokenUnitsPerUsd: "1000", usdPerTargetUnit: "1.25", feeBps: 100, targetScale: 2 })).toEqual({
      grossAmount: "0.80", feeAmount: "0.01", netAmount: "0.79", rate: "0.00079",
    });
  });

  it("converts 1 CKI to approximately $1.27 at the configured internal reference rate", () => {
    expect(calculateMiningConversion({ tokenAmount: "1", tokenUnitsPerUsd: "0.787401574803149606", usdPerTargetUnit: "1", feeBps: 0, targetScale: 2 })).toEqual({
      grossAmount: "1.27", feeAmount: "0.00", netAmount: "1.27", rate: "1.27",
    });
  });

  it("rounds down and refuses a quote that would disappear at target precision", () => {
    expect(() => calculateMiningConversion({ tokenAmount: "0.1", tokenUnitsPerUsd: "1000", usdPerTargetUnit: "30000", feeBps: 0, targetScale: 8 })).toThrow(/below the target asset/);
  });

  it("rejects rates beyond configured deviation", () => {
    expect(isRateWithinDeviation("101", "100", 200)).toBe(true);
    expect(isRateWithinDeviation("110", "100", 500)).toBe(false);
  });
});

describe("mining time and quote guards", () => {
  it("makes a first boost immediately available and starts its four-hour cooldown at activation", () => {
    const now = new Date("2026-10-11T14:05:00.000Z");
    const cycle = getBoostCooldownWindow(now, null, 4 * 60 * 60);
    expect(cycle.ready).toBe(true);
    expect(cycle.nextEligibleAt.toISOString()).toBe(now.toISOString());
    expect(cycle.expiresAt.toISOString()).toBe("2026-10-11T18:05:00.000Z");
  });

  it("counts four hours from the customer's own previous activation, not a shared clock boundary", () => {
    const now = new Date("2026-10-11T14:05:00.000Z");
    const cycle = getBoostCooldownWindow(now, new Date("2026-10-11T12:10:00.000Z"), 4 * 60 * 60);
    expect(cycle.ready).toBe(false);
    expect(cycle.start.toISOString()).toBe("2026-10-11T12:10:00.000Z");
    expect(cycle.nextEligibleAt.toISOString()).toBe("2026-10-11T16:10:00.000Z");
    expect(getBoostCooldownWindow(new Date("2026-10-11T16:10:00.000Z"), new Date("2026-10-11T12:10:00.000Z"), 4 * 60 * 60).ready).toBe(true);
  });

  it("uses the persisted release timestamp for logged-out worker eligibility", () => {
    const startedAt = new Date("2026-10-11T12:10:00.000Z");
    const releaseAt = new Date("2026-10-11T16:10:00.000Z");
    const cooling = getBoostScheduleWindow(new Date("2026-10-11T16:09:59.000Z"), startedAt, releaseAt);
    const released = getBoostScheduleWindow(releaseAt, startedAt, releaseAt);
    expect(cooling.ready).toBe(false);
    expect(cooling.nextEligibleAt.toISOString()).toBe(releaseAt.toISOString());
    expect(released.ready).toBe(true);
  });

  it("accepts only non-future quotes inside the freshness limit", () => {
    const now = new Date("2026-10-11T14:00:00.000Z");
    expect(isQuoteFresh(new Date("2026-10-11T13:59:00.000Z"), now, 120)).toBe(true);
    expect(isQuoteFresh(new Date("2026-10-11T13:50:00.000Z"), now, 120)).toBe(false);
    expect(isQuoteFresh(new Date("2026-10-11T14:01:00.000Z"), now, 120)).toBe(false);
  });
});
