import { describe, expect, it } from "vitest";
import { canCustomerSelectTheme, resolveCustomerTheme } from "../client/src/contexts/theme-policy";

const enabledThemes = ["original", "clean-light", "aurora-modern"] as const;

describe("customer theme policy", () => {
  it("uses an allowed saved preference only when customer choice is explicitly enabled", () => {
    expect(resolveCustomerTheme({
      storedTheme: "clean-light",
      policyDefault: "original",
      enabledThemes,
      customerCanSelect: true,
    })).toBe("clean-light");

    expect(resolveCustomerTheme({
      storedTheme: "clean-light",
      policyDefault: "original",
      enabledThemes,
      customerCanSelect: false,
    })).toBe("original");
  });

  it("falls back to the published default for a saved theme removed from the allow-list", () => {
    expect(resolveCustomerTheme({
      storedTheme: "midnight-premium",
      policyDefault: "aurora-modern",
      enabledThemes,
      customerCanSelect: true,
    })).toBe("aurora-modern");
  });

  it.each([null, undefined, "", "not-a-theme", 5, { theme: "clean-light" }])(
    "rejects malformed saved preferences: %j",
    storedTheme => {
      expect(resolveCustomerTheme({
        storedTheme,
        policyDefault: "original",
        enabledThemes,
        customerCanSelect: true,
      })).toBe("original");
    },
  );

  it("allows only explicitly enabled known themes when customer choice is on", () => {
    expect(canCustomerSelectTheme("clean-light", enabledThemes, true)).toBe(true);
    expect(canCustomerSelectTheme("midnight-premium", enabledThemes, true)).toBe(false);
    expect(canCustomerSelectTheme("clean-light", enabledThemes, false)).toBe(false);
    expect(canCustomerSelectTheme("unknown", enabledThemes, true)).toBe(false);
    expect(canCustomerSelectTheme(null, enabledThemes, true)).toBe(false);
  });
});
