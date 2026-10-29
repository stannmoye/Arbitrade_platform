import { randomInt as cryptoRandomInt } from "node:crypto";

/**
 * Immutable server-side settings for one Trading package.
 *
 * All percentages are stored as integer basis points (2.7% = 270), durations
 * as integer seconds, and capital/profit as integer wallet minor units.
 */
export type TradingPopupPackagePolicy = {
  packageId: number;
  packageVersion: number;
  packageName: string;
  badgeLabel: string | null;
  minimumCapitalMinor: number;
  maximumCapitalMinor: number;
  minimumProfitBps: number;
  maximumProfitBps: number;
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  popupDisplaySeconds: number;
  opportunitiesPerDay: number;
  enabled: boolean;
};

export type TradingPopupSnapshot = {
  customerId: number;
  customerPackageId: number;
  packageId: number;
  packageVersion: number;
  companyId: string;
  capitalMinor: number;
  profitRateBps: number;
  configuredGrossProfitMinor: number;
  durationSeconds: number;
  startedAt: string;
  dueAt: string;
};

export type InclusiveIntegerSampler = (minimum: number, maximumExclusive: number) => number;

const defaultSampler: InclusiveIntegerSampler = (minimum, maximumExclusive) =>
  cryptoRandomInt(minimum, maximumExclusive);

function assertSafeInteger(name: string, value: number, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
}

export function validateTradingPopupPolicy(policy: TradingPopupPackagePolicy): TradingPopupPackagePolicy {
  assertSafeInteger("packageId", policy.packageId, 1);
  assertSafeInteger("packageVersion", policy.packageVersion, 1);
  assertSafeInteger("minimumCapitalMinor", policy.minimumCapitalMinor, 1);
  assertSafeInteger("maximumCapitalMinor", policy.maximumCapitalMinor, 1);
  assertSafeInteger("minimumProfitBps", policy.minimumProfitBps, 0);
  assertSafeInteger("maximumProfitBps", policy.maximumProfitBps, 0);
  assertSafeInteger("minimumDurationSeconds", policy.minimumDurationSeconds, 1);
  assertSafeInteger("maximumDurationSeconds", policy.maximumDurationSeconds, 1);
  assertSafeInteger("popupDisplaySeconds", policy.popupDisplaySeconds, 1);
  assertSafeInteger("opportunitiesPerDay", policy.opportunitiesPerDay, 0);

  if (!policy.packageName.trim()) throw new Error("Package name is required");
  if (policy.minimumCapitalMinor > policy.maximumCapitalMinor) {
    throw new RangeError("Minimum capital cannot exceed maximum capital");
  }
  if (policy.maximumProfitBps > 0 && policy.minimumProfitBps < 1) {
    throw new RangeError("Configured profit range must have a positive minimum rate");
  }
  if (policy.minimumProfitBps > policy.maximumProfitBps) {
    throw new RangeError("Minimum profit percentage cannot exceed maximum profit percentage");
  }
  if (policy.maximumProfitBps > 10_000) {
    throw new RangeError("Maximum configured profit rate exceeds the supported 100% safety bound");
  }
  if (policy.minimumDurationSeconds > policy.maximumDurationSeconds) {
    throw new RangeError("Minimum trade duration cannot exceed maximum trade duration");
  }
  if (policy.maximumDurationSeconds > 31_536_000) {
    throw new RangeError("Trade duration cannot exceed one year");
  }
  if (policy.popupDisplaySeconds > 86_400) {
    throw new RangeError("Pop-up display duration cannot exceed one day");
  }
  if (policy.badgeLabel !== null && policy.badgeLabel.length > 48) {
    throw new RangeError("Package badge label cannot exceed 48 characters");
  }
  return policy;
}

/** Inclusive, unbiased selection with an injectable sampler for tests. */
export function chooseInclusiveInteger(
  minimum: number,
  maximum: number,
  sampler: InclusiveIntegerSampler = defaultSampler,
): number {
  assertSafeInteger("minimum", minimum, 0);
  assertSafeInteger("maximum", maximum, 0);
  if (minimum > maximum) throw new RangeError("Minimum cannot exceed maximum");
  if (maximum >= Number.MAX_SAFE_INTEGER || maximum - minimum + 1 >= 2 ** 48) throw new RangeError("Selection range exceeds secure sampler limits");
  const selected = sampler(minimum, maximum + 1);
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new RangeError("Random sampler returned a value outside the configured range");
  }
  return selected;
}

/** Calculates profit in wallet minor units using half-up integer rounding. */
export function calculateConfiguredProfitMinor(capitalMinor: number, profitRateBps: number): number {
  assertSafeInteger("capitalMinor", capitalMinor, 1);
  assertSafeInteger("profitRateBps", profitRateBps, 0);
  const numerator = BigInt(capitalMinor) * BigInt(profitRateBps);
  const rounded = (numerator + 5_000n) / 10_000n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Calculated profit exceeds the safe integer range");
  }
  return Number(rounded);
}

/**
 * Takes one immutable snapshot at allocation time. Persist this complete object
 * transactionally with the allocation; retries must reuse it, never resample it.
 * This calculation alone is not evidence that a trade executed or a profit is
 * realized. Ledger credit requires the existing auditable settlement workflow.
 */
export function createTradingPopupSnapshot(input: {
  customerId: number;
  customerPackageId: number;
  companyId: string;
  capitalMinor: number;
  policy: TradingPopupPackagePolicy;
  now?: Date;
  sampler?: InclusiveIntegerSampler;
}): TradingPopupSnapshot {
  const policy = validateTradingPopupPolicy(input.policy);
  assertSafeInteger("customerId", input.customerId, 1);
  assertSafeInteger("customerPackageId", input.customerPackageId, 1);
  assertSafeInteger("capitalMinor", input.capitalMinor, 1);
  if (!input.companyId.trim()) throw new Error("A catalogue company ID is required");
  if (!policy.enabled) throw new Error("Trading package policy is disabled");
  if (input.capitalMinor < policy.minimumCapitalMinor || input.capitalMinor > policy.maximumCapitalMinor) {
    throw new RangeError("Capital is outside the package's configured bounds");
  }

  const sampler = input.sampler ?? defaultSampler;
  const profitRateBps = chooseInclusiveInteger(policy.minimumProfitBps, policy.maximumProfitBps, sampler);
  if (profitRateBps < 1) throw new RangeError("Selected profit rate must be positive");
  const durationSeconds = chooseInclusiveInteger(
    policy.minimumDurationSeconds,
    policy.maximumDurationSeconds,
    sampler,
  );
  const startedAt = input.now ?? new Date();
  if (!Number.isFinite(startedAt.getTime())) throw new RangeError("Trade start time is invalid");
  const configuredGrossProfitMinor = calculateConfiguredProfitMinor(input.capitalMinor, profitRateBps);
  if (configuredGrossProfitMinor < 1) throw new RangeError("Configured capital and rate do not produce a positive minor-unit profit");
  const dueAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  if (!Number.isFinite(dueAt.getTime())) throw new RangeError("Trade due time is invalid");

  return {
    customerId: input.customerId,
    customerPackageId: input.customerPackageId,
    packageId: policy.packageId,
    packageVersion: policy.packageVersion,
    companyId: input.companyId,
    capitalMinor: input.capitalMinor,
    profitRateBps,
    configuredGrossProfitMinor,
    durationSeconds,
    startedAt: startedAt.toISOString(),
    dueAt: dueAt.toISOString(),
  };
}
