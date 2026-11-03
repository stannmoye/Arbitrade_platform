import type { FeeRoundingMode } from "./realized-profit-accounting";

export type PackageFeePolicyVersion = {
  packageId: number;
  version: number;
  feeRateBps: number;
  roundingMode: unknown;
  effectiveAt: Date | string;
};

export type ImmutableTradeFeeSnapshot = {
  feeRateBps: unknown;
  roundingMode: unknown;
  policyVersion: unknown;
};

/** Resolve the only valid optimistic-write mode from the locked current version. */
export function resolvePackageFeePolicyWrite(currentVersion: number | null, expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("Package fee policy expected version must be a non-negative integer");
  }
  if (currentVersion === null) {
    if (expectedVersion !== 0) throw new Error("Package fee policy is not configured");
    return { version: 1, initial: true };
  }
  if (expectedVersion === 0) throw new Error("Package fee policy is already configured");
  if (currentVersion !== expectedVersion) throw new Error("Package fee policy version is stale; reload history before editing");
  const version = expectedVersion + 1;
  if (!Number.isSafeInteger(version)) throw new Error("Package fee policy version has reached its limit");
  return { version, initial: false };
}

export function normalizeLegacyTradeFeePolicy(values: {
  feeRateBps: unknown;
  roundingMode: unknown;
  policyVersion: unknown;
}) {
  const feeRateBps = Number(values.feeRateBps);
  const policyVersion = Number(values.policyVersion);
  const roundingMode = String(values.roundingMode) as FeeRoundingMode;
  if (values.feeRateBps === null || values.feeRateBps === undefined || values.feeRateBps === "" || !Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) {
    throw new Error("Trading fee rate setting is invalid");
  }
  if (!["half_up", "down", "up", "half_even"].includes(roundingMode)) {
    throw new Error("Trading fee rounding setting is invalid");
  }
  if (values.policyVersion === null || values.policyVersion === undefined || values.policyVersion === "" || !Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    throw new Error("Trading fee policy version is invalid");
  }
  return { feeRateBps, roundingMode, policyVersion };
}

/**
 * Resolve the newest policy that is effective at the supplied allocation time.
 * A future scheduled version must never mask an older currently-effective row.
 */
export function selectLatestEffectivePackageFeePolicy<T extends PackageFeePolicyVersion>(
  rows: readonly T[],
  asOf: Date,
): T | null {
  const asOfTime = asOf.getTime();
  if (!Number.isFinite(asOfTime)) throw new Error("Fee policy selection time is invalid");
  const effective = rows.filter(row => {
    const effectiveTime = new Date(row.effectiveAt).getTime();
    return Number.isFinite(effectiveTime) && effectiveTime <= asOfTime;
  });
  effective.sort((left, right) => {
    const effectiveTimeDifference = new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime();
    return effectiveTimeDifference || Number(right.version) - Number(left.version);
  });
  return effective[0] ?? null;
}

/** Validate immutable allocation-time fee evidence; never replace it with a mutable global setting. */
export function normalizeImmutableTradeFeeSnapshot(snapshot: ImmutableTradeFeeSnapshot) {
  const feeRateBps = Number(snapshot.feeRateBps);
  const policyVersion = Number(snapshot.policyVersion);
  const roundingMode = String(snapshot.roundingMode) as FeeRoundingMode;
  if (snapshot.feeRateBps === null || snapshot.feeRateBps === undefined || snapshot.feeRateBps === "" || !Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) {
    throw new Error("Historical trade has no valid immutable fee-rate snapshot; manual reconciliation is required");
  }
  if (!["half_up", "down", "up", "half_even"].includes(roundingMode)) {
    throw new Error("Historical trade has no valid immutable fee-rounding snapshot; manual reconciliation is required");
  }
  if (snapshot.policyVersion === null || snapshot.policyVersion === undefined || snapshot.policyVersion === "" || !Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    throw new Error("Historical trade has no valid immutable fee-policy version; manual reconciliation is required");
  }
  // Migration 0068 added these columns with exactly this tuple as SQL defaults.
  // Without a package snapshot or other provenance, that tuple cannot prove that
  // a pre-migration trade captured the policy at allocation time.
  if (feeRateBps === 1500 && roundingMode === "half_up" && policyVersion === 1) {
    throw new Error("Historical trade fee fields match migration defaults and do not prove an allocation-time snapshot; manual reconciliation is required");
  }
  return { feeRateBps, roundingMode, policyVersion };
}
