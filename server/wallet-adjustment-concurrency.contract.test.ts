import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("administrator wallet adjustment concurrency contract", () => {
  it("locks the customer row before reading or creating a currency balance", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain('.limit(1).for("update"))[0]');
    expect(implementation).toContain('from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1).for("update"))[0]');
    expect(implementation).toContain("await db.transaction(async tx=>");
    expect(implementation).toContain("await tx.insert(balanceLedger).values");
  });

  it("keeps balance mutation and its ledger record in the same transaction", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(implementation.indexOf("await tx.update(customerBalances)")).toBeGreaterThan(-1);
    expect(implementation.indexOf("await tx.insert(balanceLedger)")).toBeGreaterThan(implementation.indexOf("await tx.update(customerBalances)"));
  });

  it("acquires the customer serialization lock before reading the wallet balance", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    const customerLock = implementation.indexOf('.limit(1).for("update"))[0]');
    const balanceRead = implementation.indexOf("from(customerBalances)");
    const balanceLock = implementation.indexOf('.limit(1).for("update"))[0]', customerLock + 1);
    expect(customerLock).toBeGreaterThanOrEqual(0);
    expect(balanceRead).toBeGreaterThan(customerLock);
    expect(balanceLock).toBeGreaterThan(balanceRead);
    expect(implementation.indexOf("await db.transaction(async tx=>")).toBeGreaterThanOrEqual(0);
  });

  it("rejects unsafe amounts and balance arithmetic before mutating the wallet", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(implementation).toContain('!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0');
    expect(implementation).toContain('!Number.isSafeInteger(current)||current<0');
    expect(implementation).toContain('!Number.isSafeInteger(next)');
    expect(implementation.indexOf('!Number.isSafeInteger(next)')).toBeLessThan(implementation.indexOf('await tx.update(customerBalances)'));
    expect(implementation.indexOf('!Number.isSafeInteger(next)')).toBeLessThan(implementation.indexOf('await tx.insert(customerBalances)'));
  });

  it("uses the committed ledger reference for notification and email idempotency", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(implementation).toContain("crypto.randomUUID()");
    expect(implementation).toContain("eventKey:`wallet-adjustment:${result.ledgerReference}`");
    expect(implementation).toContain("`admin-ledger:${result.ledgerReference}`");
    expect(implementation).not.toContain("`admin-ledger:${adminId}:${input.userId}:${Date.now()}`");
  });
});

describe("wallet one-row-per-currency database invariant", () => {
  const migration = readFileSync(new URL("../scripts/apply-mining-migrations.mjs", import.meta.url), "utf8");

  it("checks for duplicate balances before adding the unique customer/currency index", () => {
    const duplicateCheck = migration.indexOf("SELECT userId,currency FROM customer_balances GROUP BY userId,currency HAVING COUNT(*)>1 LIMIT 1");
    const uniqueIndex = migration.indexOf("ALTER TABLE customer_balances ADD UNIQUE INDEX uq_customer_balance_user_currency (userId,currency)");
    expect(migration).toContain("SHOW INDEX FROM customer_balances WHERE Key_name='uq_customer_balance_user_currency'");
    expect(duplicateCheck).toBeGreaterThanOrEqual(0);
    expect(uniqueIndex).toBeGreaterThan(duplicateCheck);
  });
});
