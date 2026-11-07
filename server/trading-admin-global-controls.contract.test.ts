import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../client/src/admin-operations.css", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");
const manual = readFileSync(new URL("../docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md", import.meta.url), "utf8");

describe("Package Configuration global Trade controls", () => {
  it("renders the single global owner and allocation safety gate on the owner route", () => {
    const ownerStart = adminApp.indexOf("function AdminPackageConfiguration()");
    const ownerEnd = adminApp.indexOf("function AdminPackages({focus}", ownerStart);
    const owner = adminApp.slice(ownerStart, ownerEnd);
    expect(ownerStart).toBeGreaterThanOrEqual(0);
    expect(owner).toContain("<AdminGlobalTradeControls />");
    expect(owner).toContain("<AdminTradeAllocationControl />");
    expect(adminApp).toContain("function AdminGlobalTradeControls()");
    expect(adminApp).not.toContain("AdminPackagePolicyControls");
    expect(adminApp).not.toContain("Per-package delivery controls");
    expect(adminApp).toContain("trpc.adminOperations.globalTradeControls.useQuery");
    expect(adminApp).toContain("trpc.adminOperations.updateGlobalTradeControl.useMutation");
    expect(adminApp).toContain('key:"requirePreviousSettlement",label:"Require previous settlement"');
    expect(adminApp).toContain("expectedPolicyVersion:Number(policy.policyVersion)");
    expect(adminApp).toContain("fresh database read did not confirm the requested value and a newer policy version");
    expect(adminApp).toContain("Administrator reason (required, 5–500 characters)");
  });

  it("keeps legacy controls out of tier mutation input and fails closed when global settings are unavailable", () => {
    const start = router.indexOf("updatePackagePolicies: adminProcedure.input");
    const end = router.indexOf("createOffer: adminProcedure.input", start);
    const packageMutation = router.slice(start, end);
    for (const field of ["enabled", "automaticDelivery", "companyRotationEnabled", "randomizationEnabled", "burstEnabled", "automaticTradingEnabled", "requirePreviousSettlement"]) {
      expect(packageMutation).not.toContain(`${field}: z.boolean().optional()`);
    }
    expect(packageMutation).toContain("}).strict()).min(1).max(1000)");
    expect(adminApp).toContain("The canonical global policy is not installed or is malformed");
    expect(adminApp).toContain("no defaults were created");
    expect(adminApp).toContain("requirePreviousSettlement");
    expect(adminApp).toContain("OFF · locked");
    expect(adminApp).not.toContain("This safety prerequisite cannot be switched OFF through this route.");
    expect(database).not.toContain('if(input.key==="requirePreviousSettlement"&&input.enabled===false)');
    expect(database).toContain("const AUTOMATIC_FINANCIAL_EXECUTION_ENABLED = false");
    expect(adminApp).not.toContain("automaticTradingEnabled: true");
  });

  it("keeps the package editor settlement guard locked and documents the owner boundary", () => {
    expect(policyEditor).toContain("Previous-settlement prerequisite is global.");
    expect(policyEditor).not.toContain("ON — global guard required");
    expect(policyEditor).not.toContain('onChange={e=>updateRow(index,"requirePreviousSettlement"');
    expect(adminCss).toContain(".admin-trading-global-controls");
    expect(adminCss).toContain(".admin-trading-global-controls__grid");
    expect(adminCss).toContain("@media (max-width: 760px)");
    expect(specification).toContain("**Package Configuration** route");
    expect(manual).toContain("dedicated **Package Configuration** route");
  });
});
