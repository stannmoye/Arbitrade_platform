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
    expect(packageEditor).toContain("tradeRetryDelaySeconds");
    expect(packageEditor).toContain("Carry-forward is unavailable: missed opportunities do not roll over and no carry-forward setting is active.");
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
  it("counts persisted package policies without invoking the lazy initializer", () => {
    expect(operationsUi).toContain("trpc.adminOperations.overviewPackagePolicies.useQuery");
    expect(serverRouters).toContain("overviewPackagePolicies: adminProcedure.query(() => listPersistedOpportunityPackagePolicies()),");

    const start = serverDb.indexOf("export async function listPersistedOpportunityPackagePolicies()");
    const end = serverDb.indexOf("\n}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reader = serverDb.slice(start, end);
    expect(reader).toContain("db.select().from(opportunityPackagePolicies)");
    expect(reader).not.toContain(".insert(");
  });
});


describe("Trading policy reconciliation", () => {
  it("does not supply hardcoded runtime fee, settlement, popup or market timing policy values", () => {
    expect(serverDb).not.toContain("DEFAULT_TRADE_FEE_POLICY");
    expect(serverDb).toContain('requireTradePolicySetting("trade.platformFeeBps")');
    expect(serverDb).toContain('requireTradePolicySetting("trade.settlementDelaySeconds")');
    expect(serverDb).toContain('requireTradePolicySetting("opportunity.popup.displaySeconds")');
    expect(serverDb).toContain('requireTradePolicySetting("market.refreshIntervalMinutes")');
  });

  it("does not allow a missing or unreviewed tier policy to qualify, deliver, or allocate automatically", () => {
    expect(serverDb).toContain("Number(configured.policyVersion)>=1");
    expect(serverDb).toContain("return Boolean(configured && Number(configured.policyVersion)>=1 && configured.enabled && configured.automaticDelivery && configured.automaticTradingEnabled");
    expect(serverDb).toContain("savedPolicy && Number(savedPolicy.policyVersion)>=1 && savedPolicy.enabled && savedPolicy.automaticDelivery && savedPolicy.automaticTradingEnabled");
    expect(serverDb).not.toContain("return !configured");
    expect(serverDb).not.toContain("configured?chooseProfitRateBps");
    expect(serverDb).not.toContain("configured?chooseTradeDurationSeconds");
  });

  it("creates new Trading tiers and their policies disabled until the administrator saves and enables them", () => {
    expect(serverDb).toContain("New Trading tiers must be created disabled.");
    expect(serverDb).toContain("const UNCONFIGURED_TIER_POLICY_SENTINELS = {");
    expect(serverDb).toContain("enabled:false,automaticDelivery:false,dailyPopupTarget:0");
    expect(serverDb).toContain("automaticTradingEnabled:false");
    expect(serverDb).toContain("policyVersion:0,");
    expect(serverDb).toContain("Configure and explicitly enable the saved tier delivery and automatic-trading policy");
    expect(serverDb).toContain("const nextPolicyVersion=Number(existing.policyVersion||0)+1");
  });

  it("does not prefill manual allocation windows with invented market symbols, venues, capital, return or duration values", () => {
    expect(adminApp).not.toContain('const [symbol,setSymbol]=useState("NVDA")');
    expect(adminApp).not.toContain('const [from,setFrom]=useState("Market venue A")');
    expect(adminApp).not.toContain('const [to,setTo]=useState("Market venue B")');
    expect(adminApp).not.toContain('const [minimum,setMinimum]=useState(1000)');
    expect(adminApp).not.toContain('const [reward,setReward]=useState(85)');
    expect(adminApp).not.toContain('const [duration,setDuration]=useState(600)');
    expect(adminApp).toContain("Only an authoritative, auditable settlement may create a financial result.");
  });
});
