import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const notificationSource = readFileSync(new URL("./modules/notification-events.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("\nexport async function processConfirmedTradeCredits(", start);
const confirmation = source.slice(start, end);
const creditStart = source.indexOf("export async function processConfirmedTradeCredits(");
const creditEnd = source.indexOf("\nexport async function createOpportunityOffer(", creditStart);
const creditPosting = source.slice(creditStart, creditEnd);

describe("manual trade settlement notification boundary", () => {
  it("does not send settlement-credit notices when an administrator only confirms a result", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(confirmation).toContain('settlementStatus:"confirmed_awaiting_credit"');
    expect(confirmation).not.toContain("createNotification(");
    expect(routerSource).toContain("await manuallySettleTrade(input.tradeId,ctx.user.id,input)");
    expect(routerSource).not.toContain("buildTradeSettlementNotices({");
  });

  it("sends settlement notices only after the delayed wallet and ledger transaction commits", () => {
    const transactionClose = creditPosting.indexOf("    });\n    if(posted){");
    const notification = creditPosting.indexOf("const notices=buildTradeSettlementNotices({");
    expect(creditStart).toBeGreaterThanOrEqual(0);
    expect(creditEnd).toBeGreaterThan(creditStart);
    expect(transactionClose).toBeGreaterThan(0);
    expect(notification).toBeGreaterThan(transactionClose);
    expect(creditPosting).toContain("await Promise.allSettled(notices.map(notice=>createNotification(");
    expect(creditPosting).toContain("One or more trade settlement notices failed after wallet credit commit.");
    expect(creditPosting).toContain("wallet_credit_posted");
  });

  it("uses stable per-trade event keys and distinguishes gross result, fees, and losses", () => {
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:principal`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:reward`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:fee`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:loss`");
    expect(notificationSource).toContain("Net trading profit credited");
    expect(notificationSource).toContain("Trading platform fee recorded");
    expect(notificationSource).toContain("Trading loss recorded");
    expect(creditPosting).toContain("grossProfitMinor:posted.grossProfitMinor");
    expect(creditPosting).toContain("platformFeeMinor:posted.platformFeeMinor");
    expect(creditPosting).toContain("netProfitMinor:posted.netProfitMinor");
  });

  it("keeps notification failures best-effort after the durable wallet-credit commit", () => {
    expect(creditPosting).toContain("Promise.allSettled(notices.map");
    expect(creditPosting).toContain("One or more trade settlement notices failed after wallet credit commit.");
  });
});
