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
    key: "trade.global.deliveryEnabled",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Global delivery enabled",
    explanation: "Controls whether new informational opportunities may be delivered globally.",
    units: "ON/OFF",
    validation: "authorized admin; reason required; fail closed when missing",
    saveMutation: "adminTradingGlobalSettings.update",
    readQuery: "adminTradingGlobalSettings.get",
    auditPolicy: "actor, reason, previous value, next value, version",
    effectiveTime: "future deliveries and assignments; existing records remain intact",
    runtimeConsumer: "trading opportunity delivery worker",
    customerEffect: "eligible future informational pop-ups may be delivered",
    risk: "safety",
  },
  {
    key: "trade.global.requirePreviousSettlement",
    scope: "global",
    ownerRoute: "trade-settings-package-configuration",
    ownerSection: "delivery-and-safety",
    label: "Require previous settlement",
    explanation: "Prevents a new allocation while an earlier non-cancelled trade remains unsettled.",
    units: "ON/OFF",
    validation: "ON by default; OFF requires authorized role, reason and audit event",
    saveMutation: "adminTradingGlobalSettings.update",
    readQuery: "adminTradingGlobalSettings.get",
    auditPolicy: "safety downgrade requires old/new values and version",
    effectiveTime: "future allocations only",
    runtimeConsumer: "trading allocation eligibility worker",
    customerEffect: "controls whether a customer can receive another allocation",
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
