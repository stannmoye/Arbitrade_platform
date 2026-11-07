import { describe, expect, it } from "vitest";
import {
  FAIL_CLOSED_TRADE_GLOBAL_CONTROLS,
  parseTradeGlobalControlPolicy,
  previewLegacyTradeGlobalControls,
  requiresPreviousSettlementForAllocation,
  type LegacyPackageControlRow,
} from "./trading-global-policy";

const row = (packageName: string, overrides: Partial<LegacyPackageControlRow> = {}): LegacyPackageControlRow => ({
  packageName,
  policyEnabled: true,
  automaticDelivery: true,
  companyRotationEnabled: true,
  randomizationEnabled: true,
  burstEnabled: true,
  requirePreviousSettlement: true,
  ...overrides,
});

describe("global Trade control policy", () => {
  it("keeps the runtime fail-closed when the canonical row is absent or malformed", () => {
    expect(FAIL_CLOSED_TRADE_GLOBAL_CONTROLS).toEqual({
      tierPolicyMasterEnabled: false,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: false,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: false,
      requirePreviousSettlement: true,
    });
    expect(parseTradeGlobalControlPolicy(null)).toBeNull();
    expect(parseTradeGlobalControlPolicy("not-json")).toBeNull();
    expect(parseTradeGlobalControlPolicy({ ...FAIL_CLOSED_TRADE_GLOBAL_CONTROLS, policyVersion: "invalid" })).toBeNull();
  });

  it("preserves prior behavior for uniform legacy-ON package controls", () => {
    const result = previewLegacyTradeGlobalControls([row("Gold"), row("Silver")]);
    expect(result.policy).toEqual({
      tierPolicyMasterEnabled: true,
      informationalPopupDeliveryEnabled: true,
      companyRotationEnabled: true,
      randomizedTimingEnabled: true,
      burstDeliveryEnabled: true,
      requirePreviousSettlement: true,
    });
    expect(result.sourcePolicyCount).toBe(2);
    expect(result.conflicts).toEqual({
      tierPolicyMasterEnabled: false,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: false,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: false,
      requirePreviousSettlement: false,
    });
  });

  it("keeps each new global master OFF if any legacy package copy was OFF and records exact affected tiers", () => {
    const result = previewLegacyTradeGlobalControls([
      row("Alpha"),
      row("Beta", { policyEnabled: false, automaticDelivery: false, companyRotationEnabled: false }),
      row("Gamma", { randomizationEnabled: false, burstEnabled: false }),
    ]);
    expect(result.policy).toEqual({
      tierPolicyMasterEnabled: false,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: false,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: false,
      requirePreviousSettlement: true,
    });
    expect(result.offPackages).toEqual({
      tierPolicyMasterEnabled: ["Beta"],
      informationalPopupDeliveryEnabled: ["Beta"],
      companyRotationEnabled: ["Beta"],
      randomizedTimingEnabled: ["Gamma"],
      burstDeliveryEnabled: ["Gamma"],
      requirePreviousSettlement: [],
    });
    expect(result.conflicts).toEqual({
      tierPolicyMasterEnabled: true,
      informationalPopupDeliveryEnabled: true,
      companyRotationEnabled: true,
      randomizedTimingEnabled: true,
      burstDeliveryEnabled: true,
      requirePreviousSettlement: false,
    });
  });

  it("fails closed for delivery masters when there are no legacy package rows", () => {
    const result = previewLegacyTradeGlobalControls([]);
    expect(result.sourcePolicyCount).toBe(0);
    expect(result.policy.tierPolicyMasterEnabled).toBe(false);
    expect(result.policy.informationalPopupDeliveryEnabled).toBe(false);
    expect(result.policy.companyRotationEnabled).toBe(false);
    expect(result.policy.randomizedTimingEnabled).toBe(false);
    expect(result.policy.burstDeliveryEnabled).toBe(false);
    expect(result.policy.requirePreviousSettlement).toBe(true);
  });

  it("allows the persisted previous-settlement master to be OFF while rejecting malformed policy", () => {
    const valid = { ...FAIL_CLOSED_TRADE_GLOBAL_CONTROLS, policyVersion: 3, updatedBy: 7, updatedAt: "2026-11-03T00:00:00.000Z" };
    expect(parseTradeGlobalControlPolicy(valid)).toMatchObject({ policyVersion: 3, updatedBy: 7 });
    const off = { ...valid, requirePreviousSettlement: false };
    expect(parseTradeGlobalControlPolicy(off)).toMatchObject({ requirePreviousSettlement: false, policyVersion: 3 });
    expect(parseTradeGlobalControlPolicy({ ...valid, companyRotationEnabled: "false" })).toBeNull();
    expect(parseTradeGlobalControlPolicy({ ...valid, requirePreviousSettlement: 0 })).toBeNull();
    expect(parseTradeGlobalControlPolicy({ ...valid, policyVersion: 0 })).toBeNull();
    expect(parseTradeGlobalControlPolicy({ ...valid, updatedBy: -1 })).toBeNull();
  });

  it("enforces only the saved prerequisite state and fails closed when global policy is unavailable", () => {
    const on = parseTradeGlobalControlPolicy({ ...FAIL_CLOSED_TRADE_GLOBAL_CONTROLS, policyVersion: 1 });
    const off = parseTradeGlobalControlPolicy({ ...FAIL_CLOSED_TRADE_GLOBAL_CONTROLS, requirePreviousSettlement: false, policyVersion: 2 });
    expect(requiresPreviousSettlementForAllocation(on)).toBe(true);
    expect(requiresPreviousSettlementForAllocation(off)).toBe(false);
    expect(requiresPreviousSettlementForAllocation(null)).toBe(true);
    expect(requiresPreviousSettlementForAllocation(undefined)).toBe(true);
  });
});
