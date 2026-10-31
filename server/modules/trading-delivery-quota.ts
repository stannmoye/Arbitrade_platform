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

export function calculateTierDeliveryCaps(tiers: readonly {
  quota: number;
  policyMaxPopupsPerDay?: number | null;
  packageMaxPopupsPerDay?: number | null;
  dailyPopupTarget?: number | null;
  maxVisibleOffers?: number | null;
}[]) {
  const normalized = tiers.map((tier) => {
    const quota = Math.max(0, Math.trunc(Number(tier.quota) || 0));
    const policyCap = Math.max(0, Math.trunc(Number(tier.policyMaxPopupsPerDay) || 0));
    const packageCap = Math.max(0, Math.trunc(Number(tier.packageMaxPopupsPerDay) || 0));
    const dailyTarget = Math.max(0, Math.trunc(Number(tier.dailyPopupTarget) || 0));
    const visibleCap = Math.max(0, Math.trunc(Number(tier.maxVisibleOffers) || 0));
    const policyDailyCap = policyCap > 0 ? policyCap : quota;
    const tierDailyCap = packageCap > 0 ? Math.min(policyDailyCap, packageCap) : policyDailyCap;
    return {
      quota,
      dailyCap: tierDailyCap,
      dailyTargetCap: dailyTarget > 0 ? Math.min(dailyTarget, quota) : quota,
      visibleCap: visibleCap > 0 ? visibleCap : quota,
    };
  });
  const combinedQuota = normalized.reduce((sum, tier) => sum + tier.quota, 0);
  const adminDailyCap = normalized.reduce((sum, tier) => sum + tier.dailyCap, 0);
  const targetDailyCap = normalized.reduce((sum, tier) => sum + tier.dailyTargetCap, 0);
  const maxVisibleOffers = normalized.reduce((sum, tier) => sum + tier.visibleCap, 0);
  return {
    combinedQuota,
    maxPopupsPerDay: Math.min(combinedQuota, adminDailyCap || combinedQuota, targetDailyCap || combinedQuota),
    maxVisibleOffers: maxVisibleOffers || combinedQuota,
  };
}
