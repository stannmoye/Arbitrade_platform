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
    expect(packageEditor).toContain('{!focus&&<><AdminTradingPackageCatalogue/><AdminTradeAllocationControl/></>}');
    expect(packageEditor).toContain('{!focus&&<div className="package-policy-section"><strong>Opportunity delivery & scheduling</strong>');
  });
});


describe("Trading overview and duration navigation", () => {
  it("renders an operations snapshot using real persisted admin queries", () => {
    expect(navigation).toContain('id: "trade-settings-overview", target: "tradeSystemOverview"');
    expect(adminApp).toContain("<AdminTradeSettingsOverview/>");
    expect(operationsUi).toContain("trpc.adminOperations.popupLifecycleSummary.useQuery");
    expect(operationsUi).toContain("trpc.adminOperations.offers.useQuery");
    expect(operationsUi).toContain("trpc.adminOperations.pendingSettlements.useQuery");
    expect(operationsUi).toContain("trpc.adminOperations.tradeAllocationControls.useQuery");
    expect(operationsUi).toContain("Rolling 24-hour lifecycle events");
  });

  it("opens persisted settlement timing controls and keeps schedule estimates distinct from settlement", () => {
    expect(navigation).toContain('id: "trade-duration-closing", target: "tradeDurationRules"');
    expect(adminApp).toContain('<AdminSettings focus="tradeDuration"/>');
    expect(adminApp).toContain("Configure the persisted settlement estimate, wallet credit delay and global block-until-settled rule.");
    expect(adminApp).toContain("Scheduled time is not proof of execution or settlement.");
    expect(adminApp).toContain("settlementDelaySeconds");
  });
});
