import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../client/src/admin-operations.css", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");
const manual = readFileSync(new URL("../docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md", import.meta.url), "utf8");

describe("persistent administrator Trading control panel", () => {
  it("renders above the selected page so it remains visible across admin navigation", () => {
    const mount = adminApp.indexOf("<AdminTradingGlobalControls/>");
    const pageRouter = adminApp.indexOf('<PortalRenderBoundary key={section} portal="admin">');
    expect(adminApp).toContain("function AdminTradingGlobalControls()");
    expect(mount).toBeGreaterThanOrEqual(0);
    expect(pageRouter).toBeGreaterThan(mount);
    expect(adminApp).toContain('trpc.adminOperations.packagePolicies.useQuery(undefined, { refetchInterval: 10000 })');
    expect(adminApp).toContain("trpc.adminOperations.updatePackagePolicies.useMutation");
    expect(adminApp).toContain("Pause all new delivery");
  });

  it("exposes the saved package-level switches and keeps high-impact execution controls protected", () => {
    for (const field of ["enabled", "automaticDelivery", "companyRotationEnabled", "randomizationEnabled", "burstEnabled"]) {
      expect(adminApp).toContain(`key: "${field}"`);
    }
    expect(adminApp).toContain("automaticTradingEnabled: false");
    expect(adminApp).toContain("Enabled in saved policy");
    expect(adminApp).toContain("Not enabled");
    expect(adminApp).not.toContain('if (next && (key === "enabled" || key === "automaticDelivery") && policy.automaticTradingEnabled)');
    expect(adminApp).toContain('enabled: next, automaticTradingEnabled: false');
    expect(adminApp).toContain('automaticDelivery: next, automaticTradingEnabled: false');
    expect(adminApp).toContain("requirePreviousSettlement: true");
    expect(adminApp).not.toContain("automaticTradingEnabled: true");
  });

  it("does not expose a UI route for enabling automatic execution or disabling the settlement guard", () => {
    expect(policyEditor).not.toContain('onChange={e=>updateRow(index,"automaticTradingEnabled"');
    expect(policyEditor).not.toContain('onChange={e=>updateRow(index,"requirePreviousSettlement"');
    expect(policyEditor).toContain('onClick={()=>updateRow(index,"automaticTradingEnabled",false)}');
    expect(policyEditor).toContain('onClick={()=>updateRow(index,"requirePreviousSettlement",true)}');
    expect(policyEditor).toContain('Math.max(900,Number(e.target.value)||900)');
    expect(adminApp).toContain("settlementTimingSafe");
  });

  it("styles the panel for persistent desktop and mobile visibility and documents its safeguards", () => {
    expect(adminCss).toContain(".admin-trading-global-controls");
    expect(adminCss).toContain(".admin-trading-global-controls__grid");
    expect(adminCss).toContain("@media (max-width: 760px)");
    expect(specification).toContain("Persistent administrator control panel and safety boundary");
    expect(manual).toContain("Persistent admin-wide Trading control panel");
    expect(manual).toContain("900 seconds (15 minutes)");
  });
});
