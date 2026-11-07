import { describe, expect, it } from "vitest";
import {
  calculateTierDeliveryCaps,
  countActiveVisiblePopupEvents,
  calculateTradingDeliveryCapacity,
  countConsumedDeliveryOffers,
  resolveTradingQuotaWindow,
  resolveTradingDeliverySchedule,
  resolveTradingBurstLimit,
} from "./trading-delivery-quota";

describe("Trading quota windows", () => {
  const now = new Date("2026-10-31T12:30:00.000Z");

  it("uses an actual trailing 24-hour window for rolling_24h", () => {
    const window = resolveTradingQuotaWindow(now, "rolling_24h");
    expect(window.start.toISOString()).toBe("2026-10-30T12:30:00.000Z");
    expect(window.end.toISOString()).toBe(now.toISOString());
  });

  it("uses UTC midnight boundaries for calendar_day", () => {
    const window = resolveTradingQuotaWindow(now, "calendar_day");
    expect(window.start.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("Tier delivery caps", () => {
  it("keeps daily target and visible-offer limits independent from cumulative tier entitlement", () => {
    expect(calculateTierDeliveryCaps([
      { quota: 6, policyMaxPopupsPerDay: 10, packageMaxPopupsPerDay: 0, dailyPopupTarget: 0, maxVisibleOffers: 2 },
      { quota: 6, policyMaxPopupsPerDay: 4, packageMaxPopupsPerDay: 0, dailyPopupTarget: 3, maxVisibleOffers: 5 },
    ])).toEqual({ combinedQuota: 12, maxPopupsPerDay: 9, maxVisibleOffers: 7 });
  });

  it("uses full tier allowance when a daily target or configured cap is zero", () => {
    expect(calculateTierDeliveryCaps([
      { quota: 8, policyMaxPopupsPerDay: 0, packageMaxPopupsPerDay: 0, dailyPopupTarget: 0, maxVisibleOffers: 0 },
    ])).toEqual({ combinedQuota: 8, maxPopupsPerDay: 8, maxVisibleOffers: 8 });
  });
});

describe("Trading daily delivery consumption", () => {
  it("counts each delivered opportunity once across retries and excludes failed delivery attempts", () => {
    expect(countConsumedDeliveryOffers([
      { offerId: 10, status: "pending" },
      { offerId: 10, status: "delivered" },
      { offerId: 10, status: "expired" },
      { offerId: 11, status: "failed" },
      { offerId: 12, status: "delivered" },
    ])).toBe(2);
  });

  it("does not let the simultaneous visible-offer limit reduce the daily entitlement", () => {
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 12,
      deliveredOfferCount: 3,
      maxVisibleOffers: 10,
      activeVisibleCount: 2,
    })).toEqual({ dailyRemaining: 9, visibleRemaining: 8, remainingQuota: 8 });
  });

  it("stops new delivery when either the daily quota or visible-offer capacity is exhausted", () => {
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 6,
      deliveredOfferCount: 6,
      maxVisibleOffers: 10,
      activeVisibleCount: 1,
    }).remainingQuota).toBe(0);
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 20,
      deliveredOfferCount: 4,
      maxVisibleOffers: 3,
      activeVisibleCount: 3,
    }).remainingQuota).toBe(0);
  });

  it("frees visible capacity when three retained customer offers are closed or expired", () => {
    const now = new Date("2026-11-07T05:00:00.000Z");
    const retainedExpiredOffers = ["DELIVERED", "NOTICED", "OPENED"].map((eventStatus, index) => ({
      eventStatus,
      deliveryStatus: ["rendered", "received", "delivered"][index],
      offerStatus: index === 1 ? "open" : "closed",
      opensAt: new Date(now.getTime() - 60_000),
      closesAt: new Date(now.getTime() - 1_000),
      expiredAt: null,
    }));

    const activeVisibleCount = countActiveVisiblePopupEvents(retainedExpiredOffers, now);
    expect(activeVisibleCount).toBe(0);
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 6,
      deliveredOfferCount: 3,
      maxVisibleOffers: 3,
      activeVisibleCount,
    })).toEqual({ dailyRemaining: 3, visibleRemaining: 3, remainingQuota: 3 });
  });

  it("continues to count only currently open, started, unexpired offers as visible", () => {
    const now = new Date("2026-11-07T05:00:00.000Z");
    const openVisibleOffers = ["DELIVERED", "NOTICED", "OPENED"].map((eventStatus, index) => ({
      eventStatus,
      deliveryStatus: ["rendered", "received", "delivered"][index],
      offerStatus: "open",
      opensAt: new Date(now.getTime() - 60_000),
      closesAt: new Date(now.getTime() + 60_000),
      expiredAt: null,
    }));

    const activeVisibleCount = countActiveVisiblePopupEvents(openVisibleOffers, now);
    expect(activeVisibleCount).toBe(3);
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 6,
      deliveredOfferCount: 3,
      maxVisibleOffers: 3,
      activeVisibleCount,
    }).remainingQuota).toBe(0);
  });

  it("clamps negative counts to zero", () => {
    expect(calculateTradingDeliveryCapacity({
      dailyCap: 4,
      deliveredOfferCount: -3,
      maxVisibleOffers: 5,
      activeVisibleCount: -2,
    })).toEqual({ dailyRemaining: 4, visibleRemaining: 5, remainingQuota: 4 });
  });
});


describe("Durable Trading delivery cadence", () => {
  const deliveredAt = new Date("2026-10-31T10:00:00.000Z");
  const base = {
    lastDeliveredAt: deliveredAt,
    deliveryEventId: 421,
    userId: 27,
    policyVersion: 8,
    minIntervalSeconds: 300,
    maxIntervalSeconds: 1800,
    randomizationEnabled: true,
  };

  it("reproduces the same randomized deadline from the persisted delivery identity", () => {
    const first = resolveTradingDeliverySchedule(base);
    const afterRestart = resolveTradingDeliverySchedule({ ...base });
    expect(first).toEqual(afterRestart);
    expect(first.intervalSeconds).toBeGreaterThanOrEqual(300);
    expect(first.intervalSeconds).toBeLessThanOrEqual(1800);
    expect(first.readyAt?.getTime()).toBe(deliveredAt.getTime() + first.intervalSeconds * 1000);
  });

  it("uses the configured minimum as a fixed interval when randomization is disabled", () => {
    const result = resolveTradingDeliverySchedule({ ...base, randomizationEnabled: false });
    expect(result.intervalSeconds).toBe(300);
    expect(result.readyAt?.toISOString()).toBe("2026-10-31T10:05:00.000Z");
  });

  it("does not schedule an initial delivery when no prior durable event exists", () => {
    expect(resolveTradingDeliverySchedule({ ...base, lastDeliveredAt: null })).toEqual({
      intervalSeconds: 0,
      readyAt: null,
    });
  });

  it("rejects malformed interval bounds and event identities", () => {
    expect(() => resolveTradingDeliverySchedule({ ...base, maxIntervalSeconds: 299 })).toThrow(RangeError);
    expect(() => resolveTradingDeliverySchedule({ ...base, deliveryEventId: 0 })).toThrow(RangeError);
  });

  it("keeps Package A, B, and C schedules independent and uses each saved bound", () => {
    const savedPackages = [
      { name: "Package A", min: 120, max: 240, eventId: 101, deliveredAt: new Date("2026-10-31T10:00:00.000Z") },
      { name: "Package B", min: 300, max: 420, eventId: 202, deliveredAt: new Date("2026-10-31T10:01:00.000Z") },
      { name: "Package C", min: 480, max: 600, eventId: 303, deliveredAt: new Date("2026-10-31T10:02:00.000Z") },
    ];
    const resolveSaved = (pkg: typeof savedPackages[number]) => resolveTradingDeliverySchedule({
      lastDeliveredAt: pkg.deliveredAt,
      deliveryEventId: pkg.eventId,
      userId: base.userId,
      policyVersion: base.policyVersion,
      minIntervalSeconds: pkg.min,
      maxIntervalSeconds: pkg.max,
      randomizationEnabled: true,
    });
    const schedules = savedPackages.map((pkg) => ({ name: pkg.name, schedule: resolveSaved(pkg) }));
    expect(schedules.map(({ name }) => name)).toEqual(["Package A", "Package B", "Package C"]);
    expect(schedules[0].schedule.intervalSeconds).toBeGreaterThanOrEqual(120);
    expect(schedules[0].schedule.intervalSeconds).toBeLessThanOrEqual(240);
    expect(schedules[1].schedule.intervalSeconds).toBeGreaterThanOrEqual(300);
    expect(schedules[1].schedule.intervalSeconds).toBeLessThanOrEqual(420);
    expect(schedules[2].schedule.intervalSeconds).toBeGreaterThanOrEqual(480);
    expect(schedules[2].schedule.intervalSeconds).toBeLessThanOrEqual(600);

    const packageB = resolveSaved(savedPackages[1]);
    const packageC = resolveSaved(savedPackages[2]);
    const schedulesAfterPackageAChanges = [
      resolveSaved({ ...savedPackages[0], min: 180, max: 360, deliveredAt: new Date("2026-10-31T11:00:00.000Z"), eventId: 999 }),
      resolveSaved(savedPackages[1]),
      resolveSaved(savedPackages[2]),
    ];
    expect(schedulesAfterPackageAChanges[0].intervalSeconds).toBeGreaterThanOrEqual(180);
    expect(schedulesAfterPackageAChanges[0].intervalSeconds).toBeLessThanOrEqual(360);
    expect(schedulesAfterPackageAChanges[1]).toEqual(packageB);
    expect(schedulesAfterPackageAChanges[2]).toEqual(packageC);
  });
});


describe("Trading burst delivery limits", () => {
  it("delivers one popup per cycle when burst delivery is disabled", () => {
    expect(resolveTradingBurstLimit({ burstEnabled: false, maxBurstSize: 3 })).toBe(1);
  });

  it("honours the configured burst size with a hard safety cap", () => {
    expect(resolveTradingBurstLimit({ burstEnabled: true, maxBurstSize: 3 })).toBe(3);
    expect(resolveTradingBurstLimit({ burstEnabled: true, maxBurstSize: 100 })).toBe(10);
    expect(resolveTradingBurstLimit({ burstEnabled: true, maxBurstSize: 0 })).toBe(1);
  });
});
