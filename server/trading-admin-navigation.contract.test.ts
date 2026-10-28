import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const operationsUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("Trading fee-policy navigation", () => {
  it("opens the administrator screen that actually edits realized-profit fees", () => {
    const item = navigation.match(/id: "trade-profit-fees-limits", target: "([^"]+)"/);
    expect(item?.[1]).toBe("transactionReview");
    expect(adminApp).toContain("{section===\"transactionReview\"&&<AdminTransactionReview/>}");
    expect(operationsUi).toContain("trpc.adminOperations.updateTradeFeePolicy.useMutation");
  });
});

describe("Trading customer-display navigation", () => {
  it("opens the persisted package display-timing controls, not the read-only delivery summary", () => {
    const item = navigation.match(/id: "trade-popup-display", target: "([^"]+)"/);
    expect(item?.[1]).toBe("tradeCustomerDisplay");
    expect(adminApp).toContain('{section==="tradeCustomerDisplay"&&<AdminPackages focus="display"/>}');

    const start = adminApp.indexOf("function AdminPackages({focus}");
    const end = adminApp.indexOf("function AdminTradeAllocationControl()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const packageEditor = adminApp.slice(start, end);
    expect(packageEditor).toContain("popupDisplayTargetSeconds");
    expect(packageEditor).toContain("completionDisplaySeconds");
    expect(packageEditor).toContain("These settings affect presentation only, not allocation, trade execution, or settlement.");
    expect(packageEditor).toContain('{!focus&&<><AdminTradingPackageCatalogue/><AdminTradeAllocationControl/></>}');
  });
});

describe("Trading retry-policy navigation", () => {
  it("opens the package retry controls instead of the read-only delivery summary", () => {
    const item = navigation.match(/id: "trade-retries-carry-forward", target: "([^"]+)"/);
    expect(item?.[1]).toBe("tradeRetryPolicy");
    expect(adminApp).toContain('{section==="tradeRetryPolicy"&&<AdminPackages focus="retries"/>}');

    const start = adminApp.indexOf("function AdminPackages({focus}");
    const end = adminApp.indexOf("function AdminTradeAllocationControl()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const packageEditor = adminApp.slice(start, end);
    expect(packageEditor).toContain("maxTradeAttemptsPerDay");
    expect(packageEditor).toContain("tradeRetryDelaySeconds");
    expect(packageEditor).toContain("Carry-forward controls are not yet implemented.");
    expect(packageEditor).toContain('{focus!=="retries"&&<><AdminTradingPackageCatalogue/><AdminTradeAllocationControl/></>}');
    expect(packageEditor).toContain('{focus!=="retries"&&<div className="package-policy-section"><strong>Opportunity delivery & scheduling</strong>');
  });
});
