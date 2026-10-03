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
