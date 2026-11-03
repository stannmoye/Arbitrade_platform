export type NamedPolicyRow = { packageName: string };

/**
 * Fields owned by the per-tier policy editor. Global masters and lifecycle
 * switches intentionally do not belong in this payload.
 */
export const TRADING_TIER_POLICY_PATCH_KEYS = [
  "maxPopupsPerDay", "maxVisibleOffers", "minimumTradeUnits", "maximumTradeUnits",
  "minHourlyTarget", "normalHourlyTarget", "marketInfluenceBps", "maxBurstSize",
  "dailyPopupTarget", "schedulingPeriod", "minIntervalSeconds", "maxIntervalSeconds",
  "popupDisplayTargetSeconds", "completionDisplaySeconds", "postCompletionIntervalSeconds",
  "maxPendingDeliveries", "maxTradeAttemptsPerDay",
  "tradeRetryDelaySeconds", "maxSuccessfulTradesPerDay", "maxConcurrentActiveTrades",
  "minSettlementDelaySeconds", "maxSettlementDelaySeconds", "minimumRewardBps",
  "maxDailyRewardMinor", "maxRewardPerTradeMinor", "badgeLabel", "badgeStyle",
  "minimumPayoutRateBps", "maximumPayoutRateBps", "minimumTradeDurationSeconds",
  "maximumTradeDurationSeconds", "companyRotationCountryNames", "companyRotationRepeatPolicy",
  "closePolicy",
] as const;

/**
 * Build field-scoped policy updates from the last server snapshot.
 *
 * Only fields the administrator actually changed are sent. The database then
 * merges those fields against its row-locked current value, so another admin's
 * unrelated update is not overwritten by a stale browser snapshot.
 */
export function buildChangedPolicyPatches<T extends NamedPolicyRow>(
  baseline: readonly T[],
  current: readonly T[],
  allowedKeys: readonly string[] = [],
): Array<Partial<T> & Pick<T, "packageName">> {
  const baselineByName = new Map(baseline.map((row) => [row.packageName, row]));
  return current.flatMap((row) => {
    const previous = baselineByName.get(row.packageName);
    if (!previous) {
      throw new Error(`Cannot patch Trading policy "${row.packageName}" without a loaded baseline`);
    }
    const before = previous as unknown as Record<string, unknown>;
    const after = row as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = { packageName: row.packageName };
    for (const key of Object.keys(after)) {
      if (key === "packageName") continue;
      if (allowedKeys.length > 0 && !allowedKeys.includes(key)) {
        if (!Object.is(before[key], after[key])) {
          throw new Error(`Field "${key}" is not owned by the per-tier Trading policy editor`);
        }
        continue;
      }
      if (!Object.is(before[key], after[key])) patch[key] = after[key];
    }
    return Object.keys(patch).length > 1
      ? [patch as Partial<T> & Pick<T, "packageName">]
      : [];
  });
}
