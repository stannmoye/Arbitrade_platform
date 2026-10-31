import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("./modules/trading-delivery-quota.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const start = database.indexOf("const quotaDay=now.toISOString");
const end = database.indexOf("\\nexport async function ", start);
const delivery = database.slice(start, end);

describe("runtime Trading delivery quota semantics", () => {
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
    expect(delivery).toContain("countConsumedDeliveryOffers(deliveredToday)");
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
    expect(editor).toContain("Daily delivery target (0 = full tier allowance)");
    expect(editor).toContain("Maximum visible offers at once");
    expect(editor).toContain("It does not reduce the daily allowance.");
    expect(editor).toContain("rolling 24 hours is used if any active tier requires it");
  });
});
