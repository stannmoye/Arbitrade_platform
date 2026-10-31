import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const workerHealth = readFileSync(new URL("./_core/workerHealth.ts", import.meta.url), "utf8");
const confirmationStart = database.indexOf("export async function manuallySettleTrade(");
const confirmationEnd = database.indexOf("\nexport async function processConfirmedTradeCredits(", confirmationStart);
const confirmation = database.slice(confirmationStart, confirmationEnd);
const creditStart = database.indexOf("export async function processConfirmedTradeCredits(");
const creditEnd = database.indexOf("\nexport async function createOpportunityOffer(", creditStart);
const credit = database.slice(creditStart, creditEnd);

describe("evidence-confirmed delayed wallet-credit lifecycle", () => {
  it("allows administrator review at trade completion, independently of the wallet-credit time", () => {
    expect(confirmationStart).toBeGreaterThanOrEqual(0);
    expect(confirmationEnd).toBeGreaterThan(confirmationStart);
    expect(confirmation).toContain("const settlementDueAt=trade.settlementReviewAt||trade.creditAt||trade.settlesAt");
    expect(database).toContain("const settlementReviewAt=new Date(settlesAt.getTime()+settlementDelaySeconds*1000)");
    expect(database).toContain("const creditAt=new Date(settlementReviewAt.getTime()+settlementPolicy.creditDelaySeconds*1000)");
    expect(confirmation).not.toContain("const settlementDueAt=trade.creditAt||trade.settlesAt");
    expect(confirmation).toContain('settlementStatus:"confirmed_awaiting_credit"');
  });

  it("records the evidence result without moving wallet funds or changing the reservation", () => {
    expect(confirmation).toContain("settlementConfirmedAt:now");
    expect(confirmation).toContain("settlementConfirmedBy:adminId");
    expect(confirmation).toContain("settlementReference:reference");
    expect(confirmation).toContain("realizedGrossProfitMinor:accounting.grossProfitMinor");
    expect(confirmation).toContain("platformFeeRateBps:feePolicy.feeRateBps");
    expect(confirmation).toContain("platformFeeRoundingMode:feePolicy.roundingMode");
    expect(confirmation).not.toContain("tx.insert(balanceLedger)");
    expect(confirmation).not.toContain("tx.update(customerBalances)");
    expect(confirmation).not.toContain("tx.update(tradeRewardReservations)");
    expect(confirmation).not.toContain('settlementStatus:"completed"');
  });

  it("only selects administrator-confirmed trades whose saved credit time has arrived", () => {
    expect(creditStart).toBeGreaterThanOrEqual(0);
    expect(creditEnd).toBeGreaterThan(creditStart);
    expect(credit).toContain('eq(tradePositions.status,"confirmed")');
    expect(credit).toContain('eq(tradePositions.settlementStatus,"confirmed_awaiting_credit")');
    expect(credit).toContain("lte(tradePositions.creditAt,now)");
    expect(credit).toContain("const creditDueAt=trade.creditAt||trade.settlementReviewAt||trade.creditAt||trade.settlesAt");
    expect(credit).toContain("new Date(creditDueAt).getTime()>now.getTime()");
  });

  it("locks and verifies the confirmed result, unique reference, fee calculation, reservation, and principal", () => {
    expect(credit).toContain('.limit(1).for("update")');
    expect(credit).toContain("trade.settlementConfirmedAt");
    expect(credit).toContain("trade.settlementConfirmedBy");
    expect(credit).toContain("trade.settlementReference");
    expect(credit).toContain("tx.select().from(tradeSettlementReferenceClaims)");
    expect(credit).toContain("calculateRealizedProfitSettlement(");
    expect(credit).toContain("Saved confirmed settlement amounts do not match the immutable fee-policy calculation");
    expect(credit).toContain("reservation.status!==\"reserved\"");
    expect(credit).toContain("lockedMinor<principal");
  });

  it("posts ledger and wallet changes atomically with a conditional one-time terminal transition", () => {
    const firstLedger = credit.indexOf("tx.insert(balanceLedger)");
    const walletUpdate = credit.indexOf("tx.update(customerBalances)");
    const tradeUpdate = credit.indexOf("tx.update(tradePositions)");
    expect(firstLedger).toBeGreaterThanOrEqual(0);
    expect(walletUpdate).toBeGreaterThan(firstLedger);
    expect(tradeUpdate).toBeGreaterThan(walletUpdate);
    expect(credit).toContain('status:"settled"');
    expect(credit).toContain('settlementStatus:"completed"');
    expect(credit).toContain("isNull(tradePositions.walletUpdatedAt)");
    expect(credit).toContain("assertExactlyOneAffectedRow(walletUpdate");
    expect(credit).toContain("assertExactlyOneAffectedRow(stateUpdate");
    expect(credit).toContain('eventType:"wallet_credit_posted"');
    expect(credit).toContain('eventType:"trade_completed"');
  });

  it("runs as a bounded monitored server worker and is visible in worker health", () => {
    expect(server).toContain("processConfirmedTradeCredits");
    expect(server).toContain('runMonitoredWorkerCycle("settlement-credit-posting"');
    expect(server).toContain("processConfirmedTradeCredits({ limit: 100 })");
    expect(workerHealth).toContain('key: "settlement-credit-posting"');
    expect(workerHealth).toContain("after their saved wallet-credit time");
  });
});
