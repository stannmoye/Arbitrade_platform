import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateRealizedProfitSettlement } from "./modules/realized-profit-accounting";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = read("./db.ts");
const router = read("./routers.ts");
const migration = read("../drizzle/0101_package_fee_policy_versions.sql");
const journal = JSON.parse(read("../drizzle/meta/_journal.json"));
const portal = read("../scripts/apply-portal-migrations.mjs");
const recovery = read("../installer/migration-recovery-status.mjs");
const workerBridge = read("../scripts/ensure-worker-runtime-schema.mjs");
const workerContracts = read("../scripts/worker-schema-contracts.mjs");

describe("package-specific fee administration and immutable snapshots", () => {
  it("exposes the agreed admin-only query, history, and optimistic-version mutation contracts", () => {
    expect(router).toContain("packageFeePolicies: adminProcedure.query(() => getPackageFeePolicies())");
    expect(router).toContain("packageFeeHistory: adminProcedure.input(z.object({ packageId:");
    expect(router).toContain("updatePackageFeePolicy: adminProcedure.input(z.object({");
    expect(router).toContain("expectedVersion: z.number().int().min(0).max(2_147_483_647)");
    expect(router).toContain("effectiveAt: z.string().datetime({ offset: false })");
    expect(router).toContain("reason: z.string().trim().min(3).max(2000)");
    expect(db).toContain("resolvePackageFeePolicyWrite(current?Number(current.version):null,input.expectedVersion)");
    expect(db).toContain("await tx.insert(tradingPackageFeePolicyVersions).values(values)");
    expect(db).toContain("await tx.insert(v5AuditEvents).values({actorUserId:actorId");
    expect(db).toContain('write.initial?"admin_initial":"admin_update"');
    expect(db).toContain('"trading_package_fee_policy_initialized":"trading_package_fee_policy_updated"');
    expect(db).toContain("const history=await getPackageFeeHistory(input.packageId)");
    expect(db).toContain("fresh read-back");
  });

  it("keeps package policies append-only in application code and returns stable package names and audit metadata", () => {
    expect(db).toContain("db.select({packageId:packages.id,packageName:packages.name})");
    expect(db).toContain("changedBy:String(actorId)");
    expect(db).toContain('const source=write.initial?"admin_initial":"admin_update"');
    expect(db).toContain("effectiveAt.getTime()<=new Date(current.effectiveAt).getTime()");
    expect(db).not.toContain("tx.update(tradingPackageFeePolicyVersions)");
    expect(db).not.toContain("tx.delete(tradingPackageFeePolicyVersions)");
  });

  it("fails closed on missing or invalid legacy settings while copying the baseline for packages", () => {
    expect(migration).toContain("LEFT JOIN `app_settings` r ON r.`settingKey`='trade.platformFeeBps'");
    expect(migration).toContain("LEFT JOIN `app_settings` m ON m.`settingKey`='trade.feeRoundingMode'");
    expect(migration).toContain("ELSE 10001");
    expect(migration).toContain("ELSE '__invalid__'");
    expect(migration).toContain("CHECK (`feeRateBps` BETWEEN 0 AND 10000)");
    expect(migration).toContain("CHECK (`roundingMode` IN ('half_up','down','up','half_even'))");
    expect(migration).toContain("WHERE existing.`packageId` IS NULL");
    expect(migration).toContain("legacy_global_baseline_0101");
    expect(migration).not.toMatch(/UPDATE\s+`?trade_positions`?/i);
    expect(migration).not.toMatch(/UPDATE\s+`?balance_ledger`?/i);
  });

  it("snapshots package fee identity and values during allocation and uses them at confirmation", () => {
    expect(db).toContain("const feePackageId=Number(activePackageSubscription.packageId)");
    expect(db).toContain("lte(tradingPackageFeePolicyVersions.effectiveAt,allocationAt)");
    expect(db).toContain("orderBy(desc(tradingPackageFeePolicyVersions.effectiveAt),desc(tradingPackageFeePolicyVersions.version))");
    expect(db).toContain("selectLatestEffectivePackageFeePolicy(feeRows,allocationAt)");
    expect(db).toContain("if(!packageFeePolicy) throw new Error(");
    expect(db).toContain("packageIdSnapshot:feePackageId");
    expect(db).toContain("packageFeeRateBpsSnapshot:packageFeePolicy.feeRateBps");
    expect(db).toContain("packageFeeRoundingModeSnapshot:packageFeePolicy.roundingMode");
    expect(db).toContain("packageFeePolicyVersionSnapshot:packageFeePolicy.version");
    expect(db).toContain("packageFeeEffectiveAtSnapshot:new Date(packageFeePolicy.effectiveAt)");
    expect(db).toContain("if(trade.packageIdSnapshot!==null)");
    expect(db).toContain("Trade package fee snapshot does not match its allocated package");
    expect(db).toContain("normalizeImmutableTradeFeeSnapshot({");
    expect(db).toContain("roundingMode:trade.platformFeeRoundingMode");
    expect(db).not.toContain('feeByKey.get("trade.platformFeeBps")');
    expect(db).not.toContain("DEFAULT_TRADE_FEE_POLICY");
  });

  it("keeps a newly created package without an explicit package fee unconfigured and allocation-blocked", () => {
    expect(db).toContain('if(!packageFeePolicy) throw new Error("The selected package has no saved fee policy; allocation is blocked until an administrator configures one")');
    expect(db).toContain("configured:Boolean(activePolicy)");
    expect(db).toContain('const source=write.initial?"admin_initial":"admin_update"');
    const createStart = db.indexOf("export async function createAdminTradingPackage(");
    const createEnd = db.indexOf("export async function updateAdminTradingPackage(", createStart);
    const creation = db.slice(createStart, createEnd);
    expect(creation).toContain("await tx.insert(packages).values");
    expect(creation).not.toContain("tradingPackageFeePolicyVersions");
    expect(migration).toContain("WHERE existing.`packageId` IS NULL");
    expect(migration).toContain("legacy_global_baseline_0101");
    expect(read("./db.ts")).toContain("getPackageFeePolicies");
  });

  it("returns the current effective policy separately from the latest optimistic-update version", () => {
    expect(db).toContain("activePolicy,");
    expect(db).toContain("latestPolicy,");
    expect(db).toContain("latestVersion:latestPolicy?.version??null");
    expect(db).toContain("version:activePolicy?.version??null");
    expect(db).toContain("resolvePackageFeePolicyWrite(current?Number(current.version):null,input.expectedVersion)");
    expect(router).not.toContain("updateTradeFeePolicy: adminProcedure");
    const ui = read("../client/src/components/AdminPackageFeeEditor.tsx");
    const historyUi = read("../client/src/components/AdminOperationsPages.tsx");
    expect(ui).toContain("policy.activePolicy.feeRateBps");
    expect(ui).toContain("latest?.feeRateBps");
    expect(ui).toContain("policy.latestPolicyVersion");
    expect(historyUi).toContain("Legacy global fee settings are read-only");
  });

  it("makes legacy global policy writes fail closed at both the API and DB helper boundaries", () => {
    expect(db).toContain("READ_ONLY_LEGACY_TRADE_FEE_SETTING_KEYS.has(key)");
    expect(db).toContain("Legacy global Trading fee settings are read-only");
    expect(db).toContain("export async function setTradeFeePolicy");
    expect(db).toContain("throw new Error(\"Legacy global Trading fee settings are read-only; configure a package-specific fee policy instead\")");
    expect(router).toContain("tradeFeePolicy: adminProcedure.query(() => getTradeFeePolicy())");
    expect(router).not.toContain("updateTradeFeePolicy");
    expect(db).toContain("const missing=TRADE_FEE_SETTING_KEYS.filter(key=>!byKey.has(key))");
    expect(db).not.toContain("DEFAULT_TRADE_FEE_POLICY");
  });

  it("uses historical trade snapshots and rejects absent evidence instead of reading mutable globals", () => {
    expect(db).toContain("feeRateBps:trade.platformFeeRateBps");
    expect(db).toContain("roundingMode:trade.platformFeeRoundingMode");
    expect(db).toContain("policyVersion:trade.feePolicyVersion");
    const settlementStart = db.indexOf("export async function manuallySettleTrade(");
    const settlementEnd = db.indexOf("export async function processConfirmedTradeCredits(", settlementStart);
    const settlement = db.slice(settlementStart, settlementEnd);
    expect(settlement).toContain("normalizeImmutableTradeFeeSnapshot({");
    expect(settlement).not.toContain("TRADE_FEE_SETTING_KEYS");
    expect(settlement).not.toContain("getAppSetting");
  });

  it("preserves positive-gross-only exact accounting across all supported fee rates and rounding rules", () => {
    expect(calculateRealizedProfitSettlement({ principalMinor: 10000, grossProfitMinor: 999, feeRateBps: 2500, roundingMode: "half_up" }))
      .toMatchObject({ platformFeeMinor: 250, netProfitMinor: 749 });
    expect(calculateRealizedProfitSettlement({ principalMinor: 10000, grossProfitMinor: -999, feeRateBps: 2500, roundingMode: "half_up" }))
      .toMatchObject({ platformFeeMinor: 0, netProfitMinor: -999 });
  });

  it("keeps the forward migration under canonical main ownership with recovery and worker coverage", () => {
    const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === "0101_package_fee_policy_versions");
    expect(index).toBeGreaterThan(0);
    expect(journal.entries[index - 1].tag).toBe("0100_global_trade_master_controls");
    const portalFiles = portal.match(/const migrationFiles = \[([\s\S]*?)\];/)?.[1] ?? "";
    const recoveryFiles = recovery.match(/const portalMigrationFiles = \[([\s\S]*?)\];/)?.[1] ?? "";
    expect(portalFiles).not.toContain("0101_package_fee_policy_versions.sql");
    expect(recoveryFiles).not.toContain("0101_package_fee_policy_versions.sql");
    expect(portal).toContain("canonical Drizzle-journal migrations");
    expect(recovery).toContain("reported through MAIN DRIZZLE MIGRATIONS");
    expect(workerBridge).toContain('drizzle/0101_package_fee_policy_versions.sql');
    expect(workerContracts).toContain('"packageFeeRateBpsSnapshot"');
    expect(workerContracts).toContain("trading_package_fee_policy_versions: {");
  });
});
