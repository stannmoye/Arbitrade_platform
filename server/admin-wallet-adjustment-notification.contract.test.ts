import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function adjustCustomerBalance(");
const end = source.indexOf("export async function listOpenOffers(", start);
const implementation = source.slice(start, end);

describe("administrator wallet adjustment notification boundary", () => {
  it("persists the authoritative balance and ledger entry before attempting notification", () => {
    const transactionStart = implementation.indexOf("await db.transaction(async tx=>");
    const transactionEnd = implementation.indexOf("\n\n  if(result.entryType===", transactionStart);
    const noticeAttempt = implementation.indexOf("await createNotification", transactionEnd);
    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionEnd).toBeGreaterThan(transactionStart);
    expect(implementation.slice(transactionStart, transactionEnd)).toContain("tx.insert(balanceLedger)");
    expect(noticeAttempt).toBeGreaterThan(transactionEnd);
  });

  it("uses the correct credit/debit title and ledger category with a stable ledger-reference key", () => {
    expect(implementation).toContain('`Wallet ${input.mode==="credit"?"credited":"debited"}`');
    expect(implementation).toContain('input.mode==="credit"?"ledger_credit":"ledger_debit"');
    expect(implementation).toContain('category:input.mode==="credit"?"ledger_credit":"ledger_debit"');
    expect(implementation).toContain("eventKey:`wallet-adjustment:${result.ledgerReference}`");
    expect(implementation).toContain('const entryType=qualifyingDepositReversalOfId!==null?"admin_manual_deposit_reversal":qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":`admin_${input.mode}`');
    expect(implementation).toContain('input.creditClassification==="qualifying_deposit"');
  });

  it("retains qualifying deposit and reversal references in the admin transaction-console audit event", () => {
    expect(routerSource).toContain("debitClassification:input.debitClassification");
    expect(routerSource).toContain("reversalLedgerId:input.reversalLedgerId");
    expect(routerSource).toContain("qualifyingDepositReversalOfId:result.qualifyingDepositReversalOfId");
    expect(routerSource).toContain("qualifyingDepositRateProvider:result.qualifyingDepositRateProvider");
  });

  it("keeps notice delivery best-effort and does not reverse a committed ledger adjustment", () => {
    expect(implementation).toContain('console.error("[Notifications] Wallet adjustment notice failed after ledger commit:"');
    expect(implementation).toContain('error instanceof Error?error.name:"UnknownError"');
    expect(implementation).toContain("return result;");
  });

  it("rejects unsafe minor-unit amounts and locks the target wallet row before reading its balance", () => {
    expect(implementation).toContain("!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0");
    expect(implementation).toContain('.limit(1).for("update"))[0];');
    expect(implementation).toContain("const current=balance?.availableMinor??0");
    expect(implementation).toContain("!Number.isSafeInteger(current)||current<0");
    expect(implementation).toContain("!Number.isSafeInteger(next)");
  });

  it("rejects unsafe promotional-balance arithmetic instead of persisting rounded JavaScript numbers", () => {
    expect(implementation).toContain("!Number.isSafeInteger(balance.promotionalMinor)");
    expect(implementation).toContain("!Number.isSafeInteger(balance.promotionalMinor+input.amountMinor)");
    expect(implementation).toContain("Wallet promotional balance is invalid or exceeds the safe integer range");
  });
});
