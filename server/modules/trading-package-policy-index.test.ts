import { describe, expect, it } from "vitest";
import { indexTradingPackagePolicies, normalizeTradingPackagePolicyKey } from "./trading-package-policy-index";

describe("Trading package policy identity", () => {
  it("normalizes package-name case consistently", () => {
    expect(normalizeTradingPackagePolicyKey("Sterling Reserve")).toBe("sterling reserve");
    const policies = indexTradingPackagePolicies([{ packageName: "Sterling Reserve", policyVersion: 4 }]);
    expect(policies.get(normalizeTradingPackagePolicyKey(" sterling reserve "))?.policyVersion).toBe(4);
  });

  it("fails closed when normalized package identities are ambiguous", () => {
    const policies = indexTradingPackagePolicies([
      { packageName: "Sterling Reserve", policyVersion: 4 },
      { packageName: "STERLING RESERVE", policyVersion: 5 },
    ]);
    expect(policies.has("sterling reserve")).toBe(false);
  });

  it("ignores empty package names", () => {
    expect(indexTradingPackagePolicies([{ packageName: "", policyVersion: 1 }]).size).toBe(0);
  });
});
