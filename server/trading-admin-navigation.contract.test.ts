import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const operationsUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const serverDb = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const serverRouters = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Trading tier creation defaults", () => {
  it("requires an administrator to explicitly enter threshold, duration, and daily quota", () => {
    const start = adminApp.indexOf("function AdminTradingPackageCatalogue()");
    const end = adminApp.indexOf("function AdminPackages({focus}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const editor = adminApp.slice(start, end);
    expect(editor).toContain('minimumQualifyingBalanceUsdMinor:"",durationMonths:"",opportunitiesPerDay:""');
    expect(editor).toContain('newTier.minimumQualifyingBalanceUsdMinor===""?"":');
    expect(editor).toContain('e.target.value===""?"":Number(e.target.value)');
    expect(editor).toContain("no package threshold or quota is preselected");
    expect(editor).not.toContain('minimumQualifyingBalanceUsdMinor:10000,durationMonths:1,opportunitiesPerDay:6');
    const editFields = editor.slice(editor.indexOf("{(q.data as any[]).map"));
    expect(editFields).toContain('draft.minimumQualifyingBalanceUsdMinor===""?"":');
    expect(editFields).toContain('e.target.value===""?"":Number(e.target.value)');
    expect(editFields).toContain('draft.maxPopupsPerDay===""');
    expect(editFields).toContain('draft.maxActiveInvestments===""');
    expect(editFields).toContain("required maxLength={80} value={draft.name}");
  });
});


describe("Trading tier audit reasons", () => {
  it("requires a reason in the admin UI and persists the supplied reason with old/new terms", () => {
    const start = adminApp.indexOf("function AdminTradingPackageCatalogue()");
    const end = adminApp.indexOf("function AdminPackages({focus}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const editor = adminApp.slice(start, end);
    expect(editor).toContain("Reason for creating this tier (required for audit)");
    expect(editor).toContain("Reason for changing this tier (required for audit)");
    expect(editor).toContain('reason:String(newTier.reason).trim()');
    expect(editor).toContain('reason:String(draft.reason??"").trim()');

    const createStart = serverDb.indexOf("export async function createAdminTradingPackage");
    const updateStart = serverDb.indexOf("export async function updateAdminTradingPackage", createStart);
    const nextFunction = serverDb.indexOf("/**\\n * Customer-safe, read-only progressive eligibility summary.", updateStart);
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(updateStart).toBeGreaterThan(createStart);
    expect(nextFunction).toBeGreaterThan(updateStart);
    const dbFunctions = serverDb.slice(createStart, nextFunction);
    expect(dbFunctions).toContain('Provide an audit reason of 5–500 characters');
    expect(dbFunctions).toContain('reason,');
    expect(dbFunctions).toContain('metadataJson:JSON.stringify({old:');
    expect(serverRouters).toContain('reason: z.string().trim().min(5).max(500)');
  });
});

describe("Trading tier effective-date validation", () => {
  it("rejects an expiry that is not later than the configured start time on create and update", () => {
    const createStart = serverRouters.indexOf("createTradingPackage: adminProcedure.input(z.object({");
    const updateStart = serverRouters.indexOf("updateTradingPackage: adminProcedure.input(z.object({", createStart);
    const communicationStart = serverRouters.indexOf("communicationSettings: adminProcedure.query", updateStart);
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(updateStart).toBeGreaterThan(createStart);
    expect(communicationStart).toBeGreaterThan(updateStart);
    const tierRoutes = serverRouters.slice(createStart, communicationStart);
    expect(tierRoutes).toContain('({ startsAt, expiresAt }) => !startsAt || !expiresAt || new Date(expiresAt).getTime() > new Date(startsAt).getTime()');
    expect(tierRoutes.match(/Expiry must be later than the start time\./g)).toHaveLength(2);
    expect(tierRoutes).toContain('path: ["expiresAt"]');
  });
});

describe("Admin customer Trading tier visibility", () => {
  it("exposes automatic assignment package IDs, statuses, and saved terms without exposing the full catalogue", () => {
    const start = serverDb.indexOf("export async function listAdminCustomers()");
    const end = serverDb.indexOf("\nexport async function createAdminCustomer", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const listing = serverDb.slice(start, end);
    expect(listing).toContain("assignedTierDetails");
    expect(listing).toContain("customerPackageSubscriptions.packageId");
    expect(listing).toContain("customerPackageSubscriptions.status");
    expect(listing).toContain('startsWith("auto-tier:")');
    expect(adminApp).toContain("Automatic Trading tier assignments");
    expect(adminApp).toContain("Package ID {tier.packageId}");
    expect(adminApp).toContain("{tier.status}");
    expect(adminApp).toContain("Terms v{tier.termsVersion}");
  });
});

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
