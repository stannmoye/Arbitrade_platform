import Decimal from "decimal.js";

export type MiningRewardSegment = {
  baseThs: string | number;
  boostThs: string | number;
  rewardTokensPerThsHour: string | number;
  elapsedSeconds: number;
};

export type MiningPackageRewardSegment = {
  expectedDailyRewardCki: string | number | null | undefined;
  baseThs: string | number;
  boostThs: string | number;
  eligibleSeconds: number;
  applyBoostMultiplier?: boolean;
  boostRewardCkiPerDay?: string | number | null;
};

export type MiningCalculationModel = "package_daily" | "hashrate_daily";

export type MiningConversion = {
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  rate: string;
};

const TOKEN_SCALE = 8;
const PACKAGE_REWARD_SCALE = 18;
const MiningDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_DOWN });

/** False until verified third-party settlement ingestion, allocation, and idempotent posting are implemented and tested. */
export const VERIFIED_FARM_SETTLEMENTS_ENABLED = false;

export function canStartMiningAccrual(input: { globalEnabled: boolean; expectedDailyRewardCki: string | number | null | undefined }) {
  if (!VERIFIED_FARM_SETTLEMENTS_ENABLED || !input.globalEnabled || input.expectedDailyRewardCki == null) return false;
  const estimate = new Decimal(input.expectedDailyRewardCki);
  return estimate.isFinite() && estimate.gt(0);
}

function positiveDecimal(value: string | number, label: string, allowZero = false) {
  const amount = new Decimal(value);
  if (!amount.isFinite() || (allowZero ? amount.isNegative() : !amount.gt(0))) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "greater than zero"}`);
  }
  return amount;
}

/** Derive the per-package daily CKI amount using exactly one admin-selected model. */
export function calculatePackageDailyRate(input: {
  calculationModel: MiningCalculationModel;
  expectedDailyRewardCki: string | number | null | undefined;
  baseThs: string | number;
  ckiPerThsPerDay: string | number;
}) {
  if (input.calculationModel === "package_daily") {
    const rate = input.expectedDailyRewardCki == null ? new MiningDecimal(0) : new MiningDecimal(input.expectedDailyRewardCki);
    if (!rate.isFinite() || rate.isNegative()) throw new Error("Expected daily package reward must be non-negative");
    return rate.toDecimalPlaces(PACKAGE_REWARD_SCALE, MiningDecimal.ROUND_DOWN).toFixed(PACKAGE_REWARD_SCALE);
  }
  if (input.calculationModel === "hashrate_daily") {
    const hashrate = new MiningDecimal(input.baseThs);
    const production = new MiningDecimal(input.ckiPerThsPerDay);
    if (!hashrate.isFinite() || !hashrate.gt(0)) throw new Error("Package hash power must be greater than zero");
    if (!production.isFinite() || !production.gt(0)) throw new Error("CKI production per TH/s per day must be greater than zero");
    return hashrate.times(production).toDecimalPlaces(PACKAGE_REWARD_SCALE, MiningDecimal.ROUND_DOWN).toFixed(PACKAGE_REWARD_SCALE);
  }
  throw new Error("Unsupported Mining reward calculation model");
}

/** Legacy helper retained for historical tests; package-daily processing uses calculatePackageDailyReward. */
export function calculateMiningReward(segments: MiningRewardSegment[]) {
  if (!segments.length) return new Decimal(0).toFixed(TOKEN_SCALE);
  const total = segments.reduce((sum, segment) => {
    if (!Number.isFinite(segment.elapsedSeconds) || segment.elapsedSeconds < 0 || segment.elapsedSeconds > 60) {
      throw new Error("Mining segments must be between zero and sixty seconds");
    }
    const base = positiveDecimal(segment.baseThs, "Base hash power", true);
    const boost = positiveDecimal(segment.boostThs, "Boost hash power", true);
    const rate = positiveDecimal(segment.rewardTokensPerThsHour, "Reward rate", true);
    return sum.plus(rate.times(base.plus(boost)).times(segment.elapsedSeconds).div(3600));
  }, new Decimal(0));
  return total.toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toFixed(TOKEN_SCALE);
}

/** Package-based estimate: configured CKI per 24 hours × eligible seconds / 86,400. */
export function calculatePackageDailyReward(segments: MiningPackageRewardSegment[]) {
  const total = segments.reduce((sum, segment) => {
    const seconds = new MiningDecimal(String(segment.eligibleSeconds));
    if (!seconds.isFinite() || seconds.isNegative()) {
      throw new Error("Eligible reward time must be finite and non-negative");
    }
    const daily = segment.expectedDailyRewardCki == null
      ? new MiningDecimal(0)
      : new MiningDecimal(segment.expectedDailyRewardCki);
    const base = new MiningDecimal(segment.baseThs);
    const boost = new MiningDecimal(segment.boostThs);
    if (!daily.isFinite() || daily.isNegative()) throw new Error("Expected daily package reward must be non-negative");
    if (!base.isFinite() || base.isNegative()) throw new Error("Base hash power must be non-negative");
    if (!boost.isFinite() || boost.isNegative()) throw new Error("Boost hash power must be non-negative");
    if (boost.gt(0) && !base.gt(0)) throw new Error("A package boost requires positive base hash power");
    // New fixed-rate contracts use the requested exact daily formula. The legacy
    // multiplier is retained only for contracts tagged before this change.
    const boostMultiplier = segment.applyBoostMultiplier && base.gt(0) ? base.plus(boost).div(base) : new MiningDecimal(1);
    const boostDaily = segment.boostRewardCkiPerDay != null ? new MiningDecimal(segment.boostRewardCkiPerDay) : new MiningDecimal(0);
    if (!boostDaily.isFinite() || boostDaily.isNegative()) throw new Error("Boost daily CKI reward must be non-negative");
    return sum.plus(daily.times(seconds).div(86_400).times(boostMultiplier)).plus(boostDaily.times(seconds).div(86_400));
  }, new MiningDecimal(0));
  return total.toDecimalPlaces(PACKAGE_REWARD_SCALE, MiningDecimal.ROUND_DOWN).toFixed(PACKAGE_REWARD_SCALE);
}

/** A transparent simulation index: 1 + aggregate TH/s divided by the effective database baseline. */
export function calculateMiningDifficultyIndex(
  networkHashPowerThs: string | number,
  baselineThs: string | number,
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

/** A customer's next boost time is measured from that customer's previous activation. */
export function getBoostCooldownWindow(now: Date, lastActivationAt: Date | null | undefined, cooldownSeconds: number) {
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 31_536_000) throw new Error("Boost cooldown length is outside the supported range");
  const cooldownMs = cooldownSeconds * 1000;
  const last = lastActivationAt ? new Date(lastActivationAt) : null;
  if (last && !Number.isFinite(last.getTime())) throw new Error("Last boost activation time is invalid");
  const start = last ?? new Date(now);
  const next = last ? new Date(last.getTime() + cooldownMs) : new Date(now);
  const expiresAt = last ? next : new Date(now.getTime() + cooldownMs);
  return { start, eligibleAt: next, expiresAt, nextEligibleAt: next, ready: now.getTime() >= next.getTime() };
}

export function overlapSeconds(start: Date, end: Date, activeStart?: Date | null, activeEnd?: Date | null) {
  const from = Math.max(start.getTime(), activeStart?.getTime() ?? start.getTime());
  const to = Math.min(end.getTime(), activeEnd?.getTime() ?? end.getTime());
  return Math.max(0, (to - from) / 1000);
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
