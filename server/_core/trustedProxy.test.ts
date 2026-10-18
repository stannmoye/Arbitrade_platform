import { describe, expect, it } from "vitest";
import { resolveTrustedProxyHops } from "./trustedProxy";

describe("trusted proxy configuration", () => {
  it("does not trust forwarded headers by default or when configured with zero hops", () => {
    expect(resolveTrustedProxyHops(undefined)).toBe(false);
    expect(resolveTrustedProxyHops("")).toBe(false);
    expect(resolveTrustedProxyHops("0")).toBe(false);
  });

  it("accepts an explicit positive proxy hop count", () => {
    expect(resolveTrustedProxyHops("1")).toBe(1);
    expect(resolveTrustedProxyHops("2")).toBe(2);
    expect(resolveTrustedProxyHops(" 1 ")).toBe(1);
  });

  it("rejects ambiguous or excessive proxy settings", () => {
    for (const value of ["true", "-1", "1.5", "11", "NaN", "1,2"]) {
      expect(() => resolveTrustedProxyHops(value)).toThrow(/TRUST_PROXY_HOPS/);
    }
  });
});
