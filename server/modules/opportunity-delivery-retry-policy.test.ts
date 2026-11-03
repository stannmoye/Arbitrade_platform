import { describe, expect, it } from "vitest";
import {
  canReplaceDeliveryRetryPolicy,
  FAIL_CLOSED_DELIVERY_RETRY_POLICY,
  normalizeDeliveryRetryEffectiveAt,
  parseDeliveryRetryPolicy,
  validateDeliveryRetryPolicyInput,
} from "./opportunity-delivery-retry-policy";

const now = new Date("2026-11-03T14:00:00.000Z");
const active = {
  policy: "temporary" as const,
  maxAttempts: 3,
  intervalsSeconds: [30, 90],
  configured: true,
  version: 2,
  effectiveAt: "2026-11-03T13:00:00.000Z",
  updatedBy: 8,
  updatedAt: "2026-11-03T13:00:00.000Z",
  reason: "Saved active policy",
};

describe("delivery retry policy contract", () => {
  it("keeps an active schedule from being overwritten by a future-effective policy", () => {
    expect(canReplaceDeliveryRetryPolicy(active, "2026-11-04T00:00:00.000Z", now)).toBe(false);
    expect(canReplaceDeliveryRetryPolicy(active, "2026-11-03T14:00:00.000Z", now)).toBe(true);
    expect(canReplaceDeliveryRetryPolicy(FAIL_CLOSED_DELIVERY_RETRY_POLICY, "2026-11-04T00:00:00.000Z", now)).toBe(true);
  });

  it("normalizes an immediate policy change to the save instant without backdating it", () => {
    const savedAt = new Date("2026-11-03T14:05:00.000Z");
    expect(normalizeDeliveryRetryEffectiveAt("2026-11-03T13:59:00.000Z", savedAt)).toBe("2026-11-03T14:05:00.000Z");
    expect(normalizeDeliveryRetryEffectiveAt("2026-11-04T00:00:00.000Z", savedAt)).toBe("2026-11-04T00:00:00.000Z");
  });

  it("rejects malformed persisted numbers instead of coercing them into a schedule", () => {
    const valid = JSON.stringify({
      policy: "temporary", maxAttempts: 3, intervalsSeconds: [30, 90], configured: true,
      version: 2, effectiveAt: "2026-11-03T13:00:00.000Z", updatedBy: 8,
      updatedAt: "2026-11-03T13:00:00.000Z", reason: "Valid saved policy",
    });
    expect(parseDeliveryRetryPolicy(valid)?.intervalsSeconds).toEqual([30, 90]);
    expect(parseDeliveryRetryPolicy(valid.replace('"maxAttempts":3', '"maxAttempts":"3"'))).toBeNull();
    expect(parseDeliveryRetryPolicy(valid.replace('[30,90]', '["30",90]'))).toBeNull();
    expect(parseDeliveryRetryPolicy(valid.replace('"configured":true', '"configured":"true"'))).toBeNull();
  });

  it("uses consistent total-attempt and interval bounds for admin input", () => {
    const common = { effectiveAt: "2026-11-03T14:00:00.000Z", reason: "Reviewed policy change" };
    expect(() => validateDeliveryRetryPolicyInput({ ...common, policy: "none", maxAttempts: 1, intervalsSeconds: [] })).not.toThrow();
    expect(() => validateDeliveryRetryPolicyInput({ ...common, policy: "none", maxAttempts: 3, intervalsSeconds: [] })).toThrow("exactly one initial");
    expect(() => validateDeliveryRetryPolicyInput({ ...common, policy: "temporary", maxAttempts: 3, intervalsSeconds: [4, 60] })).toThrow("5 to 3,600");
    expect(() => validateDeliveryRetryPolicyInput({ ...common, policy: "temporary", maxAttempts: 3, intervalsSeconds: [5, 3601] })).toThrow("5 to 3,600");
    expect(() => validateDeliveryRetryPolicyInput({ ...common, policy: "temporary", maxAttempts: 2, intervalsSeconds: [30] })).not.toThrow();
  });
});
