import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const notificationSource = readFileSync(new URL("./modules/notification-events.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("export async function createOpportunityOffer(", start);
const implementation = source.slice(start, end);

describe("manual trade settlement notification boundary", () => {
  it("keeps notification delivery outside the durable financial transaction", () => {
    const transactionStart = implementation.indexOf("await db.transaction(async tx=>");
    const transactionBoundary = implementation.indexOf('  await updatePopupLifecycleForOffer(result.userId,result.offerId,"settled");');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionBoundary).toBeGreaterThan(transactionStart);
    expect(implementation).not.toContain("createNotification(");
    expect(implementation.slice(transactionBoundary)).toContain("return result;");
    expect(routerSource).toContain("buildTradeSettlementNotices({");
    expect(routerSource).toContain("await Promise.allSettled(notices.map");
  });

  it("uses stable per-trade event keys and distinguishes gross result, fees, and losses", () => {
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:principal`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:reward`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:fee`");
    expect(notificationSource).toContain("`trade-settlement:${input.tradeId}:loss`");
    expect(notificationSource).toContain("Net trading profit credited");
    expect(notificationSource).toContain("Trading platform fee recorded");
    expect(notificationSource).toContain("Trading loss recorded");
    expect(routerSource).toContain("grossProfitMinor:result.grossProfitMinor");
    expect(routerSource).toContain("platformFeeMinor:result.platformFeeMinor");
    expect(routerSource).toContain("netProfitMinor:result.netProfitMinor");
  });

  it("keeps notification failures best-effort after financial commit", () => {
    expect(routerSource).toContain("Promise.allSettled(notices.map");
    expect(routerSource).toContain("One or more trade settlement notices failed after ledger commit.");
  });
});
