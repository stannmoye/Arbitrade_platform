import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../client/src/admin-operations.css", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");
const manual = readFileSync(new URL("../docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md", import.meta.url), "utf8");

describe("Package Configuration owner controls", () => {
  it("renders package policy controls and allocation safety only on their owner route", () => {
    const ownerStart = adminApp.indexOf("function AdminPackageConfiguration()");
    const ownerEnd = adminApp.indexOf("function AdminPackages({focus}", ownerStart);
    const owner = adminApp.slice(ownerStart, ownerEnd);
    expect(ownerStart).toBeGreaterThanOrEqual(0);
    expect(owner).toContain("<AdminPackagePolicyControls />");
    expect(owner).toContain("<AdminTradeAllocationControl />");
    expect(adminApp).toContain("function AdminPackagePolicyControls()");
    expect(adminApp).not.toContain("<AdminTradingGlobalControls/>");
    expect(adminApp).not.toContain('{section!=="overview"&&<AdminPackagePolicyControls/>}');
    expect(adminApp).not.toContain("Persistent Trading controls");
    expect(adminApp).toContain('trpc.adminOperations.packagePolicies.useQuery(undefined, { refetchInterval: 10000 })');
    expect(adminApp).toContain("trpc.adminOperations.updatePackagePolicies.useMutation");
    expect(adminApp).toContain("fresh server read did not confirm every changed field and policy version");
    expect(adminApp).toContain("Change reason (required, 5–500 characters)");
    expect(adminApp).toContain("Pause all new delivery");
  });

  it("exposes the saved package-level switches and keeps high-impact execution controls protected", () => {
    for (const field of ["enabled", "automaticDelivery", "companyRotationEnabled", "randomizationEnabled", "burstEnabled"]) {
      expect(adminApp).toContain(`key: "${field}"`);
    }
    expect(adminApp).toContain("automaticTradingEnabled: false");
    expect(adminApp).toContain("Currently enabled in saved policy");
    expect(adminApp).toContain("Protected OFF");
    expect(adminApp).not.toContain('if (next && (key === "enabled" || key === "automaticDelivery") && policy.automaticTradingEnabled)');
    expect(adminApp).toContain('enabled: next, automaticTradingEnabled: false');
    expect(adminApp).toContain('automaticDelivery: next, automaticTradingEnabled: false');
    expect(adminApp).toContain("requirePreviousSettlement: true");
    expect(adminApp).not.toContain("automaticTradingEnabled: true");
  });

  it("does not expose a UI route for enabling automatic execution or disabling the settlement guard", () => {
    expect(policyEditor).not.toContain('onChange={e=>updateRow(index,"automaticTradingEnabled"');
    expect(policyEditor).not.toContain('onChange={e=>updateRow(index,"requirePreviousSettlement"');
    expect(adminApp).toContain("function AdminPackagePolicyControls()");
    expect(adminApp).toContain("disableAutomaticTrading(policy)");
    expect(adminApp).toContain("enableSettlementGate(policy)");
    expect(policyEditor).toContain('onClick={()=>updateRow(index,"requirePreviousSettlement",true)}');
    expect(policyEditor).toContain('Math.max(900,Number(e.target.value)||900)');
    expect(adminApp).toContain("settlementTimingSafe");
  });

  it("styles the owner panel responsively and documents its transitional storage and safety boundaries", () => {
    expect(adminCss).toContain(".admin-trading-global-controls");
    expect(adminCss).toContain(".admin-trading-global-controls__grid");
    expect(adminCss).toContain("@media (max-width: 760px)");
    expect(specification).toContain("**Package Configuration** route");
    expect(manual).toContain("dedicated **Package Configuration** route");
    expect(manual).toContain("not yet a single global settings row");
    expect(manual).toContain("900 seconds (15 minutes)");
  });
});
