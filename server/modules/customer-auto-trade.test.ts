import { describe, expect, it } from "vitest";
import { isCustomerAutoTradeExplicitlyEnabled } from "./customer-auto-trade";

describe("customer automatic-trading opt-in", () => {
  it("enables execution only for an explicit enabled mode", () => {
    expect(isCustomerAutoTradeExplicitlyEnabled("enabled")).toBe(true);
  });

  it.each(["disabled", "inherit", "", "unknown", null, undefined])(
    "does not enable execution for mode %s",
    (mode) => {
      expect(isCustomerAutoTradeExplicitlyEnabled(mode)).toBe(false);
    },
  );
});
