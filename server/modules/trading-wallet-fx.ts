export type FxRateSnapshot = {
  currency: string;
  scale: number;
  rateUsdPerUnit: string;
  provider: string;
  sourceDate: string;
  fetchedAt: Date;
};

export type AvailableWallet = {
  currency: string;
  scale: number;
  availableMinor: number;
  rate?: FxRateSnapshot | null;
};

export type CrossWalletDebit = {
  currency: string;
  amountMinor: number;
  convertedTargetMinor: number;
  roundingExcessSourceMinor: number;
  roundingExcessUsdScaled: string;
  rate: FxRateSnapshot;
};

export type CrossWalletFundingPlan = {
  targetCreditMinor: number;
  sourceDebits: CrossWalletDebit[];
};

const RATE_DECIMAL_PLACES = 12;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMAL_PLACES);

function assertMinor(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
}

function pow10(scale: number): bigint {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 18) {
    throw new RangeError("Wallet currency scale must be an integer between 0 and 18");
  }
  return 10n ** BigInt(scale);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("FX denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

/** Parse decimal or scientific-notation API rates into fixed-precision integers. */
function rateToScaled(rate: string): bigint {
  const match = String(rate).trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || match[1] === "-") throw new RangeError("FX rate must be a positive decimal");
  const integerPart = match[2]!;
  const fractionalPart = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new RangeError("FX rate exponent is invalid");
  const digits = BigInt(integerPart + fractionalPart);
  const power = RATE_DECIMAL_PLACES + exponent - fractionalPart.length;
  const scaled = power >= 0
    ? digits * (10n ** BigInt(power))
    : (digits + (10n ** BigInt(-power)) / 2n) / (10n ** BigInt(-power));
  if (scaled <= 0n) throw new RangeError("FX rate is below supported precision or is zero");
  return scaled;
}

function safeNumber(value: bigint, name: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${name} exceeds safe integer limits`);
  return Number(value);
}

/**
 * Plans an all-or-nothing conversion into the target wallet's currency.
 * Rates are USD per one native currency unit and must be freshly fetched and
 * persisted by the caller. This function does not mutate balances or write ledgers.
 */
export function planCrossWalletFunding(input: {
  requiredTargetMinor: number;
  targetAvailableMinor: number;
  targetRate: FxRateSnapshot;
  sourceWallets: AvailableWallet[];
}): CrossWalletFundingPlan {
  assertMinor("requiredTargetMinor", input.requiredTargetMinor);
  assertMinor("targetAvailableMinor", input.targetAvailableMinor);
  if (input.requiredTargetMinor < 1) throw new RangeError("Required target capital must be positive");
  const targetRateScaled = rateToScaled(input.targetRate.rateUsdPerUnit);
  const targetScaleFactor = pow10(input.targetRate.scale);
  let remainingTargetMinor = Math.max(0, input.requiredTargetMinor - input.targetAvailableMinor);
  const sourceDebits: CrossWalletDebit[] = [];

  const ordered = [...input.sourceWallets]
    .filter(wallet => wallet.currency.toUpperCase() !== input.targetRate.currency.toUpperCase())
    .sort((a, b) => a.currency.localeCompare(b.currency));

  for (const wallet of ordered) {
    if (remainingTargetMinor <= 0) break;
    assertMinor(`${wallet.currency} availableMinor`, wallet.availableMinor);
    if (wallet.availableMinor === 0 || !wallet.rate) continue;
    const sourceRateScaled = rateToScaled(wallet.rate.rateUsdPerUnit);
    const sourceScaleFactor = pow10(wallet.scale);
    const remaining = BigInt(remainingTargetMinor);
    const available = BigInt(wallet.availableMinor);

    const neededSourceMinor = ceilDiv(
      remaining * targetRateScaled * sourceScaleFactor,
      targetScaleFactor * sourceRateScaled,
    );

    let sourceDebit: bigint;
    let targetCredit: bigint;
    if (available >= neededSourceMinor) {
      sourceDebit = neededSourceMinor;
      targetCredit = remaining;
    } else {
      sourceDebit = available;
      targetCredit = (sourceDebit * sourceRateScaled * targetScaleFactor) /
        (sourceScaleFactor * targetRateScaled);
      if (targetCredit > remaining) targetCredit = remaining;
    }
    if (sourceDebit <= 0n || targetCredit <= 0n) continue;

    const minimumSourceForCredit = ceilDiv(
      targetCredit * targetRateScaled * sourceScaleFactor,
      targetScaleFactor * sourceRateScaled,
    );
    const roundingExcess = sourceDebit > minimumSourceForCredit ? sourceDebit - minimumSourceForCredit : 0n;
    const sourceValueUsdScaled = (sourceDebit * sourceRateScaled) / sourceScaleFactor;
    const targetValueUsdScaled = (targetCredit * targetRateScaled) / targetScaleFactor;
    const roundingExcessUsdScaled = sourceValueUsdScaled > targetValueUsdScaled ? sourceValueUsdScaled - targetValueUsdScaled : 0n;
    const sourceAmountMinor = safeNumber(sourceDebit, "Source debit");
    const convertedTargetMinor = safeNumber(targetCredit, "Converted target credit");
    sourceDebits.push({
      currency: wallet.currency.toUpperCase(),
      amountMinor: sourceAmountMinor,
      convertedTargetMinor,
      roundingExcessSourceMinor: safeNumber(roundingExcess, "FX rounding excess"),
      roundingExcessUsdScaled: roundingExcessUsdScaled.toString(),
      rate: wallet.rate,
    });
    remainingTargetMinor -= convertedTargetMinor;
  }

  if (remainingTargetMinor > 0) throw new Error("Insufficient combined spendable wallet balance at current exchange rates");
  const targetCreditMinor = sourceDebits.reduce((sum, debit) => {
    const next = BigInt(sum) + BigInt(debit.convertedTargetMinor);
    return safeNumber(next, "Total converted target credit");
  }, 0);
  return { targetCreditMinor, sourceDebits };
}
