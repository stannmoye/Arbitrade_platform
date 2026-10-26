import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const signupStart = source.indexOf("export async function provisionSignupCredit(");
const signupEnd = source.indexOf("\nconst defaultCurrencies", signupStart);
const signup = source.slice(signupStart, signupEnd);
const settlementStart = source.indexOf("export async function manuallySettleTrade(");
const settlementEnd = source.indexOf("\nexport async function createOpportunityOffer(", settlementStart);
const settlement = source.slice(settlementStart, settlementEnd);

describe("wallet-changing transaction boundaries", () => {
  it("serializes signup-credit retries and writes wallet plus ledger inside one transaction", () => {
    expect(signupStart).toBeGreaterThanOrEqual(0);
    expect(signupEnd).toBeGreaterThan(signupStart);
    expect(signup).toContain("db.transaction(async (tx) =>");
    expect(signup).toContain("Number.isSafeInteger(amount)");
    const userLock = signup.indexOf("SELECT id FROM users");
    const idempotencyRead = signup.indexOf('eq(balanceLedger.entryType, "signup_credit")');
    const walletWrite = signup.indexOf("tx.update(customerBalances)");
    const ledgerWrite = signup.indexOf('entryType: "signup_credit"');
    const transactionClose = signup.indexOf("});\n\n  // Notifications are best-effort after commit");
    const notification = signup.indexOf("await notifySignupCredit(credited.amountMinor, credited.currency)");
    expect(userLock).toBeGreaterThanOrEqual(0);
    expect(idempotencyRead).toBeGreaterThan(userLock);
    expect(walletWrite).toBeGreaterThan(idempotencyRead);
    expect(ledgerWrite).toBeGreaterThan(idempotencyRead);
    expect(transactionClose).toBeGreaterThan(ledgerWrite);
    expect(notification).toBeGreaterThan(transactionClose);
    expect(signup).not.toContain("await db.update(customerBalances)");
    expect(signup).not.toContain("await db.insert(balanceLedger)");
  });

  it("keeps manual settlement claim, wallet and ledger changes in a transaction", () => {
    expect(settlementStart).toBeGreaterThanOrEqual(0);
    expect(settlementEnd).toBeGreaterThan(settlementStart);
    expect(settlement).toContain("db.transaction(async tx=>");
    const claim = settlement.indexOf("tx.insert(tradeSettlementReferenceClaims)");
    const firstLedgerPost = settlement.indexOf("tx.insert(balanceLedger)");
    const walletUpdate = settlement.indexOf("tx.update(customerBalances)");
    const tradeUpdate = settlement.indexOf("tx.update(tradePositions)");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(firstLedgerPost).toBeGreaterThan(claim);
    expect(walletUpdate).toBeGreaterThan(firstLedgerPost);
    expect(tradeUpdate).toBeGreaterThan(walletUpdate);
    expect(settlement).not.toContain("await db.insert(balanceLedger)");
    expect(settlement).not.toContain("await db.update(customerBalances)");
  });
});
