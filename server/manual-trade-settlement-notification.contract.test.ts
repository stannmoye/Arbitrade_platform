import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("export async function createOpportunityOffer(", start);
const implementation = source.slice(start, end);

describe("manual trade settlement notification boundary", () => {
  it("emits notices only after the settlement transaction has committed", () => {
    const transactionEnd = implementation.indexOf('  await updatePopupLifecycleForOffer(result.userId,result.offerId,"settled");');
    const noticeBatch = implementation.indexOf("const noticeResults=await Promise.allSettled", transactionEnd);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(transactionEnd).toBeGreaterThan(implementation.indexOf("await db.transaction(async tx=>"));
    expect(noticeBatch).toBeGreaterThan(transactionEnd);
    expect(implementation.slice(0, transactionEnd)).not.toContain("createNotification(");
  });

  it("uses stable settlement-reference keys and distinguishes principal from positive rewards", () => {
    expect(implementation).toContain("`trade-settlement:${result.reference}:principal`");
    expect(implementation).toContain("`trade-settlement:${result.reference}:reward`");
    expect(implementation).toContain('category:"ledger_credit" as const');
    expect(implementation).toContain('category:"trading_reward" as const');
    expect(implementation).toContain("result.rewardMinor>0?");
  });

  it("keeps notification failures best-effort after financial commit", () => {
    expect(implementation).toContain("await Promise.allSettled(settlementNotices.map");
    expect(implementation).toContain('[Notifications] One or more trade settlement notices failed after commit.');
    expect(implementation).toContain("  return result;");
  });
});
