export type TradeSettingScope = "global" | "package" | "record";
export type TradeSettingRisk = "low" | "operational" | "financial" | "safety";

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
  auditPolicy: string;
  effectiveTime: string;
  runtimeConsumer: string;
  customerEffect: string;
  risk: TradeSettingRisk;
};

/**
 * The authoritative ownership map for Trade Settings.
 *
 * A definition describes where an editor will live and which persisted/runtime
 * contract it must use. This registry is intentionally declarative: it does
 * not save settings and cannot become a second persistence path.
 */
export const tradeSettingsRegistry = [
  {
    key: "trade.global.tierPolicyMaster",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Tier policy master",
    explanation: "Blocks new tier entitlements and future use of tiers when OFF; existing entitlement records are preserved.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future tier assignment, delivery and allocation decisions",
    runtimeConsumer: "tier qualification worker and customer opportunity allocation gates",
    customerEffect: "prevents new tier assignment and future allocation without deleting existing entitlements",
    risk: "safety",
  },
  {
    key: "trade.global.popupDelivery",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Pop-up delivery",
    explanation: "Controls whether new informational opportunities may be delivered globally.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future pop-up deliveries; existing cards remain intact",
    runtimeConsumer: "listCustomerOpportunities new popup-delivery gate",
    customerEffect: "pauses new cards without hiding already-delivered cards",
    risk: "safety",
  },
  {
    key: "trade.global.companyRotation",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Company rotation",
    explanation: "Allows an approved catalogue identity to be attached to a future informational opportunity.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future company selection and display; existing trade snapshots stay unchanged",
    runtimeConsumer: "popup delivery identity selection and customer company-display guard",
    customerEffect: "omits company identity while OFF; never changes opportunity economics",
    risk: "operational",
  },
  {
    key: "trade.global.randomizedTiming",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Randomized timing",
    explanation: "Allows timing variation only within the saved package bounds.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future delivery scheduling decisions",
    runtimeConsumer: "listCustomerOpportunities delivery scheduler",
    customerEffect: "uses fixed minimum spacing while OFF; never exceeds saved maximum",
    risk: "operational",
  },
  {
    key: "trade.global.burstDelivery",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Burst delivery",
    explanation: "Allows only package-bounded batches when the global master is ON.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future delivery cycles",
    runtimeConsumer: "listCustomerOpportunities bounded burst resolver",
    customerEffect: "limits a delivery cycle to the non-burst path while OFF",
    risk: "operational",
  },
  {
    key: "trade.global.requirePreviousSettlement",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Require previous settlement",
    explanation: "Prevents an individual customer receiving another allocation while their own earlier non-cancelled trade remains unsettled.",
    units: "ON/OFF",
    validation: "ON by default; OFF requires authorized role, detailed reason and audit event",
    saveMutation: "adminOperations.updateTradeGlobalSettings",
    readQuery: "adminOperations.tradeGlobalSettings",
    auditPolicy: "safety downgrade requires old/new values and version",
    effectiveTime: "future allocations for that customer only",
    runtimeConsumer: "customer trade-allocation eligibility check",
    customerEffect: "blocks the customer's next allocation until prior settlement completes",
    risk: "safety",
  },
  {
    key: "trade.global.blockUntilSettled",
    scope: "global",
    ownerRoute: "trade-settings-global-trade-timing",
    ownerSection: "system-wide-settlement-pause",
    label: "Block new opportunities while any trade is unsettled",
    explanation: "Pauses system-wide offer publication and automatic allocation while an outstanding trade exists; separate from the per-customer allocation master.",
    units: "ON/OFF",
    validation: "authorized admin; future pause decisions only",
    saveMutation: "adminOperations.updateSettings.trade",
    readQuery: "adminOperations.settings",
    auditPolicy: "actor, previous value, next value, timestamp",
    effectiveTime: "future offer-publication and automatic-allocation decisions",
    runtimeConsumer: "ensureMarketDrivenOpportunities and automatic-trade cycle",
    customerEffect: "pauses new system-wide opportunities while any trade remains unsettled",
    risk: "safety",
  },
  {
    key: "trade.global.retryPolicy",
    scope: "global",
    ownerRoute: "trade-settings-retry-carry-forward",
    ownerSection: "retry-and-carry-forward",
    label: "Retry policy",
    explanation: "Sets bounded retry and recovery behavior without duplicating allocations or settlements.",
    units: "attempts, seconds",
    validation: "bounded non-negative integers; cross-field window validation",
    saveMutation: "adminTradingGlobalSettings.update",
    readQuery: "adminTradingGlobalSettings.get",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future retry decisions; persisted work keeps its snapshot",
    runtimeConsumer: "trading opportunity worker and recovery queue",
    customerEffect: "eligible failed/pending delivery can be retried safely",
    risk: "operational",
  },
  {
    key: "trade.package.feePolicy",
    scope: "package",
    ownerRoute: "trade-settings-package-settings",
    ownerSection: "fee-and-return",
    label: "Platform fee bounds",
    explanation: "Selects one fee rate for an opportunity from the package's saved inclusive bounds.",
    units: "integer basis points",
    validation: "0 <= minimum <= selected <= maximum; minor-unit ceiling at settlement",
    saveMutation: "adminTradingPackage.update",
    readQuery: "adminTradingPackage.get",
    auditPolicy: "actor, reason, previous value, next value, terms version",
    effectiveTime: "future opportunities; existing opportunities keep their fee snapshot",
    runtimeConsumer: "opportunity creation and settlement workers",
    customerEffect: "determines the auditable fee on realized positive gross profit only",
    risk: "financial",
  },
  {
    key: "trade.package.earningsCeiling",
    scope: "package",
    ownerRoute: "trade-settings-package-settings",
    ownerSection: "fee-and-return",
    label: "Daily earnings ceiling",
    explanation: "Caps the combined daily earnings governed by the package policy.",
    units: "currency minor units per UTC day",
    validation: "non-negative integer; zero means no additional cap",
    saveMutation: "adminTradingPackage.update",
    readQuery: "adminTradingPackage.get",
    auditPolicy: "actor, reason, previous value, next value, terms version",
    effectiveTime: "future allocation and settlement checks",
    runtimeConsumer: "allocation and settlement eligibility checks",
    customerEffect: "may limit future eligible opportunities without rewriting existing snapshots",
    risk: "financial",
  },
  {
    key: "trade.package.dailyDeliveryCap",
    scope: "package",
    ownerRoute: "trade-settings-daily-delivery-caps",
    ownerSection: "daily-delivery-caps",
    label: "Daily delivery cap",
    explanation: "Limits operational pop-up delivery and cannot increase the package entitlement.",
    units: "pop-ups per UTC day",
    validation: "non-negative integer; must not exceed supported system bounds",
    saveMutation: "adminTradingPackage.update",
    readQuery: "adminTradingPackage.get",
    auditPolicy: "actor, reason, previous value, next value, terms version",
    effectiveTime: "future delivery decisions",
    runtimeConsumer: "delivery quota worker",
    customerEffect: "may reduce future informational pop-ups while preserving entitlement snapshots",
    risk: "operational",
  },
  {
    key: "trade.record.publishOpportunity",
    scope: "record",
    ownerRoute: "trade-settings-publish-opportunities",
    ownerSection: "publish-and-manage-opportunities",
    label: "Publish opportunity",
    explanation: "Creates a reviewed open opportunity record; it does not synthesize market offers.",
    units: "one opportunity record",
    validation: "reviewed source terms, valid window, amount, currency and policy compatibility",
    saveMutation: "adminTradingOpportunity.publish",
    readQuery: "adminTradingOpportunity.listOpen",
    auditPolicy: "actor, reason, source evidence, idempotency key",
    effectiveTime: "the saved opportunity window",
    runtimeConsumer: "informational opportunity delivery worker",
    customerEffect: "makes one reviewed opportunity available for eligible delivery",
    risk: "operational",
  },
] as const satisfies readonly TradeSettingDefinition[];

export type TradeSettingKey = (typeof tradeSettingsRegistry)[number]["key"];

export const tradeSettingsByKey: Readonly<Record<TradeSettingKey, TradeSettingDefinition>> =
  Object.fromEntries(tradeSettingsRegistry.map((definition) => [definition.key, definition])) as Readonly<
    Record<TradeSettingKey, TradeSettingDefinition>
  >;
