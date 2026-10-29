import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerEligibility = readFileSync(
  new URL("../client/src/components/CustomerTradingEligibility.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Trading UI policy acceptance contracts", () => {
  it("keeps customer tier progress informational and automatic", () => {
    expect(customerEligibility).toContain("trpc.customer.tradingEligibility.useQuery");
    expect(customerEligibility).toContain("Your package will be assigned automatically when you qualify.");
    expect(customerEligibility).toContain("Only qualifying credits manually issued by an administrator count.");
    expect(customerEligibility).toContain("data?.dailyOpportunityAllowance");
    expect(customerEligibility).toContain("eligibilityQuery.refetch()");
    expect(customerEligibility).toContain("role=\"alert\"");
    expect(customerEligibility).toContain("role=\"status\"");
    expect(customerEligibility).not.toMatch(/activatePackage|subscribeToPackage|purchasePackage|activate\s+package/i);
  });

  it("does not mount a second package-management experience outside the existing customer portal", () => {
    expect(appSource).toContain("CustomerTradingEligibility");
    expect(appSource).not.toMatch(/customerPackageActivation|customerPackagePurchase/);
  });

  it("limits customer eligibility reads to authenticated customer accounts", () => {
    const marker = "tradingEligibility:";
    const start = routerSource.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const implementation = routerSource.slice(start, start + 900);
    expect(implementation).toContain('ctx.user.role !== "user"');
    expect(implementation).toContain('code: "FORBIDDEN"');
    expect(implementation).toContain("getCustomerTradingEligibility(ctx.user.id)");
  });
});
