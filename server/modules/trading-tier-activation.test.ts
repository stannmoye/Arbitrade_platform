import { describe, expect, it } from "vitest";
import { isTradingTierEnablingTransition } from "./trading-tier-activation";

describe("Trading tier activation policy gate", () => {
  it("requires policy readiness only for a disabled-to-enabled transition", () => {
    expect(isTradingTierEnablingTransition(false, true)).toBe(true);
    expect(isTradingTierEnablingTransition(true, true)).toBe(false);
    expect(isTradingTierEnablingTransition(true, false)).toBe(false);
    expect(isTradingTierEnablingTransition(false, false)).toBe(false);
  });
});
