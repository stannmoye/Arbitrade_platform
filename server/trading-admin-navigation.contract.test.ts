import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const operationsUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const serverDb = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const serverRouters = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

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
    expect(packageEditor).toContain("Tier availability & automation");
    expect(packageEditor).toContain("automaticTradingEnabled");
    expect(packageEditor).toContain("tradeRetryDelaySeconds");
    expect(packageEditor).toContain("Carry-forward is unavailable: missed opportunities do not roll over and no carry-forward setting is active.");
    expect(navigation).toContain("Carry-Forward Unavailable");
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

    const settingsStart = adminApp.indexOf("function AdminSettings({focus}");
    const settingsEnd = adminApp.indexOf("function AdminSoundSettings()", settingsStart);
    const focusedSettings = adminApp.slice(settingsStart, settingsEnd);
    expect(focusedSettings).toContain("{!focus&&<div className=\"settings-tabs\">");
    expect(focusedSettings).toContain('{tab==="ticket"&&!focus&&<div className="settings-card">');
    expect(focusedSettings).toContain('{tab==="email"&&!focus&&<div className="settings-card">');
    expect(focusedSettings).toContain('{tab==="password"&&!focus&&<div className="settings-card">');
    expect(focusedSettings).toContain('{tab==="trade"&&<div className="settings-card">');
  });
});

describe("Trading overview package-policy read", () => {
  it("reads persisted package policies without creating lazy defaults", () => {
    expect(operationsUi).toContain("trpc.adminOperations.overviewPackagePolicies.useQuery");
    expect(serverRouters).toContain("overviewPackagePolicies: adminProcedure.query(() => listPersistedOpportunityPackagePolicies()),");

    const start = serverDb.indexOf("export async function listPersistedOpportunityPackagePolicies()");
    const end = serverDb.indexOf("\n}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reader = serverDb.slice(start, end);
    expect(reader).toContain("db.select().from(opportunityPackagePolicies)");
    expect(reader).not.toContain(".insert(");
    const initializerStart = serverDb.indexOf("export async function listOpportunityPackagePolicies()");
    const initializerEnd = serverDb.indexOf("\n}", initializerStart);
    expect(initializerStart).toBeGreaterThanOrEqual(0);
    expect(initializerEnd).toBeGreaterThan(initializerStart);
    expect(serverDb.slice(initializerStart, initializerEnd)).toContain("return rows.filter(row=>tierNames.has(row.packageName))");
    expect(serverDb.slice(initializerStart, initializerEnd)).not.toContain(".insert(");
  });
});


describe("Trading policy defaults and fail-closed behavior", () => {
  it("uses persisted package policy values instead of server-side fallback constants", () => {
    const start = serverDb.indexOf("export async function updateOpportunityPackagePolicies(");
    const end = serverDb.indexOf("\nasync function listMissedOpportunities", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const updater = serverDb.slice(start, end);
    expect(updater).toContain("automaticTradingEnabled:current.automaticTradingEnabled");
    expect(updater).toContain("enabled:current.enabled");
    expect(updater).toContain("automaticDelivery:current.automaticDelivery");
    expect(updater).toContain("maxTradeAttemptsPerDay:current.maxTradeAttemptsPerDay");
    expect(updater).toContain("tradeRetryDelaySeconds:current.tradeRetryDelaySeconds");
    expect(updater).not.toContain("maxTradeAttemptsPerDay:policy.maxTradeAttemptsPerDay??5");
    expect(updater).not.toContain("tradeRetryDelaySeconds:policy.tradeRetryDelaySeconds??30");
    expect(serverDb).toContain("return Boolean(packagePolicy && packagePolicy.enabled && packagePolicy.automaticDelivery && packagePolicy.automaticTradingEnabled)");
    expect(serverDb).not.toContain("maxTradeAttemptsPerDay:Number(policyByName.get(String(row.packageName))?.maxTradeAttemptsPerDay??5)");
  });
});
