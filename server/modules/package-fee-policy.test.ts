import { describe, expect, it } from "vitest";
import { classifyTradeFeeSnapshot, normalizeImmutableTradeFeeSnapshot, normalizeLegacyTradeFeePolicy, resolvePackageFeePolicyWrite, selectLatestEffectivePackageFeePolicy } from "./package-fee-policy";

const policy = (version: number, effectiveAt: string, feeRateBps = version * 100) => ({
  packageId: 42,
  version,
  feeRateBps,
  roundingMode: "half_up" as const,
  effectiveAt,
});

describe("package fee policy optimistic writes", () => {
  it("allows version zero to initialize only a package with no existing policy", () => {
    expect(resolvePackageFeePolicyWrite(null, 0)).toEqual({ version: 1, initial: true });
    expect(() => resolvePackageFeePolicyWrite(1, 0)).toThrow(/already configured/);
  });

  it("requires an existing version for positive optimistic updates", () => {
    expect(resolvePackageFeePolicyWrite(1, 1)).toEqual({ version: 2, initial: false });
    expect(() => resolvePackageFeePolicyWrite(null, 1)).toThrow(/not configured/);
    expect(() => resolvePackageFeePolicyWrite(2, 1)).toThrow(/stale/);
    expect(() => resolvePackageFeePolicyWrite(null, -1)).toThrow(/non-negative integer/);
  });
});

describe("package fee effective-time resolution", () => {
  it("chooses the latest version effective at allocation time instead of a future scheduled version", () => {
    const asOf = new Date("2026-11-03T14:00:00.000Z");
    const selected = selectLatestEffectivePackageFeePolicy([
      policy(1, "2026-10-01T00:00:00.000Z", 1500),
      policy(2, "2026-11-01T00:00:00.000Z", 1750),
      policy(3, "2026-11-04T00:00:00.000Z", 2200),
    ], asOf);
    expect(selected).toMatchObject({ version: 2, feeRateBps: 1750 });
  });

  it("returns no policy when the package has only future versions", () => {
    const selected = selectLatestEffectivePackageFeePolicy([
      policy(1, "2026-11-04T00:00:00.000Z", 1500),
    ], new Date("2026-11-03T14:00:00.000Z"));
    expect(selected).toBeNull();
  });

  it("uses version as a deterministic tie-breaker for same-time effective rows", () => {
    const selected = selectLatestEffectivePackageFeePolicy([
      policy(1, "2026-11-01T00:00:00.000Z", 1000),
      policy(2, "2026-11-01T00:00:00.000Z", 2000),
    ], new Date("2026-11-03T14:00:00.000Z"));
    expect(selected).toMatchObject({ version: 2, feeRateBps: 2000 });
  });

  it("prefers each historical trade's saved fee snapshot over mutable global settings", () => {
    expect(normalizeImmutableTradeFeeSnapshot({ feeRateBps: 2375, roundingMode: "half_even", policyVersion: 8 }))
      .toEqual({ feeRateBps: 2375, roundingMode: "half_even", policyVersion: 8 });
  });

  it("rejects historical trade settlement when any immutable fee evidence is missing or invalid", () => {
    expect(() => normalizeImmutableTradeFeeSnapshot({ feeRateBps: null, roundingMode: "half_up", policyVersion: 1 }))
      .toThrow(/valid immutable fee-rate snapshot/);
    expect(() => normalizeImmutableTradeFeeSnapshot({ feeRateBps: 1500, roundingMode: null, policyVersion: 1 }))
      .toThrow(/valid immutable fee-rounding snapshot/);
    expect(() => normalizeImmutableTradeFeeSnapshot({ feeRateBps: 1500, roundingMode: "half_up", policyVersion: null }))
      .toThrow(/valid immutable fee-policy version/);
    expect(() => normalizeImmutableTradeFeeSnapshot({ feeRateBps: 1500, roundingMode: "half_up", policyVersion: 1 }))
      .toThrow(/match migration defaults/);
  });

  it("labels migration-default legacy fee fields for read-only review without treating them as evidence", () => {
    expect(classifyTradeFeeSnapshot({ feeRateBps: 1500, roundingMode: "half_up", policyVersion: 1 }))
      .toBe("unsnapshotted_needs_review");
    expect(classifyTradeFeeSnapshot({ feeRateBps: 2375, roundingMode: "half_even", policyVersion: 2 }))
      .toBe("snapshotted");
  });

  it("fails closed for missing, blank, or invalid legacy global settings instead of applying defaults", () => {
    expect(normalizeLegacyTradeFeePolicy({ feeRateBps: "1500", roundingMode: "half_up", policyVersion: "1" }))
      .toEqual({ feeRateBps: 1500, roundingMode: "half_up", policyVersion: 1 });
    expect(() => normalizeLegacyTradeFeePolicy({ feeRateBps: null, roundingMode: "half_up", policyVersion: "1" }))
      .toThrow(/fee rate setting is invalid/);
    expect(() => normalizeLegacyTradeFeePolicy({ feeRateBps: "", roundingMode: "half_up", policyVersion: "1" }))
      .toThrow(/fee rate setting is invalid/);
    expect(() => normalizeLegacyTradeFeePolicy({ feeRateBps: "1500", roundingMode: "invalid", policyVersion: "1" }))
      .toThrow(/fee rounding setting is invalid/);
    expect(() => normalizeLegacyTradeFeePolicy({ feeRateBps: "1500", roundingMode: "half_up", policyVersion: "0" }))
      .toThrow(/fee policy version is invalid/);
  });
});
