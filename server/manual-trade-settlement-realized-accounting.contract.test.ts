import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("export async function processConfirmedTradeCredits(", start);
const implementation = source.slice(start, end);
const creditStart = source.indexOf("export async function processConfirmedTradeCredits(");
const creditEnd = source.indexOf("\nexport async function createOpportunityOffer(", creditStart);
const creditImplementation = source.slice(creditStart, creditEnd);

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

  it("stores the actual result and immutable fee-policy snapshot without posting ledger entries", () => {
    expect(implementation).toContain("realizedGrossProfitMinor:accounting.grossProfitMinor");
    expect(implementation).toContain("platformFeeMinor:accounting.platformFeeMinor");
    expect(implementation).toContain("netProfitMinor:accounting.netProfitMinor");
    expect(implementation).toContain("feePolicyVersion:feePolicy.policyVersion");
    expect(implementation).toContain("platformFeeRateBps:feePolicy.feeRateBps");
    expect(implementation).toContain("platformFeeRoundingMode:feePolicy.roundingMode");
    expect(implementation).toContain("tradeSettlementReferenceClaims");
    expect(implementation).toContain('settlementStatus:"confirmed_awaiting_credit"');
    expect(implementation).not.toContain("tx.insert(balanceLedger)");
    expect(implementation).not.toContain("tx.update(customerBalances)");
  });

  it("posts principal, gross profit/loss, and fee only in the delayed credit worker", () => {
    expect(creditImplementation).toContain('entryType:"trade_principal_release"');
    expect(creditImplementation).toContain('entryType:"trade_reward"');
    expect(creditImplementation).toContain('entryType:"trade_platform_fee"');
    expect(creditImplementation).toContain('entryType:"trade_loss"');
    expect(creditImplementation).toContain("status:\"settled\"");
    expect(creditImplementation).toContain('settlementStatus:"completed"');
  });

  it("uses the same saved calculation for wallet return and earned balance at credit time", () => {
    expect(creditImplementation).toContain("availableMinor:sql");
    expect(creditImplementation).toContain("accounting.totalReturnedMinor");
    expect(creditImplementation).toContain("earnedMinor:sql");
    expect(creditImplementation).toContain("accounting.netProfitMinor");
    expect(creditImplementation).toContain("accounting.totalReturnedMinor");
    expect(creditImplementation).toContain("accounting.netProfitMinor");
    expect(creditImplementation).toContain("status:accounting.netProfitMinor>0?\"credited\":\"released\"");
    expect(creditImplementation).not.toContain("reservedMinor:Math.max(0,accounting.netProfitMinor)");
  });
});
