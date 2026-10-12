import Decimal from "decimal.js";

export type MiningRewardSegment = {
  baseThs: string | number;
  boostThs: string | number;
  rewardTokensPerThsHour: string | number;
  elapsedSeconds: number;
};

export type MiningConversion = {
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  rate: string;
};

const TOKEN_SCALE = 8;
export const SIMULATED_DIFFICULTY_BASELINE_THS = "100";

function positiveDecimal(value: string | number, label: string, allowZero = false) {
  const amount = new Decimal(value);
  if (!amount.isFinite() || (allowZero ? amount.isNegative() : !amount.gt(0))) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "greater than zero"}`);
  }
  return amount;
}

/** Reward formula: tokens/TH/s-hour × TH/s × elapsed seconds / 3,600. */
export function calculateMiningReward(segments: MiningRewardSegment[]) {
  if (!segments.length) return new Decimal(0).toFixed(TOKEN_SCALE);
  const total = segments.reduce((sum, segment) => {
    if (!Number.isInteger(segment.elapsedSeconds) || segment.elapsedSeconds < 0 || segment.elapsedSeconds > 60) {
      throw new Error("Mining segments must be between zero and sixty seconds");
    }
    const base = positiveDecimal(segment.baseThs, "Base hash power", true);
    const boost = positiveDecimal(segment.boostThs, "Boost hash power", true);
    const rate = positiveDecimal(segment.rewardTokensPerThsHour, "Reward rate", true);
    return sum.plus(rate.times(base.plus(boost)).times(segment.elapsedSeconds).div(3600));
  }, new Decimal(0));
  return total.toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toFixed(TOKEN_SCALE);
}

/** A transparent simulation index: 1 + aggregate TH/s divided by a 100 TH/s reference. */
export function calculateMiningDifficultyIndex(
  networkHashPowerThs: string | number,
  baselineThs: string | number = SIMULATED_DIFFICULTY_BASELINE_THS,
) {
  const hashPower = positiveDecimal(networkHashPowerThs, "Network hash power", true);
  const baseline = positiveDecimal(baselineThs, "Difficulty reference");
  return new Decimal(1).plus(hashPower.div(baseline)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Convert a platform-token amount through its fixed internal USD reference to a quoted asset rate. */
export function calculateMiningConversion(input: {
  tokenAmount: string | number;
  tokenUnitsPerUsd: string | number;
  usdPerTargetUnit: string | number;
  feeBps: number;
  targetScale: number;
}): MiningConversion {
  const tokens = positiveDecimal(input.tokenAmount, "Token amount");
  const tokenUnitsPerUsd = positiveDecimal(input.tokenUnitsPerUsd, "Platform token/USD reference");
  const usdPerTargetUnit = positiveDecimal(input.usdPerTargetUnit, "Target asset quote");
  if (!Number.isInteger(input.feeBps) || input.feeBps < 0 || input.feeBps > 10_000) throw new Error("Fee must be from zero to 10,000 basis points");
  if (!Number.isInteger(input.targetScale) || input.targetScale < 0 || input.targetScale > 18) throw new Error("Unsupported target precision");

  const grossRaw = tokens.div(tokenUnitsPerUsd).div(usdPerTargetUnit);
  const gross = grossRaw.toDecimalPlaces(input.targetScale, Decimal.ROUND_DOWN);
  const net = gross.times(new Decimal(10_000 - input.feeBps).div(10_000)).toDecimalPlaces(input.targetScale, Decimal.ROUND_DOWN);
  const fee = gross.minus(net);
  if (!net.gt(0)) throw new Error("The converted amount is below the target asset's supported precision");
  return {
    grossAmount: gross.toFixed(input.targetScale),
    feeAmount: fee.toFixed(input.targetScale),
    netAmount: net.toFixed(input.targetScale),
    rate: net.div(tokens).toSignificantDigits(24).toString(),
  };
}

/** Boost cycles are anchored to the Unix epoch; an unclaimed cycle expires at its next boundary. */
export function getAnchoredBoostCycle(now: Date, cycleSeconds: number) {
  if (!Number.isInteger(cycleSeconds) || cycleSeconds < 60 || cycleSeconds > 31_536_000) throw new Error("Boost cycle length is outside the supported range");
  const cycleMs = cycleSeconds * 1000;
  const startMs = Math.floor(now.getTime() / cycleMs) * cycleMs;
  return { start: new Date(startMs), eligibleAt: new Date(startMs), expiresAt: new Date(startMs + cycleMs) };
}

export function overlapSeconds(start: Date, end: Date, activeStart?: Date | null, activeEnd?: Date | null) {
  const from = Math.max(start.getTime(), activeStart?.getTime() ?? start.getTime());
  const to = Math.min(end.getTime(), activeEnd?.getTime() ?? end.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}

export function isQuoteFresh(observedAt: Date, now: Date, maxAgeSeconds: number) {
  return Number.isFinite(observedAt.getTime()) && Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0 && now.getTime() - observedAt.getTime() >= 0 && now.getTime() - observedAt.getTime() <= maxAgeSeconds * 1000;
}

export function isRateWithinDeviation(currentRate: string | number, previousRate: string | number, maxDeviationBps: number) {
  const current = positiveDecimal(currentRate, "Current rate");
  const previous = positiveDecimal(previousRate, "Previous rate");
  if (!Number.isInteger(maxDeviationBps) || maxDeviationBps < 0 || maxDeviationBps > 10_000) return false;
  return current.minus(previous).abs().div(previous).times(10_000).lte(maxDeviationBps);
}
