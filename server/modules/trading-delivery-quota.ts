export type TradingQuotaWindowPeriod = "rolling_24h" | "calendar_day";

export function resolveTradingQuotaWindow(now: Date, period: TradingQuotaWindowPeriod) {
  const end = new Date(now.getTime());
  if (period === "rolling_24h") {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function countConsumedDeliveryOffers(
  rows: readonly { offerId: number | string; status?: string | null }[],
): number {
  const consumed = new Set<number>();
  for (const row of rows) {
    if (String(row.status || "delivered").toLowerCase() === "failed") continue;
    const offerId = Number(row.offerId);
    if (Number.isSafeInteger(offerId) && offerId > 0) consumed.add(offerId);
  }
  return consumed.size;
}

export function calculateTradingDeliveryCapacity(input: {
  dailyCap: number;
  deliveredOfferCount: number;
  maxVisibleOffers: number;
  activeVisibleCount: number;
}) {
  const dailyRemaining = Math.max(0, Math.trunc(input.dailyCap) - Math.max(0, Math.trunc(input.deliveredOfferCount)));
  const visibleRemaining = Math.max(0, Math.trunc(input.maxVisibleOffers) - Math.max(0, Math.trunc(input.activeVisibleCount)));
  return {
    dailyRemaining,
    visibleRemaining,
    remainingQuota: Math.min(dailyRemaining, visibleRemaining),
  };
}
