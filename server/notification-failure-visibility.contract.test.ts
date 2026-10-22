import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const miningSource = readFileSync(new URL("./mining.ts", import.meta.url), "utf8");
const notificationEventsSource = readFileSync(new URL("./modules/notification-events.ts", import.meta.url), "utf8");

describe("financial notification delivery observability", () => {
  it("does not count a notification as delivered when persistence cannot be confirmed", () => {
    expect(dbSource).toContain('if(!notificationId) throw new Error("Notification persistence could not be confirmed");');
  });

  it("keeps null-category legacy notifications visible in the event cursor when a category is disabled", () => {
    expect(dbSource).toContain("or(isNull(customerNotifications.category),notInArray(customerNotifications.category,disabled))");
  });

  it("orders notification cursor ties by descending ID for deterministic polling windows", () => {
    expect(dbSource).toContain("orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)).limit(500)");
  });

  it("reports failed allocation, settlement, and trade-allocation notices after commit", () => {
    expect(source).toContain('Automatic allocation notices failed after ledger commit.');
    expect(source).toContain('Automatic settlement notices failed after ledger commit.');
    expect(source).toContain('Trade allocation notices failed after ledger commit.');
    expect(source).toContain('allocationNoticeResults.some(outcome=>outcome.status==="rejected")');
    expect(source).toContain('settlementNoticeResults.some(outcome=>outcome.status==="rejected")');
  });

  it("scopes idempotency to the recipient and validates duplicate payloads before acknowledging delivery", () => {
    const start = dbSource.indexOf("export async function createNotification(");
    const end = dbSource.indexOf("export async function broadcastCustomerNotification(", start);
    const create = dbSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(create).toContain("buildNotificationEventKey(userId,options.eventKey)");
    expect(create).toContain("assertNotificationPayloadMatches(existing,{userId,title:safeTitle,body:safeBody,category:options.category||\"account\",priority:options.priority||\"normal\",href})");
    expect(create.indexOf("assertNotificationPayloadMatches")).toBeLessThan(create.indexOf("enqueueSystemNotificationEmail"));
    expect(create).toContain("`notification:${notificationId}`");
  });

  it("keeps security, signup-credit, wallet-adjustment, and support notification sources mapped to stable event identities", () => {
    expect(source).toContain("security-session-revoked:${input.id}:${sessionCursor}");
    expect(source).toContain('category: "security"');
    expect(dbSource).toContain("eventKey:`signup-credit:${userId}`");
    expect(dbSource).toContain("eventKey:`wallet-adjustment:${result.ledgerReference}`");
    expect(dbSource).toContain("support-ticket-created-customer:${ticketId}");
    expect(dbSource).toContain("support-ticket:${ticketId}:message:${committed.messageId}");
  });

  it("keeps trade allocation and settlement notices tied to committed trade identifiers", () => {
    expect(source).toContain("auto-trade-allocation:${trade.tradeId}");
    expect(source).toContain("trade-reward:${settlement.tradeId}");
    expect(source).toContain("buildTradeSettlementNotices({tradeId:result.tradeId");
    expect(source).toContain("await manuallySettleTrade(input.tradeId,ctx.user.id,input)");
    expect(notificationEventsSource).toContain("trade-settlement:${input.tradeId}:principal");
    expect(notificationEventsSource).toContain("trade-settlement:${input.tradeId}:reward");
  });

  it("keeps mining reward, conversion, and swap notices anchored to persisted event or receipt IDs", () => {
    expect(miningSource).toContain("mining-reward:${notice.rewardEventId}");
    expect(miningSource).toContain("mining-conversion:${conversion.receiptReference}");
    expect(miningSource).toContain("mining-swap:${result.receiptReference}");
    expect(miningSource).toContain('The main-wallet conversion and mining journal have committed');
    expect(miningSource).toContain('await conn.commit();');
  });

});
