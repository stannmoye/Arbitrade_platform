import { describe, expect, it } from "vitest";
import { resolveCustomerTheme, canCustomerSelectTheme } from "./theme-policy";
import type { ArbitradeTheme } from "../components/appearance-policy";

const enabledThemes: ArbitradeTheme[] = ["clean-light", "aurora-modern"];

describe("customer theme policy", () => {
  it("ignores a stale stored preference when customer choice is disabled", () => {
    expect(resolveCustomerTheme({
      storedTheme: "aurora-modern",
      policyDefault: "clean-light",
      enabledThemes,
      customerCanSelect: false,
    })).toBe("clean-light");
  });

  it("ignores a stored preference that is not in the administrator allow-list", () => {
    expect(resolveCustomerTheme({
      storedTheme: "midnight-premium",
      policyDefault: "clean-light",
      enabledThemes,
      customerCanSelect: true,
    })).toBe("clean-light");
  });

  it("preserves a stored preference only when choice is enabled and the theme is allowed", () => {
    expect(resolveCustomerTheme({
      storedTheme: "aurora-modern",
      policyDefault: "clean-light",
      enabledThemes,
      customerCanSelect: true,
    })).toBe("aurora-modern");
  });

  it("falls back safely for unknown or malformed stored values", () => {
    for (const storedTheme of ["unknown-theme", null, 17, {}, ""]) {
      expect(resolveCustomerTheme({
        storedTheme,
        policyDefault: "clean-light",
        enabledThemes,
        customerCanSelect: true,
      })).toBe("clean-light");
    }
  });

  it("rejects customer selection unless the candidate is allowed by the active policy", () => {
    expect(canCustomerSelectTheme("aurora-modern", enabledThemes, true)).toBe(true);
    expect(canCustomerSelectTheme("midnight-premium", enabledThemes, true)).toBe(false);
    expect(canCustomerSelectTheme("aurora-modern", enabledThemes, false)).toBe(false);
    expect(canCustomerSelectTheme("unknown-theme", enabledThemes, true)).toBe(false);
  });
});
