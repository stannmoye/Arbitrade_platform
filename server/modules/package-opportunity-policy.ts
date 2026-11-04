import type { opportunityPackagePolicies } from "../../drizzle/schema";

export type OpportunityPackagePolicyRow = typeof opportunityPackagePolicies.$inferSelect;

/**
 * The package policy editor may patch only these package-owned fields.
 * Global delivery masters and immutable/version metadata are deliberately absent.
 */
export const PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS = [
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
] as const satisfies readonly (keyof OpportunityPackagePolicyRow)[];

export type PackageOpportunityPolicyPatch = Pick<OpportunityPackagePolicyRow, "packageName"> &
  Partial<Pick<OpportunityPackagePolicyRow, (typeof PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS)[number]>>;

/**
 * Defaults for a newly created package's policy row.
 *
 * Delivery masters intentionally remain OFF compatibility placeholders:
 * global delivery/eligibility controls are owned by Package Configuration.
 * The package can be enabled independently, but delivery still requires valid
 * package terms and the global masters. Financial execution is always OFF.
 */
export const DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY = {
  badgeLabel: null,
  badgeStyle: "neutral",
  minimumPayoutRateBps: 200,
  maximumPayoutRateBps: 300,
  minimumTradeDurationSeconds: 300,
  maximumTradeDurationSeconds: 900,
  companyRotationEnabled: false,
  companyRotationCountryNames: null,
  companyRotationRepeatPolicy: "avoid_until_exhausted",
  maxPopupsPerDay: 10,
  maxVisibleOffers: 3,
  minimumTradeUnits: 1000,
  maximumTradeUnits: 100000,
  minHourlyTarget: 0,
  normalHourlyTarget: 0,
  marketInfluenceBps: 0,
  burstEnabled: false,
  maxBurstSize: 3,
  enabled: false,
  automaticDelivery: false,
  dailyPopupTarget: 0,
  schedulingPeriod: "rolling_24h",
  minIntervalSeconds: 45,
  maxIntervalSeconds: 3600,
  randomizationEnabled: false,
  popupDisplayTargetSeconds: 120,
  completionDisplaySeconds: 8,
  postCompletionIntervalSeconds: 30,
  maxPendingDeliveries: 3,
  deliveryRetryPolicy: "temporary",
  maxDeliveryAttempts: 3,
  expiryHandling: "expire",
  duplicatePrevention: true,
  audioEnabled: true,
  audioSound: "soft-chime",
  automaticTradingEnabled: false,
  maxTradeAttemptsPerDay: 0,
  tradeRetryDelaySeconds: 30,
  maxSuccessfulTradesPerDay: 0,
  maxConcurrentActiveTrades: 1,
  requirePreviousSettlement: true,
  minSettlementDelaySeconds: 900,
  maxSettlementDelaySeconds: 900,
  minimumRewardBps: 0,
  allowedOpportunityTypes: null,
  maxDailyRewardMinor: 0,
  rewardLimitCurrency: "USD",
  dailyRewardWindow: "calendar_day",
  maxRewardPerTradeMinor: 0,
  unsettledRewardPolicy: "reserve",
  capReachedPolicy: "stop_new_trades",
  settlementConfirmationState: "ledger_and_wallet",
  settlementRetryPolicy: "manual",
  maxSettlementAttempts: 3,
  closePolicy: "after_completion",
  policyVersion: 1,
} as const satisfies Omit<OpportunityPackagePolicyRow, "id" | "packageName" | "updatedBy" | "updatedAt">;

/**
 * Merge one package's persisted policy with its own partial edit. A row for a
 * different package is rejected rather than being silently reused.
 */
export function resolveEffectivePackageOpportunityPolicy(
  packageName: string,
  current: OpportunityPackagePolicyRow | null | undefined,
  supplied: Partial<OpportunityPackagePolicyRow>,
  updatedBy: number,
) {
  if (!packageName.trim()) throw new Error("Package name is required");
  if (current && current.packageName !== packageName) {
    throw new Error("Saved opportunity policy belongs to a different package");
  }
  if (supplied.packageName !== undefined && supplied.packageName !== packageName) {
    throw new Error("Opportunity policy update targets a different package");
  }
  return {
    ...DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY,
    ...(current ?? {}),
    ...supplied,
    packageName,
    updatedBy,
    // Informational opportunity delivery never enables unattended execution.
    automaticTradingEnabled: false,
  };
}
