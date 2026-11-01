import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("./modules/trading-delivery-quota.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const start = database.indexOf("export async function listCustomerOpportunities(");
const end = database.indexOf("\nexport async function ", start + 1);
const delivery = database.slice(start, end);

describe("runtime Trading delivery quota semantics", () => {
  it("exposes the enabled delivery gate only after active tier and saved policy checks pass", () => {
    expect(delivery).toContain("if(!eligibleSubscriptions.length) return emptyResult");
    expect(delivery).toContain("if(combinedQuota<=0) return emptyResult");
    expect(delivery).toContain("delivery:{enabled:true,packageName,maxPopupsPerDay:dailyCap");
    expect(app).toContain("delivery?.enabled&&policy");
  });


  it("persists popup rows before consuming daily quota and repairs interrupted writes", () => {
    const popupPersistence = delivery.indexOf("const lifecycleIds=await ensurePopupDeliveries");
    const quotaLedgerWrite = delivery.indexOf("await db.insert(opportunityDeliveryEvents).values(newlyEligible");
    expect(popupPersistence).toBeGreaterThanOrEqual(0);
    expect(quotaLedgerWrite).toBeGreaterThan(popupPersistence);
    expect(delivery).toContain("Popup persistence did not return delivery IDs for every eligible opportunity");
    expect(delivery).toContain("popupRowsMissingLedger");
    expect(delivery).toContain("POPUP_EVENT_MISSING");
  });

  it("uses the configured true rolling-24-hour or UTC calendar-day window for delivery and allocation counts", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(delivery).toContain("resolveTradingQuotaWindow(now,effectiveSchedulingPeriod)");
    expect(delivery).toContain("gte(opportunityDeliveryEvents.deliveredAt,quotaWindow.start)");
    expect(delivery).toContain("lt(opportunityDeliveryEvents.deliveredAt,quotaWindow.end)");
    expect(delivery).toContain("confirmedAt>=${quotaWindow.start} AND confirmedAt<${quotaWindow.end}");
    expect(helper).toContain("now.getTime() - 24 * 60 * 60 * 1000");
    expect(helper).toContain("Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())");
  });

  it("consumes each distinct opportunity once and does not charge failed delivery attempts", () => {
    expect(delivery).toContain("countConsumedDeliveryOffers(effectiveDeliveredToday)");
    expect(delivery).toContain("quotaDay:opportunityDeliveryEvents.quotaDay");
    expect(delivery).toContain("ledgerKeys=new Set(effectiveDeliveredToday.map(row=>String(row.offerId)+\":\"+String((row as any).quotaDay??\"\")))");
    expect(delivery).toContain('notInArray(opportunityDeliveryEvents.status,["failed"])');
    expect(helper).toContain('String(row.status || "delivered").toLowerCase() === "failed"');
    expect(helper).toContain("consumed.add(offerId)");
  });

  it("keeps the daily quota independent from the simultaneous visible-offer limit", () => {
    expect(delivery).toContain("const dailyCap=maxPopupsPerDay");
    expect(delivery).toContain("calculateTradingDeliveryCapacity({dailyCap,deliveredOfferCount,maxVisibleOffers,activeVisibleCount})");
    expect(delivery).not.toContain("Math.min(maxPopupsPerDay,maxVisibleOffers)");
    expect(delivery).toContain('["DELIVERED","NOTICED","OPENED"].includes(eventStatus)');
    expect(delivery).toContain('["pending","delivered","received","rendered"].includes(deliveryStatus)');
  });

  it("combines each tier's target and visible cap without replacing cumulative entitlement", () => {
    expect(delivery).toContain("calculateTierDeliveryCaps(tierDeliveryCaps)");
    expect(helper).toContain("dailyTargetCap: dailyTarget > 0 ? Math.min(dailyTarget, quota) : quota");
    expect(helper).toContain("visibleCap: visibleCap > 0 ? visibleCap : quota");
    expect(editor).toContain("Optional daily target cap (0 = no extra cap)");
    expect(editor).toContain("Maximum visible offers at once");
    expect(editor).toContain("This is not a daily quota.");
    expect(editor).toContain('<option value="rolling_24h">Rolling 24 hours</option>');
    expect(editor).toContain('<option value="calendar_day">Calendar day (UTC)</option>');
  });
});


describe("server-owned delivery cadence and completion timing", () => {
  it("anchors randomized delivery intervals to the last persisted delivery event", () => {
    expect(delivery).toContain("resolveTradingDeliverySchedule({");
    expect(delivery).toContain("deliveryEventId:Number(lastDelivery?.id||0)");
    expect(delivery).toContain("policyVersion:Number(lastDelivery?.policyVersion||0)");
    expect(delivery).toContain("randomizationEnabled:Boolean(policy?.randomizationEnabled)");
    expect(delivery).toContain("orderBy(desc(opportunityDeliveryEvents.deliveredAt))");
  });

  it("anchors post-completion delay to a settled trade completion, not popup delivery", () => {
    expect(delivery).toContain("eq(tradePositions.status,\"settled\")");
    expect(delivery).toContain("isNotNull(tradePositions.completionAt)");
    expect(delivery).toContain("postCompletionReadyAt");
    expect(delivery).toContain("Math.max(...readyDeadlines.map(value=>value.getTime()))");
    expect(delivery).not.toContain("lastDelivery.deliveredAt).getTime()+Number(policy?.postCompletionIntervalSeconds");
  });
});
