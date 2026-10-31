import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const operationsUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const serverDb = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const serverRouters = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");

describe("Administrator company catalogue navigation and pagination", () => {
  it("opens the dedicated 1,811-record catalogue and supports server-backed all-company selection with local ten-record pages", () => {
    const catalogue = readFileSync(new URL("../client/src/components/AdminCompanyCatalogue.tsx", import.meta.url), "utf8");
    expect(navigation).toContain('id: "trade-company-catalogue", target: "companyCatalogue"');
    expect(navigation).not.toContain('id: "trade-company-catalogue", target: "opportunity"');
    expect(adminApp).toContain('section==="companyCatalogue"&&<>');
    expect(adminApp).toContain('<AdminTradingPolicySettings focus="rotation"/>');
    expect(catalogue).toContain("const PAGE_SIZE = 10");
    expect(catalogue).toContain("trpc.companyCatalogueReference.search.useQuery");
    expect(catalogue).toContain("limit: 1811");
    expect(catalogue).toContain("filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)");
    expect(catalogue).toContain("View all companies");
    expect(catalogue).toContain("Select all");
    expect(catalogue).toContain("countryName: countryName || undefined");
    expect(catalogue).toContain("company.logoUrl");
    expect(catalogue).toContain("Logo ID {logoId}");
    expect(catalogue).toContain("Previous");
    expect(catalogue).toContain("Next");
    expect(catalogue).toContain("Admin marked verified");
    expect(catalogue).toContain("internal catalogue label");
  });

  it("routes every policy submenu through one authoritative editor and keeps tier catalogue visible", () => {
    const start = adminApp.indexOf("function AdminPackages({focus}");
    const end = adminApp.indexOf("function AdminSignupFeatures()", start);
    const packageSurface = adminApp.slice(start, end);
    const opportunityStart = adminApp.indexOf("function AdminOpportunityEngine()");
    const portalStart = adminApp.indexOf("function AdminPortal()", opportunityStart);
    const opportunity = adminApp.slice(opportunityStart, portalStart);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(packageSurface).toContain("<AdminTradingPackageCatalogue/>");
    expect(packageSurface).toContain("<AdminTradingPolicySettings focus={focus}/>");
    expect(adminApp).toContain("function AdminTradingPolicySettings(");
    expect(opportunity).not.toContain("TradingDeliveryPolicyEditor");
    expect(adminApp).toContain('section==="opportunity"&&focus==="delivery"&&<AdminPackages focus="delivery"/>');
    expect(adminApp).toContain('<AdminTradingPolicySettings focus="rotation"/>');
    expect(policyEditor).toContain("focus?: PolicyEditorFocus;");
    expect(policyEditor).toContain('show("quotas")');
    expect(policyEditor).toContain('show("delivery")');
    expect(policyEditor).toContain('show("display")');
    expect(policyEditor).toContain('show("retries")');
    expect(policyEditor).toContain('show("rotation")');
  });
});

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
    const editFields = editor.slice(editor.indexOf("{visiblePackageRows.map"));
    expect(editFields).toContain('draft.minimumQualifyingBalanceUsdMinor===""?"":');
    expect(editFields).toContain('e.target.value===""?"":Number(e.target.value)');
    expect(editor).not.toContain("Daily popup cap");
    expect(editor).not.toContain("Maximum active investments");
    expect(editor).toContain("maxPopupsPerDay:0,maxActiveInvestments:0");
    expect(editFields).toContain("required maxLength={80} value={draft.name}");
    expect(editor).toContain("const packagePageSize=5");
    expect(editor).toContain("paginateItems(packageRows,packagePage,packagePageSize)");
    expect(editor).toContain('aria-label="Trading tier pagination"');
    expect(editor).toContain("setPackagePage((current)=>Math.min(packagePageCount-1,current+1))");
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
    const nextFunction = serverDb.indexOf("/**\n * Customer-safe, read-only progressive eligibility summary.", updateStart);
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(updateStart).toBeGreaterThan(createStart);
    expect(nextFunction).toBeGreaterThan(updateStart);
    const dbFunctions = serverDb.slice(createStart, nextFunction);
    expect(dbFunctions).toContain('Provide an audit reason of 5–500 characters');
    expect(dbFunctions).toContain('reason:auditReason');
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
    expect(tierRoutes).toContain('startsAt: z.string().datetime().nullable()');
    expect(tierRoutes).toContain('expiresAt: z.string().datetime().nullable()');
    expect(tierRoutes).toContain('Date.parse(input.expiresAt) > Date.parse(input.startsAt)');
    expect(tierRoutes.match(/Date.parse\(input\.expiresAt\) > Date.parse\(input\.startsAt\)/g)).toHaveLength(2);
    expect(tierRoutes).toContain('path: ["expiresAt"]');
    expect(tierRoutes.match(/path: \["expiresAt"\]/g)).toHaveLength(2);
    const createService = serverDb.indexOf("export async function createAdminTradingPackage");
    const updateService = serverDb.indexOf("export async function updateAdminTradingPackage", createService);
    const nextService = serverDb.indexOf("export async function", updateService + 5);
    const tierServices = serverDb.slice(createService, nextService);
    expect(tierServices.match(/input\.startsAt&&input\.expiresAt&&input\.expiresAt<=input\.startsAt/g)).toHaveLength(2);
    expect(tierServices.match(/Package expiry must be later than its start time/g)).toHaveLength(2);
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

describe("Trading tier policy audit and versioning", () => {
  it("requires an audit reason and persists each policy update with its previous and next values in one transaction", () => {
    const start = serverDb.indexOf("export async function updateOpportunityPackagePolicies");
    const end = serverDb.indexOf("\nasync function listMissedOpportunities", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const update = serverDb.slice(start, end);
    expect(update).toContain("reason:string");
    expect(update).toContain("auditReason.length<5||auditReason.length>500");
    expect(update).toContain("await db.transaction(async tx=>");
    expect(update).toContain("policyVersion:nextVersion");
    expect(update).toContain('action:"trading_delivery_policy_updated"');
    expect(update).toContain("oldPolicy:current||null");
    expect(update).toContain("newPolicy:next");
    expect(update).toContain("Each Trading tier may appear only once");
    expect(serverRouters).toContain("reason: z.string().trim().min(5).max(500)");
    expect(serverRouters).toContain("updateOpportunityPackagePolicies(ctx.user.id, input.policies, input.reason)");
    expect(adminApp).toContain("Reason for changing Trading tier policies (required for audit)");
    expect(policyEditor).toContain("onClick={onSave}");
    expect(adminApp).toContain("Requirement not met: A reason for changing Trading tier policies is required for audit.");
    expect(adminApp).toContain("Trading policy saved successfully. The saved settings have been reloaded");
    expect(adminApp).toContain("reason:policyReason.trim()})");
    expect(adminApp).toContain("policies.data.map(x=>({...x,packageName:x.packageName");
    expect(adminApp).toContain("buildChangedPolicyPatches(policyBaseline,policyRows)");
  });
});

describe("Trading fee-policy navigation", () => {
  it("opens the administrator screen that actually edits realized-profit fees", () => {
    const item = navigation.match(/id: "trade-profit-fees-limits", target: "([^"]+)"/);
    expect(item?.[1]).toBe("transactionReview");
    expect(adminApp).toContain("{section===\"transactionReview\"&&<AdminTransactionReview focus={focus as \"capital\"|\"fees\"|\"reconciliation\"|undefined}/>}");
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
    expect(packageEditor).toContain('{(!focus||focus==="tiers")&&<><AdminTradingPackageCatalogue/>');
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
    expect(packageEditor).toContain("Carry-forward controls are not available yet.");
    expect(packageEditor).toContain('{(!focus||focus==="quotas")&&<div className="package-policy-section"><strong>Daily customer allowance</strong>');
    expect(packageEditor).toContain('focus==="quotas"');
  });
});


describe("Trading navigation focus and plain-language controls", () => {
  it("gives shared screens distinct focus identifiers and uses the selected focus for active state", () => {
    expect(navigation).toContain('id: "trade-setup", label: "Set up trades"');
    expect(navigation).toContain('id: "trade-offers", label: "Show offers"');
    expect(navigation).toContain('id: "trade-results", label: "Finish trades"');
    expect(navigation).toContain('id: "trade-monitoring", label: "Watch problems"');
    expect(navigation).toContain('id: "trade-history", label: "History"');
    expect(navigation).toContain('target: "packages", focus: "tiers"');
    expect(navigation).toContain('target: "packages", focus: "quotas"');
    expect(navigation).toContain('target: "transactionReview", focus: "fees"');
    expect(navigation).toContain('target: "transactionReview", focus: "reconciliation"');
    expect(navigation).not.toContain('id: "trade-capital-wallet"');
    expect(navigation).not.toContain('id: "trade-notifications"');
    expect(adminApp).toContain('section===item.target && focus===item.focus');
    expect(adminApp).toContain('setFocus(item.focus)');
    expect(adminApp).toContain('group.items.some((item)=>item.target===section && item.focus===focus)');
    expect(adminApp).toContain('"trade-setup":true');
  });

  it("shows the explanation beside each Trading menu item", () => {
    expect(adminApp).toContain('className="admin-nav-item-detail"');
    expect(navigation).toContain('label: "When offers appear"');
    expect(navigation).toContain('label: "Try failed trades again"');
    expect(navigation).toContain('label: "Pause new trades"');
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

describe("Trading tier creation defaults", () => {
  it("requires an administrator to enter threshold, duration and daily quota explicitly", () => {
    const start = adminApp.indexOf("function AdminTradingPackageCatalogue()");
    const end = adminApp.indexOf("function AdminPackages({focus}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const editor = adminApp.slice(start, end);
    expect(editor).toContain('minimumQualifyingBalanceUsdMinor:"",durationMonths:"",opportunitiesPerDay:""');
    expect(editor).toContain('newTier.minimumQualifyingBalanceUsdMinor===""?"":');
    expect(editor).toContain('e.target.value===""?"":Number(e.target.value)');
    expect(editor).toContain("no package threshold or quota is preselected");
    expect(editor).toContain("enabled:false})");
    expect(editor).not.toContain('minimumQualifyingBalanceUsdMinor:10000,durationMonths:1,opportunitiesPerDay:6');
    expect(editor).not.toContain('<label>Enabled <input type="checkbox" checked={Boolean(newTier.enabled)}');
  });
});

describe("Trading overview package-policy read", () => {
  it("reads saved policies without creating defaults and fails closed when a tier policy is missing", () => {
    expect(operationsUi).toContain("trpc.adminOperations.overviewPackagePolicies.useQuery");
    expect(serverRouters).toContain("packagePolicies: adminProcedure.query(() => listPersistedOpportunityPackagePolicies()),");
    expect(serverRouters).toContain("overviewPackagePolicies: adminProcedure.query(() => listPersistedOpportunityPackagePolicies()),");

    const runtimeStart = serverDb.indexOf("export async function listOpportunityPackagePolicies()");
    const runtimeEnd = serverDb.indexOf("\n}", runtimeStart);
    expect(runtimeStart).toBeGreaterThanOrEqual(0);
    expect(runtimeEnd).toBeGreaterThan(runtimeStart);
    const runtimeReader = serverDb.slice(runtimeStart, runtimeEnd);
    expect(runtimeReader).toContain("return rows.filter(row=>tierNames.has(row.packageName))");
    expect(runtimeReader).not.toContain(".insert(");

    const start = serverDb.indexOf("export async function listPersistedOpportunityPackagePolicies()");
    const end = serverDb.indexOf("\n}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reader = serverDb.slice(start, end);
    expect(reader).toContain("db.select().from(opportunityPackagePolicies)");
    expect(reader).toContain("if(missing.length) throw new Error");
    expect(reader).not.toContain(".insert(");
  });
});

describe("Trading tier rename policy safety", () => {
  it("does not replace a missing tier policy with schema defaults during rename", () => {
    const start = serverDb.indexOf("export async function updateAdminTradingPackage(");
    const end = serverDb.indexOf("\nexport async function ", start + 5);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const implementation = serverDb.slice(start, end);
    expect(implementation).toContain("if(!currentPolicy) throw new Error(\"Saved Trading policy is missing for \"+current.name+\"; reconcile it explicitly before renaming this tier.\");");
    expect(implementation).not.toContain("values({packageName:nextName,updatedBy})");
  });
});
