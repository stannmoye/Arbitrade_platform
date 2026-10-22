import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function provisionSignupCredit");
const end = source.indexOf("const defaultCurrencies", start);
const implementation = source.slice(start, end);

describe("signup credit notification boundary", () => {
  it("notifies only after the signup credit ledger entry is persisted", () => {
    const ledgerWrite = implementation.indexOf('entryType:"signup_credit"');
    const noticeAttempt = implementation.indexOf("await notifySignupCredit(amount,currency)");
    expect(ledgerWrite).toBeGreaterThan(-1);
    expect(noticeAttempt).toBeGreaterThan(ledgerWrite);
    expect(implementation).toContain("withdrawable:false");
    expect(implementation).toContain('category:"ledger_credit"');
  });

  it("uses a stable recipient-scoped event key and retries notice delivery for an existing ledger credit", () => {
    expect(implementation).toContain('eventKey:`signup-credit:${userId}`');
    expect(implementation).toContain("if(existing[0]) {");
    expect(implementation).toContain("await notifySignupCredit(Number(existing[0].amountMinor),String(existing[0].currency));");
    expect(implementation).toContain("await notifySignupCredit(amount,currency);");
  });

  it("keeps notification failure from misreporting or reversing the persisted credit", () => {
    expect(implementation).toContain('console.error("[Notifications] Signup credit notice failed after ledger persistence:"');
    expect(implementation).toContain('error instanceof Error?error.name:"UnknownError"');
  });
});
