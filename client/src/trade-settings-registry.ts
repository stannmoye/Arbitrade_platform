export type TradeSettingScope = "global" | "package" | "record";
export type TradeSettingRisk = "low" | "medium" | "high";

export type TradeSettingDefinition = {
  key: string;
  scope: TradeSettingScope;
  ownerRoute: string;
  ownerSection: string;
  label: string;
  explanation: string;
  units: string;
  validation: string;
  saveMutation: string;
  readQuery: string;
  auditPolicy: "reason-and-version" | "reason-and-idempotency" | "read-only";
  effectiveTime: "future-assignments" | "future-deliveries" | "future-records" | "snapshot-at-creation" | "read-only";
  runtimeConsumer: string;
  customerImpact: string;
  risk: TradeSettingRisk;
  editable: boolean;
};

/**
 * Canonical ownership map for Trade Settings.
 *
 * Every editable setting has exactly one owner route and one authoritative
 * mutation/read pair. Read-only screens may summarize these values, but they
 * must not add another editor or mutation.
 */
export const tradeSettingRegistry = [
  {
    key: "trade.policy.tierEnabled",
    scope: "global",
    ownerRoute: "tradeSystemHealth",
    ownerSection: "safety",
    label: "Tier policy gate",
    explanation: "Controls whether eligible tier delivery is allowed globally.",
    units: "on/off",
    validation: "boolean",
    saveMutation: "adminOperations.updateTradingGlobalControls",
    readQuery: "adminOperations.tradingGlobalControls",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-deliveries",
    runtimeConsumer: "opportunityEligibility",
    customerImpact: "Eligible customers can receive future informational opportunities.",
    risk: "high",
    editable: true,
  },
  {
    key: "trade.delivery.popupEnabled",
    scope: "global",
    ownerRoute: "tradeSystemHealth",
    ownerSection: "safety",
    label: "Pop-up delivery gate",
    explanation: "Controls whether durable informational pop-ups may be delivered.",
    units: "on/off",
    validation: "boolean",
    saveMutation: "adminOperations.updateTradingGlobalControls",
    readQuery: "adminOperations.tradingGlobalControls",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-deliveries",
    runtimeConsumer: "opportunityWorker",
    customerImpact: "Future eligible pop-ups can be delivered when enabled.",
    risk: "high",
    editable: true,
  },
  {
    key: "trade.timing.settlementReviewDelaySeconds",
    scope: "global",
    ownerRoute: "tradeDurationRules",
    ownerSection: "timing",
    label: "Settlement review delay",
    explanation: "Waits after a recorded trade completion before review is due.",
    units: "seconds (1–604800)",
    validation: "integer 1..604800",
    saveMutation: "settings.updateSettings.trade",
    readQuery: "settings.getTradePolicy",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-records",
    runtimeConsumer: "tradeSettlement",
    customerImpact: "New trade records receive this review timing; existing snapshots do not change.",
    risk: "high",
    editable: true,
  },
  {
    key: "trade.timing.walletCreditDelaySeconds",
    scope: "global",
    ownerRoute: "tradeDurationRules",
    ownerSection: "timing",
    label: "Wallet credit delay",
    explanation: "Adds a delay after review is due before an approved credit may post.",
    units: "seconds (0–604800)",
    validation: "integer 0..604800",
    saveMutation: "settings.updateSettings.trade",
    readQuery: "settings.getTradePolicy",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-records",
    runtimeConsumer: "tradeCreditPosting",
    customerImpact: "New trade records receive this credit timing; it does not prove a credit occurred.",
    risk: "high",
    editable: true,
  },
  {
    key: "trade.package.minimumQualifyingBalanceUsdMinor",
    scope: "package",
    ownerRoute: "packages",
    ownerSection: "eligibility",
    label: "Qualifying threshold",
    explanation: "USD-equivalent qualifying credit required for automatic tier assignment.",
    units: "USD minor units",
    validation: "non-negative integer",
    saveMutation: "adminOperations.updateTradingPackage",
    readQuery: "adminOperations.tradingPackages",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-assignments",
    runtimeConsumer: "tradingTierActivation",
    customerImpact: "Determines which future qualifying credits can assign this tier.",
    risk: "medium",
    editable: true,
  },
  {
    key: "trade.package.opportunitiesPerDay",
    scope: "package",
    ownerRoute: "packages",
    ownerSection: "eligibility",
    label: "Daily entitlement",
    explanation: "The tier’s daily informational opportunity allowance for future assignments.",
    units: "opportunities per UTC day (1–10000)",
    validation: "integer 1..10000",
    saveMutation: "adminOperations.updateTradingPackage",
    readQuery: "adminOperations.tradingPackages",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-assignments",
    runtimeConsumer: "tradingDeliveryQuota",
    customerImpact: "Sets the saved quota snapshot for customers assigned this tier in the future.",
    risk: "medium",
    editable: true,
  },
  {
    key: "trade.package.deliveryPolicy",
    scope: "package",
    ownerRoute: "packages",
    ownerSection: "policy",
    label: "Per-tier offer rules and capital limits",
    explanation: "Bounds the eligible offer amount, duration, returns, retries and delivery capacity.",
    units: "policy-specific units; money in minor units; rates in basis points",
    validation: "authoritative package policy schema",
    saveMutation: "adminOperations.updateOpportunityPackagePolicies",
    readQuery: "adminOperations.opportunityPackagePolicies",
    auditPolicy: "reason-and-version",
    effectiveTime: "future-deliveries",
    runtimeConsumer: "opportunityEligibility",
    customerImpact: "Filters and bounds future informational opportunities for this package.",
    risk: "high",
    editable: true,
  },
  {
    key: "trade.package.carryForward",
    scope: "global",
    ownerRoute: "tradeRetryPolicy",
    ownerSection: "retry",
    label: "Carry-forward availability",
    explanation: "Reports whether a bounded carry-forward state machine is implemented.",
    units: "read-only status",
    validation: "not available in current source",
    saveMutation: "none",
    readQuery: "tradeRetryPolicy.status",
    auditPolicy: "read-only",
    effectiveTime: "read-only",
    runtimeConsumer: "opportunityWorker",
    customerImpact: "No carry-forward entitlement is promised by the current implementation.",
    risk: "low",
    editable: false,
  },
] satisfies readonly TradeSettingDefinition[];

export function getTradeSettingDefinition(key: string) {
  return tradeSettingRegistry.find((setting) => setting.key === key);
}

export function assertTradeSettingRegistry(registry: readonly TradeSettingDefinition[] = tradeSettingRegistry) {
  const keys = new Set<string>();
  const editableOwners = new Map<string, string>();
  for (const setting of registry) {
    if (keys.has(setting.key)) throw new Error(`Duplicate Trade Setting key: ${setting.key}`);
    keys.add(setting.key);
    if (!setting.ownerRoute) throw new Error(`Missing owner route for Trade Setting: ${setting.key}`);
    if (setting.editable) {
      const previousOwner = editableOwners.get(setting.key);
      if (previousOwner && previousOwner !== setting.ownerRoute) {
        throw new Error(`Trade Setting has multiple owner routes: ${setting.key}`);
      }
      editableOwners.set(setting.key, setting.ownerRoute);
      if (setting.saveMutation === "none" || setting.readQuery === "none") {
        throw new Error(`Editable Trade Setting must have persistence paths: ${setting.key}`);
      }
    }
  }
  return true;
}

assertTradeSettingRegistry();
