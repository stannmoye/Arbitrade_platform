import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("export async function createOpportunityOffer(", start);
const implementation = source.slice(start, end);

describe("actual trade result ledger accounting", () => {
  it("takes an actual signed gross result, never the estimated reserved reward", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("grossProfitMinor:number; settlementReference:string");
    expect(implementation).toContain("calculateRealizedProfitSettlement(");
    expect(implementation).not.toContain("input.rewardMinor>Number(trade.rewardReservedMinor");
    expect(routerSource).toContain("grossProfitMinor: z.number().int()");
    expect(routerSource).not.toContain("rewardMinor: z.number().int().nonnegative(), settlementReference");
  });

  it("records principal, gross result, fee, net result, and outcome under the same transaction", () => {
    expect(implementation).toContain('entryType:"trade_principal_release"');
    expect(implementation).toContain('entryType:"trade_reward"');
    expect(implementation).toContain('entryType:"trade_platform_fee"');
    expect(implementation).toContain('entryType:"trade_loss"');
    expect(implementation).toContain("realizedGrossProfitMinor:accounting.grossProfitMinor");
    expect(implementation).toContain("platformFeeMinor:accounting.platformFeeMinor");
    expect(implementation).toContain("netProfitMinor:accounting.netProfitMinor");
    expect(implementation).toContain("feePolicyVersion:feePolicy.policyVersion");
    expect(implementation).toContain("platformFeeRateBps:feePolicy.feeRateBps");
    expect(implementation).toContain("platformFeeRoundingMode:feePolicy.roundingMode");
    expect(implementation).toContain("tradeSettlementReferenceClaims");
  });

  it("uses the same calculated net result for wallet return and earned balance", () => {
    expect(implementation).toContain("availableMinor:sql");
    expect(implementation).toContain("accounting.totalReturnedMinor");
    expect(implementation).toContain("earnedMinor:sql");
    expect(implementation).toContain("accounting.netProfitMinor");
    expect(implementation).toContain("reservedMinor:Math.max(0,accounting.netProfitMinor)");
  });
});
