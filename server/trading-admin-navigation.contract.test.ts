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
    expect(adminApp).toContain('section==="companyCatalogue"&&<Suspense');
    expect(navigation).toContain('id: "trade-company-rotation", target: "packages", focus: "rotation"');
    expect(adminApp).not.toContain('<AdminTradingPolicySettings focus="rotation"/>');
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
    expect(packageSurface).toContain('focus!=="tiers"&&<AdminTradingPolicySettings focus={focus}/>');
    expect(adminApp).toContain("function AdminTradingPolicySettings(");
    expect(opportunity).not.toContain("TradingDeliveryPolicyEditor");
    expect(adminApp).toContain('section==="opportunity"&&<AdminOpportunityEngine/>');
    expect(adminApp.match(/section==="opportunity"&&focus==="delivery"/g)).toBeNull();
    expect(adminApp).not.toContain('<AdminTradingPolicySettings focus="rotation"/>');
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
    expect(editor).toContain("New tiers are enabled when created.");
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
    expect(adminApp).toContain('role="group" aria-label="Automatic Trading tier assignments"');
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
    expect(policyEditor).toContain("Reason for changing Trading tier policies (required for audit)");
    expect(policyEditor).toContain("onClick={onSave}");
    expect(adminApp).toContain("Enter at least 5 characters explaining this policy change.");
    expect(adminApp).toContain("Trading policy saved successfully. Active trade snapshots were preserved.");
    expect(adminApp).toContain("reason:policyReason.trim()})");
    expect(adminApp).toContain("policies.data.map(x=>({...x,packageName:x.packageName");
    expect(adminApp).toContain("buildChangedPolicyPatches(policyBaseline,policyRows)");
  });
});

describe("Trading fee-policy navigation", () => {
  it("opens the administrator screen that actually edits realized-profit fees", () => {
    const item = navigation.match(/id: "trade-fees-earnings", target: "([^"]+)"/);
    expect(item?.[1]).toBe("transactionReview");
    expect(adminApp).toContain("{section===\"transactionReview\"&&<AdminTransactionReview focus={focus as \"capital\"|\"fees\"|\"reconciliation\"|undefined}/>}");
    expect(operationsUi).toContain("trpc.adminOperations.updateTradeFeePolicy.useMutation");
  });
});

describe("Trading customer-display navigation", () => {
  it("opens the persisted customer display controls in the shared policy editor", () => {
    const item = navigation.match(/id: "trade-popup-display", target: "([^"]+)"/);
    expect(item?.[1]).toBe("tradeCustomerDisplay");
    expect(adminApp).toContain('{section==="tradeCustomerDisplay"&&<AdminPackages focus="display"/>}');
    expect(policyEditor).toContain("value={row.popupDisplayTargetSeconds}");
    expect(policyEditor).toContain("value={row.completionDisplaySeconds}");
    expect(policyEditor).toContain("Controls display only; must not cancel an active trade.");
    expect(adminApp).toContain('(!focus||focus==="tiers")&&<AdminTradingPackageCatalogue/>');
  });
});

describe("Trading retry-policy navigation", () => {
  it("opens retry controls in the shared policy editor and states the current retry-window boundary", () => {
    const item = navigation.match(/id: "trade-retries", target: "([^"]+)"/);
    expect(item?.[1]).toBe("tradeRetryPolicy");
    expect(adminApp).toContain('{section==="tradeRetryPolicy"&&<AdminPackages focus="retries"/>}');
    expect(policyEditor).toContain("value={row.maxTradeAttemptsPerDay}");
    expect(policyEditor).toContain("value={row.tradeRetryDelaySeconds}");
    expect(policyEditor).toContain("Carry-forward across daily windows is not enabled. A retry window that expires is marked failed for review.");
    expect(policyEditor).toContain('show("quotas")');
  });
});


describe("Trading navigation focus and plain-language controls", () => {
  it("gives shared screens distinct focus identifiers and uses the selected focus for active state", () => {
    expect(navigation).toContain('id: "trade-settings", label: "Trade Settings"');
    expect(navigation).not.toContain('id: "trade-setup"');
    expect(navigation).not.toContain('id: "trade-offers"');
    expect(navigation).not.toContain('id: "trade-results"');
    expect(navigation).not.toContain('id: "trade-monitoring"');
    expect(navigation).not.toContain('id: "trade-history"');
    expect(navigation).toContain('label: "Tiers & Eligibility"');
    expect(navigation).toContain('label: "Per-tier Daily Delivery Caps"');
    expect(navigation).toContain('label: "Publish & Manage Opportunities"');
    expect(navigation).toContain('label: "Per-tier Company Rotation Rules"');
    expect(navigation).toContain('label: "Settlement & Reconciliation"');
    expect(navigation).toContain('target: "packages", focus: "tiers"');
    expect(navigation).toContain('target: "packages", focus: "quotas"');
    expect(navigation).toContain('target: "transactionReview", focus: "fees"');
    expect(navigation).toContain('target: "transactionReview", focus: "reconciliation"');
    expect(navigation).not.toContain('id: "trade-capital-wallet"');
    expect(navigation).not.toContain('id: "trade-notifications"');
    expect(adminApp).toContain('section===item.target && focus===item.focus');
    expect(adminApp).toContain('setFocus(item.focus)');
    expect(adminApp).toContain('group.items.some((item)=>item.target===section && item.focus===focus)');
    expect(adminApp).toContain('const [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});');
    expect(adminApp).toContain('section!=="overview" && group.items.some((item)=>item.target===section && item.focus===focus)');
  });

  it("shows the explanation beside each Trading menu item", () => {
    expect(adminApp).toContain('className="admin-nav-item-detail"');
    expect(navigation).toContain('label: "Publish & Manage Opportunities"');
    expect(navigation).toContain('label: "Retries & Carry-Forward"');
    expect(navigation).toContain('label: "System Pause & Safety"');
  });
});

describe("Trading menu ownership and quota save feedback", () => {
  it("keeps every Trading destination under one uniquely named Trade Settings group", () => {
    expect(navigation).toContain('id: "trade-settings", label: "Trade Settings"');
    expect(navigation.match(/id: "trade-settings"/g)).toHaveLength(1);
    expect(navigation).not.toContain('id: "trade-setup"');
    expect(navigation).not.toContain('id: "trade-offers"');
    expect(navigation).not.toContain('id: "trade-results"');
    expect(navigation).not.toContain('id: "trade-monitoring"');
    expect(navigation).not.toContain('id: "trade-history"');
    expect(navigation).toContain('id: "trade-opportunity-publishing", target: "opportunity"');
    expect(navigation).toContain('id: "trade-company-rotation", target: "packages", focus: "rotation"');
    expect(navigation).not.toContain('id: "admin-audit-log"');
  });

  it("keeps tier entitlements separate from delivery caps and protects unsaved tier drafts during polling", () => {
    expect(adminApp).toContain('Daily opportunity entitlement<input');
    expect(adminApp).toContain('dirtyPackageIds.current.has(id)');
    expect(adminApp).toContain('dirtyPackageIds.current.add(id)');
    expect(adminApp).toContain('const refreshed=await q.refetch()');
    expect(adminApp).toContain('Number(persisted.opportunitiesPerDay)===Number(saved.opportunitiesPerDay)');
    expect(adminApp).toContain('Saved and verified from the database: ');
    expect(adminApp).toContain('Saving tier…');
    expect(policyEditor).toContain('Hard daily pop-up ceiling<input');
    expect(policyEditor).toContain('This is an operational ceiling, not the tier entitlement.');
    expect(policyEditor).toContain('Optional daily target cap (0 = no extra cap)');
    expect(policyEditor).toContain('These caps can reduce—but never increase—the daily opportunity entitlement');
  });

  it("separates delivery policy editing from tier details and company catalogue records", () => {
    expect(adminApp).toContain('function AdminTradingPolicySettings({focus}:{focus?:"policy"|"quotas"');
    expect(adminApp).toContain('focus!=="tiers"&&<AdminTradingPolicySettings focus={focus}/>');
    expect(policyEditor).toContain('type PolicyEditorFocus = "policy" | "quotas"');
    expect(policyEditor).toContain('show("policy")');
    expect(adminApp).not.toContain('<AdminTradingPolicySettings focus="rotation"/>');
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
    expect(adminApp).toContain("Manage global settlement, wallet-credit and pop-up timing defaults.");
    expect(adminApp).toContain("Scheduled time is not proof of execution or settlement.");
    expect(adminApp).toContain("settlementDelaySeconds");

    const settingsStart = adminApp.indexOf("function AdminSettings({focus}");
    const settingsEnd = adminApp.indexOf("function AdminSoundSettings()", settingsStart);
    const focusedSettings = adminApp.slice(settingsStart, settingsEnd);
    expect(focusedSettings).toContain("{!focus&&<div className=\"settings-tabs\">");
    expect(focusedSettings).toContain('{tab==="ticket"&&!focus&&<div className="settings-card">');
    expect(focusedSettings).not.toContain('{tab==="email"&&!focus');
    expect(focusedSettings).toContain('{tab==="password"&&!focus&&<div className="settings-card">');
    expect(focusedSettings).toContain('{tab==="trade"&&focus==="tradeDuration"&&<div className="settings-card">');
    expect(focusedSettings).not.toContain('>Trade settlement</button>');
    expect(focusedSettings).toContain('await save.mutateAsync({trade});');
    expect(focusedSettings).toContain('await save.mutateAsync({ticket});');
    expect(focusedSettings).toContain('Other settings sections were not changed.');
    expect(focusedSettings).toContain('fresh server read did not confirm every saved value');
    expect(focusedSettings).not.toContain('email:{');
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
    expect(editor).toContain("New tiers are enabled when created.");
    expect(editor).toContain("enabled:true})");
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
