import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canStartMiningAccrual, VERIFIED_FARM_SETTLEMENTS_ENABLED } from "./mining-rules";

const miningPath = new URL("./mining.ts", import.meta.url);
const adminPath = new URL("./mining-admin.ts", import.meta.url);
const routerPath = new URL("./routers.ts", import.meta.url);
const adminUiPath = new URL("../client/src/components/AdminMining.tsx", import.meta.url);
const customerUiPath = new URL("../client/src/components/CustomerMining.tsx", import.meta.url);

describe("verified Mining settlement safety gate", () => {
  it("does not allow settings or package estimates to enable CKI credits", async () => {
    expect(VERIFIED_FARM_SETTLEMENTS_ENABLED).toBe(false);
    expect(canStartMiningAccrual({ globalEnabled: true, expectedDailyRewardCki: "100" })).toBe(false);
    const [rules, admin, router, adminUi, customerUi] = await Promise.all([
      readFile(new URL("./mining-rules.ts", import.meta.url), "utf8"),
      readFile(adminPath, "utf8"),
      readFile(routerPath, "utf8"),
      readFile(adminUiPath, "utf8"),
      readFile(customerUiPath, "utf8"),
    ]);
    expect(rules).toContain("if (!VERIFIED_FARM_SETTLEMENTS_ENABLED || !input.globalEnabled");
    expect(admin).toContain("if (input.globalEnabled === true) throw new MiningError");
    expect(admin).toContain("globalEnabled:false");
    expect(admin).toContain("expectedDailyRewardCki:null");
    expect(router).not.toContain('expectedDailyRewardCki:z.string().max(64).nullable().optional()');
    expect(adminUi).not.toContain("Enable automatic CKI reward processing");
    expect(adminUi).not.toContain("Fixed package reward ·");
    expect(adminUi).not.toContain("Boost click bonus CKI");
    expect(adminUi).toContain("CKI credits pending verified settlement");
    expect(customerUi).not.toContain("Automatically convert eligible future rewards");
    expect(customerUi).toContain("CKI credits blocked pending verified settlements");
  });

  it("blocks estimated accrual, pending boost credits, and automatic conversions", async () => {
    const source = await readFile(miningPath, "utf8");
    expect(source).toContain("if (!VERIFIED_FARM_SETTLEMENTS_ENABLED || !config.globalEnabled) continue;");
    expect(source).toContain("if (VERIFIED_FARM_SETTLEMENTS_ENABLED && result.tokenAmount.gt(0))");
    expect(source).toContain("if (!VERIFIED_FARM_SETTLEMENTS_ENABLED) return 0;");
    expect(source).toContain("if (!VERIFIED_FARM_SETTLEMENTS_ENABLED || !config.globalEnabled)");
    expect(source).toContain("expectedDailyRewardCki: null");
    expect(source).toContain("rewardPostingEnabled: false");
    expect(source).toContain("CKI credits blocked pending verified farm settlements");
  });
});
