import { describe, expect, it } from "vitest";
import { calculateMiningConversion, calculateMiningDifficultyIndex, calculateMiningReward, getAnchoredBoostCycle, isQuoteFresh, isRateWithinDeviation, overlapSeconds } from "./mining-rules";

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

  it("rejects invalid and overlong segments instead of trusting unchecked rates", () => {
    expect(() => calculateMiningReward([{ baseThs: "-1", boostThs: "0", rewardTokensPerThsHour: "1", elapsedSeconds: 60 }])).toThrow(/non-negative/);
    expect(() => calculateMiningReward([{ baseThs: "1", boostThs: "0", rewardTokensPerThsHour: "1", elapsedSeconds: 61 }])).toThrow(/sixty seconds/);
  });
});

describe("simulated network difficulty index", () => {
  it("scales aggregate hash power against a 100 TH/s simulation reference", () => {
    expect(calculateMiningDifficultyIndex("0")).toBe("1.00");
    expect(calculateMiningDifficultyIndex("12.5")).toBe("1.13");
    expect(calculateMiningDifficultyIndex("100")).toBe("2.00");
  });

  it("rejects negative hash power and a zero reference", () => {
    expect(() => calculateMiningDifficultyIndex("-1")).toThrow(/non-negative/);
    expect(() => calculateMiningDifficultyIndex("1", "0")).toThrow(/greater than zero/);
  });
});

describe("mining conversion rules", () => {
  it("uses the configured internal reference, rate direction, fee, and target precision", () => {
    expect(calculateMiningConversion({ tokenAmount: "1000", tokenUnitsPerUsd: "1000", usdPerTargetUnit: "1.25", feeBps: 100, targetScale: 2 })).toEqual({
      grossAmount: "0.80", feeAmount: "0.01", netAmount: "0.79", rate: "0.00079",
    });
  });

  it("converts 1 CKI to exactly $1.60 at the initial CoinKi reference rate", () => {
    expect(calculateMiningConversion({ tokenAmount: "1", tokenUnitsPerUsd: "0.625", usdPerTargetUnit: "1", feeBps: 0, targetScale: 2 })).toEqual({
      grossAmount: "1.60", feeAmount: "0.00", netAmount: "1.60", rate: "1.6",
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
  it("anchors boost eligibility to fixed UTC cycle boundaries", () => {
    const cycle = getAnchoredBoostCycle(new Date("2026-10-11T14:05:00.000Z"), 4 * 60 * 60);
    expect(cycle.start.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    expect(cycle.expiresAt.toISOString()).toBe("2026-10-11T16:00:00.000Z");
  });

  it("accepts only non-future quotes inside the freshness limit", () => {
    const now = new Date("2026-10-11T14:00:00.000Z");
    expect(isQuoteFresh(new Date("2026-10-11T13:59:00.000Z"), now, 120)).toBe(true);
    expect(isQuoteFresh(new Date("2026-10-11T13:50:00.000Z"), now, 120)).toBe(false);
    expect(isQuoteFresh(new Date("2026-10-11T14:01:00.000Z"), now, 120)).toBe(false);
  });
});
