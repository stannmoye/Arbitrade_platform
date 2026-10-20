import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function adjustCustomerBalance(");
const end = source.indexOf("export async function listOpenOffers(", start);
const implementation = source.slice(start, end);

describe("administrator wallet adjustment notification boundary", () => {
  it("persists the authoritative balance and ledger entry before attempting notification", () => {
    const transactionStart = implementation.indexOf("await db.transaction(async tx=>");
    const transactionEnd = implementation.indexOf("}); try { await createNotification", transactionStart);
    const noticeAttempt = implementation.indexOf("await createNotification", transactionEnd);
    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionEnd).toBeGreaterThan(transactionStart);
    expect(implementation.slice(transactionStart, transactionEnd)).toContain("tx.insert(balanceLedger)");
    expect(noticeAttempt).toBeGreaterThan(transactionEnd);
  });

  it("uses the correct credit/debit title and ledger category with a stable ledger-reference key", () => {
    expect(implementation).toContain('input.mode==="credit"?"Wallet credited":"Wallet debited"');
    expect(implementation).toContain('input.mode==="credit"?"ledger_credit":"ledger_debit"');
    expect(implementation).toContain('category:input.mode==="credit"?"ledger_credit":"ledger_debit"');
    expect(implementation).toContain("eventKey:`wallet-adjustment:${result.ledgerReference}`");
    expect(implementation).toContain('entryType:`admin_${input.mode}`');
  });

  it("keeps notice delivery best-effort and does not reverse a committed ledger adjustment", () => {
    expect(implementation).toContain('console.error("[Notifications] Wallet adjustment notice failed after ledger commit:"');
    expect(implementation).toContain('error instanceof Error?error.name:"UnknownError"');
    expect(implementation).toContain("return result;");
  });
});
