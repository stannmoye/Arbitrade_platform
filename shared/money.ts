import Decimal from "decimal.js";

export type RoundingMode = "half_up" | "down" | "up" | "half_even";

const roundingMap: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  down: Decimal.ROUND_DOWN,
  up: Decimal.ROUND_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
};

export type PrecisionConfig = {
  code: string;
  scale: number;
  minimumUnit: string;
  roundingMode: RoundingMode;
};

export class FixedMoney {
  readonly value: Decimal;
  readonly config: PrecisionConfig;

  constructor(value: Decimal.Value, config: PrecisionConfig) {
    this.config = config;
    this.value = new Decimal(value).toDecimalPlaces(config.scale, roundingMap[config.roundingMode]);
  }

  add(other: FixedMoney) {
    this.assertSameConfig(other);
    return new FixedMoney(this.value.plus(other.value), this.config);
  }

  subtract(other: FixedMoney) {
    this.assertSameConfig(other);
    return new FixedMoney(this.value.minus(other.value), this.config);
  }

  multiply(rate: Decimal.Value) {
    return new FixedMoney(this.value.times(rate), this.config);
  }

  isNegative() { return this.value.isNegative(); }
  isZero() { return this.value.isZero(); }
  isGreaterThan(other: FixedMoney) { this.assertSameConfig(other); return this.value.gt(other.value); }
  toString() { return this.value.toFixed(this.config.scale); }
  toJSON() { return { amount: this.toString(), asset: this.config.code, scale: this.config.scale, roundingMode: this.config.roundingMode }; }

  private assertSameConfig(other: FixedMoney) {
    if (other.config.code !== this.config.code || other.config.scale !== this.config.scale || other.config.roundingMode !== this.config.roundingMode) {
      throw new Error("Money precision configuration mismatch");
    }
  }
}

export function assertValidPrecision(config: PrecisionConfig) {
  if (!/^[A-Z0-9._-]{1,32}$/.test(config.code)) throw new Error("Invalid asset code");
  if (!Number.isInteger(config.scale) || config.scale < 0 || config.scale > 30) throw new Error("Invalid precision scale");
  const unit = new Decimal(config.minimumUnit);
  if (!unit.gt(0) || unit.gte(1)) throw new Error("Minimum unit must be greater than zero and less than one");
  const expected = new Decimal(1).div(new Decimal(10).pow(config.scale));
  if (!unit.eq(expected)) throw new Error("Minimum unit must match the configured scale");
  if (!(config.roundingMode in roundingMap)) throw new Error("Unsupported rounding mode");
}

export function quantize(value: Decimal.Value, config: PrecisionConfig) {
  assertValidPrecision(config);
  return new FixedMoney(value, config);
}

/** Convert native ledger minor units to native asset units. */
export function minorToMajor(minor: number, scale: number): number {
  return Number(minor || 0) / Math.pow(10, scale);
}

/** Convert native asset minor units to the current USD reference value. */
export function nativeMinorToUsd(minor: number, scale: number, usdRate: number): number {
  return minorToMajor(minor, scale) * usdRate;
}

/**
 * Convert native ledger minor units to USD minor units without binary floating-point
 * arithmetic. The FX rate is expressed as USD per one native currency unit. The
 * result is quantized once at the USD ledger boundary using half-up rounding.
 */
export function nativeMinorToUsdMinorExact(minor: number, scale: number, usdRate: Decimal.Value): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Native amount must be a non-negative safe integer in minor units");
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) throw new Error("Invalid native currency precision scale");
  let rate: Decimal;
  try { rate = new Decimal(usdRate); } catch { throw new Error("Invalid USD conversion rate"); }
  if (!rate.isFinite() || !rate.gt(0)) throw new Error("USD conversion rate must be finite and positive");
  const usdMinor = new Decimal(minor)
    .times(rate)
    .times(new Decimal(10).pow(2 - scale))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!usdMinor.isFinite() || !usdMinor.isInteger() || !usdMinor.abs().lte(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Converted USD minor amount exceeds the safe integer range");
  }
  return usdMinor.toNumber();
}

/**
 * Allocate a persisted minor-unit attribution proportionally to a partial reversal.
 * The final/full reversal should consume the exact remaining attribution; partial
 * reversals use decimal arithmetic and one documented half-up rounding.
 */
export function proportionalMinorAmount(totalMinor: number, partMinor: number, wholeMinor: number): number {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error("Total attribution must be a non-negative safe integer");
  if (!Number.isSafeInteger(partMinor) || partMinor <= 0) throw new Error("Partial amount must be a positive safe integer");
  if (!Number.isSafeInteger(wholeMinor) || wholeMinor <= 0 || partMinor > wholeMinor) throw new Error("Whole amount must be a safe integer at least as large as the partial amount");
  const allocated = new Decimal(totalMinor).times(partMinor).div(wholeMinor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!allocated.isFinite() || !allocated.isInteger() || allocated.lt(0) || allocated.gt(totalMinor) || !allocated.lte(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Proportional attribution exceeds the safe integer range");
  }
  return allocated.toNumber();
}

/** Convert whole USD units into native ledger minor units using the same live registry rate. */
export function usdUnitsToNativeMinor(usdUnits: number, scale: number, usdRate: number): number {
  if (!Number.isFinite(usdUnits) || usdUnits < 0 || !Number.isFinite(usdRate) || usdRate <= 0) throw new Error("Invalid currency conversion inputs");
  return Math.max(1, Math.round((usdUnits / usdRate) * Math.pow(10, scale)));
}
