import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(new URL("../client/src/components/TradeSettingsAdministration.tsx", import.meta.url), "utf8");
const packageEditor = editor.slice(editor.indexOf("export function AdminTradePackageSettings"));
const navigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Package Settings single-owner term contract", () => {
  it("renders the complete per-package term set from one owner route", () => {
    for (const field of [
      "name",
      "minimumQualifyingBalanceUsdMinor",
      "durationMonths",
      "opportunitiesPerDay",
      "maxPopupsPerDay",
      "maxActiveInvestments",
      "startsAt",
      "expiresAt",
      "enabled",
      "minimumPlatformFeeBps",
      "maximumPlatformFeeBps",
      "platformFeeRoundingMode",
    ]) expect(editor).toContain(field);
    expect(navigation).toContain('id: "trade-package-settings", target: "tradePackageSettings"');
    expect(app).toContain('section==="tradePackageSettings"');
  });

  it("uses one atomic package-settings mutation without replaying global settings", () => {
    expect(packageEditor).toContain("trpc.adminOperations.updateTradingPackageSettings.useMutation");
    expect(packageEditor).toContain("const [packagesRead, policiesRead] = await Promise.all");
    expect(packageEditor).toContain("a fresh database read did not confirm every saved term");
    expect(packageEditor).toContain("Existing customer snapshots remain unchanged");
    expect(packageEditor).toContain("saved atomically and verified");
    expect(packageEditor).toContain("void packages.refetch()");
    expect(packageEditor).toContain("void policies.refetch()");
    expect(packageEditor).not.toContain("updateTradeGlobalSettings");
    expect(router).toContain("updateTradingPackageSettings: adminProcedure.input");
    expect(router).toContain("updateAdminTradingPackageSettings(ctx.user.id");
    expect(readFileSync(new URL("./db.ts", import.meta.url), "utf8")).toContain('action:"trading_package_settings_updated"');
  });

  it("keeps the global safety controls on the separate Package Configuration owner", () => {
    expect(navigation).toContain('id: "trade-package-configuration", target: "tradePackageConfiguration"');
    expect(editor).toContain("Global masters apply across applicable packages");
    expect(editor).toContain("single global owner");
    expect(editor).toContain("Require previous settlement");
  });
});
