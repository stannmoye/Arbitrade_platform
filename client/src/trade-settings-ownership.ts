export type TradeSettingsScope = "global" | "package" | "record";
export type TradeSettingsRisk = "low" | "medium" | "high" | "locked";
export type TradeSettingsAvailability = "available" | "locked" | "not-available";

type TradeSettingsOwnerMetadata = {
  key: string;
  scope: TradeSettingsScope;
  ownerRoute: string;
  section: string;
  label: string;
  explanation: string;
  units: string;
  validation: string;
  saveMutation: string | null;
  readQuery: string;
  /** Authoritative read path; retained separately from the UI route. */
  readOwner: string;
  /** Authoritative write path, or null where this item cannot be changed. */
  writeOwner: string | null;
  auditRequirement: string;
  effectiveTime: string;
  runtimeConsumer: string;
  customerImpact: string;
  risk: TradeSettingsRisk;
  availability: TradeSettingsAvailability;
  /** Existing source contract field, used by the registry contract test. */
  controlContract?: string;
};

export type TradeSettingsOwnerDefinition = TradeSettingsOwnerMetadata;

type RegistryEntry = Omit<TradeSettingsOwnerMetadata, "readOwner" | "writeOwner">;

const globalOwner = "trade-package-configuration";
const globalRead = "adminOperations.globalTradeControls";
const globalSave = "adminOperations.updateGlobalTradeControl";
const packagePolicyRead = "adminOperations.packagePolicies";
const packagePolicySave = "adminOperations.updatePackagePolicies";
const packageTermsRead = "adminOperations.tradingPackages";
const packageTermsSave = "adminOperations.updateTradingPackage";

const globalMaster = (input: {
  key: string;
  label: string;
  explanation: string;
  runtimeConsumer: string;
  customerImpact: string;
  risk: TradeSettingsRisk;
}): RegistryEntry => ({
  ...input,
  scope: "global",
  ownerRoute: globalOwner,
  section: "global-masters",
  units: "boolean",
  validation: "Explicit boolean; global writes require a 5–500 character reason and the expected current policy version.",
  saveMutation: globalSave,
  readQuery: globalRead,
  auditRequirement: "Actor, reason, previous/new value, timestamp, incremented policy version and fresh saved-state read-back; write is transactional.",
  effectiveTime: "Future qualification, delivery or identity-selection decisions only; persisted opportunities, entitlement snapshots and open trades are not rewritten.",
  availability: "available",
});

const tierPolicyField = (input: {
  field: string;
  key: string;
  section: string;
  label: string;
  explanation: string;
  units: string;
  validation: string;
  runtimeConsumer: string;
  customerImpact: string;
  risk?: TradeSettingsRisk;
}): RegistryEntry => ({
  key: input.key,
  scope: "package",
  ownerRoute: input.section === "company-rotation" ? "trade-company-rotation" : input.section === "quotas" ? "trade-daily-delivery-caps" : input.section === "delivery" ? "trade-delivery-schedule" : input.section === "display" ? "trade-popup-display" : input.section === "retries" ? "trade-retries" : "trade-delivery-policy",
  section: input.section,
  label: input.label,
  explanation: input.explanation,
  units: input.units,
  validation: input.validation,
  saveMutation: packagePolicySave,
  readQuery: packagePolicyRead,
  auditRequirement: "Administrator reason (5–500 characters), prior/new field values, policy-version increment and fresh read-back are required by the existing per-tier policy save contract.",
  effectiveTime: "Saved policy is used for future delivery decisions or newly created display snapshots; existing customer entitlements and active records retain their saved values.",
  runtimeConsumer: input.runtimeConsumer,
  customerImpact: input.customerImpact,
  risk: input.risk ?? "medium",
  availability: "available",
  controlContract: `packagePolicies.${input.field}`,
});

const packageTermField = (input: {
  field: string;
  key: string;
  label: string;
  explanation: string;
  units: string;
  validation: string;
  runtimeConsumer: string;
  customerImpact: string;
}): RegistryEntry => ({
  key: input.key,
  scope: "package",
  ownerRoute: "trade-tiers-eligibility",
  section: "tier-terms",
  label: input.label,
  explanation: input.explanation,
  units: input.units,
  validation: input.validation,
  saveMutation: packageTermsSave,
  readQuery: packageTermsRead,
  auditRequirement: "Tier create/edit requires an administrator reason (5–500 characters); the server audits and versions saved terms and the UI verifies the saved values from a fresh read.",
  effectiveTime: "Applies to future automatic tier assignments; existing customer entitlement snapshots are not rewritten.",
  runtimeConsumer: input.runtimeConsumer,
  customerImpact: input.customerImpact,
  risk: "high",
  availability: "available",
  controlContract: `tradingPackages.${input.field}`,
});

/**
 * Inventory of implemented controls only. This intentionally does not claim
 * coverage for fee-selection/settlement behavior, global timing saves that also
 * submit settlement fields, or controls whose persistence/runtime contract is
 * not established. Per-package global-master copies are not owners.
 */
const registryEntries: readonly RegistryEntry[] = [
  {
    key: "trade.allocationGate.paused", scope: "global", ownerRoute: globalOwner,
    section: "allocation-safety", label: "New trading allocations",
    explanation: "Pause only new trade reservations and allocations; existing records remain available for review and reconciliation.",
    units: "boolean", validation: "Must be an explicit boolean; pause/resume requires an administrator reason of at least 8 characters.",
    saveMutation: "adminOperations.updateTradeAllocationControls", readQuery: "adminOperations.tradeAllocationControls",
    auditRequirement: "Actor, reason, previous/new state, timestamp and fresh saved-state read-back.",
    effectiveTime: "Future allocation attempts; never rewrites an existing trade.",
    runtimeConsumer: "server/db.ts createTrade allocation gate.",
    customerImpact: "Blocks new allocations when paused; does not remove informational opportunities or settle existing trades.",
    risk: "high", availability: "available",
  },
  globalMaster({
    key: "trade.global.tierPolicyMasterEnabled", label: "Tier policy master",
    explanation: "Global eligibility gate for otherwise-valid enabled tiers.",
    runtimeConsumer: "server/db.ts tier qualification and opportunity delivery paths.",
    customerImpact: "ON permits valid tiers to be considered; OFF prevents future matching decisions.", risk: "high",
  }),
  globalMaster({
    key: "trade.global.popupDeliveryEnabled", label: "Pop-up delivery",
    explanation: "Global gate for new informational customer pop-ups from published open opportunities.",
    runtimeConsumer: "server/db.ts customer opportunity delivery worker.",
    customerImpact: "OFF stops new pop-ups; it does not create opportunities or move funds.", risk: "high",
  }),
  globalMaster({
    key: "trade.global.companyRotationEnabled", label: "Company rotation",
    explanation: "Controls whether an eligible approved catalogue identity may be attached to an informational opportunity.",
    runtimeConsumer: "server/db.ts company spotlight path.",
    customerImpact: "An empty approved pool never fabricates an identity or blocks the informational card.", risk: "medium",
  }),
  globalMaster({
    key: "trade.global.randomizedTimingEnabled", label: "Randomized timing",
    explanation: "Enables the saved bounded timing variation; OFF uses the configured minimum interval.",
    runtimeConsumer: "server/db.ts delivery schedule resolver.",
    customerImpact: "Changes when a future informational event may be delivered; does not create an offer.", risk: "medium",
  }),
  globalMaster({
    key: "trade.global.burstDeliveryEnabled", label: "Burst delivery",
    explanation: "Allows only the existing bounded multi-item delivery batch.",
    runtimeConsumer: "server/db.ts opportunity delivery worker.",
    customerImpact: "OFF limits a cycle to one item per customer; ON never bypasses quotas.", risk: "medium",
  }),
  globalMaster({
    key: "trade.global.requirePreviousSettlement", label: "Require previous settlement",
    explanation: "Global gate for whether a customer must finish all earlier trade settlements before a future allocation.",
    runtimeConsumer: "server/db.ts new-allocation previous-settlement guard.",
    customerImpact: "ON blocks new allocations while an earlier trade is unsettled; OFF bypasses only this prerequisite for future allocations.", risk: "high",
  }),
  {
    key: "trade.automaticFinancialExecution", scope: "global", ownerRoute: globalOwner,
    section: "execution-safety-status", label: "Automatic financial execution",
    explanation: "Status is hard-locked OFF by the backend release guard.", units: "locked boolean",
    validation: "No administrator write is permitted by this feature.", saveMutation: null,
    readQuery: "server/db.ts AUTOMATIC_FINANCIAL_EXECUTION_ENABLED constant and server execution guard",
    auditRequirement: "Not editable; any future release requires separate safety review and release gate.",
    effectiveTime: "Not available.", runtimeConsumer: "server/db.ts automatic execution guard.",
    customerImpact: "Informational pop-ups may still be delivered; automatic financial execution remains OFF.",
    risk: "locked", availability: "locked",
  },
  packageTermField({
    field: "name", key: "trade.package.name", label: "Tier name",
    explanation: "Administrator-defined name for one tier; customers do not browse or select tiers.", units: "text; up to 80 characters",
    validation: "Required non-empty name; server validates uniqueness and records a reason.",
    runtimeConsumer: "server/db.ts tier qualification and customer entitlement presentation.",
    customerImpact: "Names an automatically assigned tier; does not change eligibility by itself.",
  }),
  packageTermField({
    field: "minimumQualifyingBalanceUsdMinor", key: "trade.package.qualifyingThresholdUsdMinor", label: "Qualifying threshold",
    explanation: "Cumulative USD-minor qualifying manual administrator credits required for automatic assignment.", units: "USD minor units (cents)",
    validation: "Positive safe integer; only explicitly qualifying administrator wallet credits count.",
    runtimeConsumer: "server/db.ts qualifying-credit tier assignment.",
    customerImpact: "Changes which future qualifying-credit totals meet this tier; never changes wallet funds.",
  }),
  packageTermField({
    field: "durationMonths", key: "trade.package.entitlementDurationMonths", label: "Entitlement duration",
    explanation: "Calendar-month lifetime of a newly assigned tier entitlement.", units: "calendar months",
    validation: "Integer from 1 through 1,200.",
    runtimeConsumer: "server/db.ts automatic tier assignment and expiry.",
    customerImpact: "Sets expiry for future assignments; existing entitlement snapshots remain unchanged.",
  }),
  packageTermField({
    field: "opportunitiesPerDay", key: "trade.package.dailyOpportunityEntitlement", label: "Daily opportunity entitlement",
    explanation: "Daily opportunity allowance contributed by one qualifying tier; active tier entitlements add together.", units: "opportunities per day",
    validation: "Integer from 1 through 10,000; operational delivery caps may reduce, never increase, entitlement.",
    runtimeConsumer: "server/db.ts entitlement and customer opportunity-delivery quota calculation.",
    customerImpact: "Contributes to future automatic opportunity eligibility; is an allowance, not a guaranteed offer or trade.",
  }),
  packageTermField({
    field: "startsAt", key: "trade.package.effectiveStart", label: "Tier start time",
    explanation: "Optional start instant controlling when the tier may qualify for future assignment.", units: "UTC timestamp; UI accepts local date/time",
    validation: "Nullable valid timestamp; if both dates are present, expiry must be later than start.",
    runtimeConsumer: "server/db.ts tier qualification date checks.",
    customerImpact: "Constrains future eligibility; existing assigned entitlements retain saved terms.",
  }),
  packageTermField({
    field: "expiresAt", key: "trade.package.effectiveExpiry", label: "Tier expiry time",
    explanation: "Optional expiry instant after which the tier is not eligible for future assignment.", units: "UTC timestamp; UI accepts local date/time",
    validation: "Nullable valid timestamp; if both dates are present, expiry must be later than start.",
    runtimeConsumer: "server/db.ts tier qualification date checks.",
    customerImpact: "Constrains future eligibility; existing assigned entitlements retain saved terms.",
  }),
  packageTermField({
    field: "enabled", key: "trade.package.lifecycleEnabled", label: "Tier lifecycle status",
    explanation: "Enable or pause one tier independently from global eligibility and delivery masters.", units: "boolean per tier",
    validation: "Boolean; disabled-to-enabled transition requires server-side package readiness.",
    runtimeConsumer: "server/db.ts tier qualification.",
    customerImpact: "Affects one tier only and never overrides a global master OFF state.",
  }),
  {
    key: "trade.package.create", scope: "package", ownerRoute: "trade-tiers-eligibility",
    section: "tier-terms", label: "Create tier",
    explanation: "Creates one administrator-managed tier with the explicit terms and enabled state submitted by the current form.",
    units: "one tier record", validation: "Name, positive USD-minor threshold, duration, quota, date order and 5–500 character reason are validated.",
    saveMutation: "adminOperations.createTradingPackage", readQuery: packageTermsRead,
    auditRequirement: "Administrator actor/reason and terms version are persisted; UI confirms the new tier through a fresh read.",
    effectiveTime: "Future automatic assignments only.", runtimeConsumer: "server/db.ts tier qualification.",
    customerImpact: "Makes an eligible tier available for server-side qualification; does not enroll a customer or move funds.",
    risk: "high", availability: "available", controlContract: "tradingPackages.create",
  },
  tierPolicyField({
    field: "maxPopupsPerDay", key: "trade.policy.dailyPopupCeiling", section: "quotas", label: "Hard daily pop-up ceiling",
    explanation: "Operational delivery ceiling that can reduce, but never increase, the combined tier entitlement.", units: "pop-ups per selected delivery-counting window",
    validation: "Integer from 1 through 1,000 in the current editor.", runtimeConsumer: "server/db.ts delivery-cap calculation.",
    customerImpact: "May limit future informational pop-ups below the customer's entitlement.",
  }),
  tierPolicyField({
    field: "maxVisibleOffers", key: "trade.policy.maxVisibleOffers", section: "quotas", label: "Maximum visible offers",
    explanation: "Limits simultaneous pending or visible offers for a package.", units: "offers",
    validation: "Positive integer; enforced with the existing per-tier policy validation.", runtimeConsumer: "server/db.ts active-delivery capacity calculation.",
    customerImpact: "Limits concurrent informational cards without increasing the daily entitlement.",
  }),
  tierPolicyField({
    field: "minimumTradeUnits", key: "trade.policy.minimumRequiredCapitalUsd", section: "policy", label: "Minimum required capital",
    explanation: "Lower per-tier required-capital bound in whole USD units; it is not the qualifying threshold or entitlement amount.", units: "whole USD units",
    validation: "Positive integer from 1 through 2,147,483,647; must not exceed the maximum bound.", runtimeConsumer: "server/db.ts validates and applies the saved per-tier capital bounds during offer eligibility checks.",
    customerImpact: "Constrains eligible offer terms; it does not establish available balance, allocate capital, debit a wallet, or prove execution.", risk: "high",
  }),
  tierPolicyField({
    field: "maximumTradeUnits", key: "trade.policy.maximumRequiredCapitalUsd", section: "policy", label: "Maximum required capital",
    explanation: "Upper per-tier required-capital bound in whole USD units; it must be at least the minimum.", units: "whole USD units",
    validation: "Positive integer from 1 through 2,147,483,647; must be at least the minimum bound.", runtimeConsumer: "server/db.ts validates and applies the saved per-tier capital bounds during offer eligibility checks.",
    customerImpact: "Constrains eligible offer terms; it does not establish available balance, allocate capital, debit a wallet, or prove execution.", risk: "high",
  }),
  tierPolicyField({
    field: "dailyPopupTarget", key: "trade.policy.optionalDailyTarget", section: "quotas", label: "Optional daily target cap",
    explanation: "Additional operational cap; zero means no extra target restriction.", units: "pop-ups per selected delivery-counting window; 0 = no extra cap",
    validation: "Non-negative integer; cannot increase the tier entitlement.", runtimeConsumer: "server/db.ts daily delivery-cap calculation.",
    customerImpact: "May further limit future informational pop-ups.",
  }),
  tierPolicyField({
    field: "schedulingPeriod", key: "trade.policy.deliveryCountingWindow", section: "quotas", label: "Delivery counting window",
    explanation: "Selects the time window used to count operational delivery ceilings.", units: "enum: rolling 24 hours or UTC calendar day",
    validation: "Must be one of the two supported enum values.", runtimeConsumer: "server/db.ts delivery quota window selection.",
    customerImpact: "Changes how future delivery caps are counted; does not create an opportunity.",
  }),
  tierPolicyField({
    field: "minIntervalSeconds", key: "trade.policy.minimumDeliveryIntervalSeconds", section: "delivery", label: "Minimum delivery interval",
    explanation: "Minimum spacing between eligible informational deliveries.", units: "seconds",
    validation: "Non-negative integer no greater than maximum interval.", runtimeConsumer: "server/db.ts delivery schedule resolver.",
    customerImpact: "Sets the earliest future delivery time subject to all other eligibility and quota gates.",
  }),
  tierPolicyField({
    field: "maxIntervalSeconds", key: "trade.policy.maximumDeliveryIntervalSeconds", section: "delivery", label: "Maximum delivery interval",
    explanation: "Maximum bound for the saved delivery interval rule.", units: "seconds",
    validation: "Non-negative integer greater than or equal to minimum interval.", runtimeConsumer: "server/db.ts delivery schedule resolver.",
    customerImpact: "Bounds future informational delivery timing; no delivery is guaranteed.",
  }),
  tierPolicyField({
    field: "postCompletionIntervalSeconds", key: "trade.policy.postCompletionIntervalSeconds", section: "delivery", label: "Post-completion interval",
    explanation: "Wait period measured from the latest completed trade/wallet posting before another delivery calculation.", units: "seconds",
    validation: "Non-negative integer within the server-supported range.", runtimeConsumer: "server/db.ts post-completion delivery schedule gate.",
    customerImpact: "May delay future informational deliveries; it does not settle or post funds.",
  }),
  tierPolicyField({
    field: "maxPendingDeliveries", key: "trade.policy.maximumPendingDeliveries", section: "delivery", label: "Maximum pending deliveries",
    explanation: "Per-customer, per-tier cap on queued, in-progress and retry-wait informational deliveries; delivered, failed, dismissed and expired records do not occupy pending slots.", units: "deliveries",
    validation: "Non-negative integer; a positive daily target cannot be saved when this value is zero.", runtimeConsumer: "server/opportunityLifecycle.ts ensurePopupDeliveries counts that customer's queued, in-progress and retry-wait records for the tier before inserting a new delivery; insertion is skipped when the count reaches maxPendingDeliveries.",
    customerImpact: "Limits the number of that customer's simultaneously pending informational deliveries for the tier; it does not increase daily entitlement or affect trade execution.",
  }),
  tierPolicyField({
    field: "maxTradeAttemptsPerDay", key: "trade.policy.maximumTradeAttemptsPerDay", section: "retries", label: "Maximum trade attempts per day",
    explanation: "Customer-wide per-day ceiling on claimed execution attempts across opportunities, separate from informational delivery attempts.", units: "attempts per UTC day; 0 = no extra cap",
    validation: "Integer from 0 through 10,000; a positive successful-trade ceiling cannot exceed this attempt ceiling.", runtimeConsumer: "server/db.ts customer-wide automatic-allocation attempt accounting; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would constrain future allocation attempts if that separately guarded financial path is enabled; it does not limit pop-up delivery.", risk: "high",
  }),
  tierPolicyField({
    field: "tradeRetryDelaySeconds", key: "trade.policy.tradeRetryDelaySeconds", section: "retries", label: "Trade retry delay",
    explanation: "Delay before retrying an eligible technical trade-execution failure; it does not mean a delivery attempt or carry-forward.", units: "seconds",
    validation: "Integer from 5 through 3,600 seconds.", runtimeConsumer: "server/db.ts scheduled technical execution-retry timing; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would space eligible retry attempts if the separately guarded financial path is enabled; changing the setting does not reset an already scheduled retry.", risk: "high",
  }),
  tierPolicyField({
    field: "maxSuccessfulTradesPerDay", key: "trade.policy.maximumSuccessfulTradesPerDay", section: "retries", label: "Maximum successful trades per day",
    explanation: "Customer-wide per-day ceiling on successfully settled trades, separate from informational delivery quota.", units: "trades per UTC day; 0 = no extra cap",
    validation: "Integer from 0 through 10,000; cannot exceed a positive daily attempt ceiling.", runtimeConsumer: "server/db.ts customer-wide successful-trade eligibility checks; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would constrain future successful-trade eligibility if the separately guarded financial path is enabled; it is not a pop-up quota.", risk: "high",
  }),
  tierPolicyField({
    field: "maxConcurrentActiveTrades", key: "trade.policy.maximumConcurrentActiveTrades", section: "retries", label: "Maximum concurrent active trades",
    explanation: "Customer-wide limit on simultaneously active trades; it is not a visible-offer limit.", units: "active trades",
    validation: "Integer from 1 through 1,000.", runtimeConsumer: "server/db.ts active-trade allocation checks; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would constrain concurrent allocations if the separately guarded financial path is enabled; it does not limit informational cards.", risk: "high",
  }),
  tierPolicyField({
    field: "minSettlementDelaySeconds", key: "trade.policy.minimumSettlementDelaySeconds", section: "retries", label: "Minimum settlement delay",
    explanation: "Lower per-tier bound for the interval from scheduled trade completion to settlement review.", units: "seconds; minimum 900 seconds (15 minutes)",
    validation: "Integer from 900 through 604,800 seconds; cannot exceed the maximum bound.", runtimeConsumer: "server/db.ts saved settlement-review deadline calculation for created trades.",
    customerImpact: "Defines a future review deadline only; elapsed time is not evidence of a result or wallet posting.", risk: "high",
  }),
  tierPolicyField({
    field: "maxSettlementDelaySeconds", key: "trade.policy.maximumSettlementDelaySeconds", section: "retries", label: "Maximum settlement delay",
    explanation: "Upper per-tier bound for the interval from scheduled trade completion to settlement review.", units: "seconds; 900–604,800 seconds (15 minutes–7 days)",
    validation: "Integer from 900 through 604,800 seconds; must be at least the minimum bound.", runtimeConsumer: "server/db.ts saved settlement-review deadline calculation for created trades.",
    customerImpact: "Defines a future review deadline only; it does not post funds or determine the trade result.", risk: "high",
  }),
  tierPolicyField({
    field: "popupDisplayTargetSeconds", key: "trade.policy.popupDisplayDurationSeconds", section: "display", label: "Expanded pop-up display duration",
    explanation: "Controls presentation duration only; it must not close or settle a trade.", units: "seconds",
    validation: "Integer from 1 through 86,400 seconds (maximum one day), matching the current delivery runtime cap.", runtimeConsumer: "server/db.ts popup snapshot and customer display response; server/modules/trading-popup-policy.ts rejects durations above one day.",
    customerImpact: "Changes future card presentation only; pending items remain accessible.",
  }),
  tierPolicyField({
    field: "completionDisplaySeconds", key: "trade.policy.completionCardDisplaySeconds", section: "display", label: "Completed card display duration",
    explanation: "Controls presentation time for completed-status cards.", units: "seconds",
    validation: "Positive integer within the existing per-tier display bound.", runtimeConsumer: "server/db.ts popup lifecycle/display policy.",
    customerImpact: "Changes future card presentation only; it does not change trade timing or accounting.",
  }),
  tierPolicyField({
    field: "closePolicy", key: "trade.policy.cardClosePolicy", section: "display", label: "Card close policy",
    explanation: "Selects when a card may close after completion/final status display; pending and retrying cards remain accessible.", units: "enum: after completion or after final display",
    validation: "Must be one of the two supported enum values.", runtimeConsumer: "server/db.ts popup lifecycle response.",
    customerImpact: "Affects future card dismissal only; never changes the underlying trade lifecycle.",
  }),
  tierPolicyField({
    field: "badgeLabel", key: "trade.policy.badgeLabel", section: "policy", label: "Tier badge label",
    explanation: "Optional display label for the package badge.", units: "text; at most 40 characters",
    validation: "String length at most 40; blank removes the badge label.", runtimeConsumer: "server/db.ts popup policy snapshot.",
    customerImpact: "Visual label only; does not affect eligibility or financial terms.", risk: "low",
  }),
  tierPolicyField({
    field: "badgeStyle", key: "trade.policy.badgeStyle", section: "policy", label: "Tier badge style",
    explanation: "Selects one built-in visual style for the package badge.", units: "enum: neutral, blue, purple, gold or green",
    validation: "Must be one of the approved built-in style names.", runtimeConsumer: "server/db.ts popup policy snapshot.",
    customerImpact: "Visual styling only; does not affect eligibility or financial terms.", risk: "low",
  }),
  tierPolicyField({
    field: "minimumPayoutRateBps", key: "trade.policy.minimumConfiguredReturnBps", section: "policy", label: "Minimum configured return rate",
    explanation: "Lower per-tier configured-return bound; it is a policy-defined amount and not market-earned profit.", units: "basis points; 1 bp = 0.01 percentage point",
    validation: "Set together with the maximum; positive enabled bounds are 1–5,000 basis points and maximum must be at least minimum.", runtimeConsumer: "server/db.ts validates and snapshots configured offer-rate bounds; financial execution remains hard-disabled in this release.",
    customerImpact: "Defines a permitted configured offer term; it is not evidence of market performance, realized profit, or a wallet credit.", risk: "high",
  }),
  tierPolicyField({
    field: "maximumPayoutRateBps", key: "trade.policy.maximumConfiguredReturnBps", section: "policy", label: "Maximum configured return rate",
    explanation: "Upper per-tier configured-return bound; it is not a market quote or realized result.", units: "basis points; 1 bp = 0.01 percentage point",
    validation: "Set together with the minimum; positive enabled bounds are 1–5,000 basis points and maximum must be at least minimum.", runtimeConsumer: "server/db.ts validates and snapshots configured offer-rate bounds; financial execution remains hard-disabled in this release.",
    customerImpact: "Defines a permitted configured offer term; it is not evidence of market performance, realized profit, or a wallet credit.", risk: "high",
  }),
  tierPolicyField({
    field: "minimumTradeDurationSeconds", key: "trade.policy.minimumTradeDurationSeconds", section: "policy", label: "Minimum trade duration",
    explanation: "Lower bound on a configured trade’s server-owned lifetime; separate from tier entitlement and card display duration.", units: "seconds",
    validation: "Set together with the maximum; integer from 10 through 86,400 seconds and maximum must be at least minimum.", runtimeConsumer: "server/db.ts validates and snapshots configured trade-duration bounds; financial execution remains hard-disabled in this release.",
    customerImpact: "Defines a permitted future timing term only; a countdown does not establish execution or settlement.", risk: "high",
  }),
  tierPolicyField({
    field: "maximumTradeDurationSeconds", key: "trade.policy.maximumTradeDurationSeconds", section: "policy", label: "Maximum trade duration",
    explanation: "Upper bound on a configured trade’s server-owned lifetime; separate from tier entitlement and card display duration.", units: "seconds",
    validation: "Set together with the minimum; integer from 10 through 86,400 seconds and at least the minimum bound.", runtimeConsumer: "server/db.ts validates and snapshots configured trade-duration bounds; financial execution remains hard-disabled in this release.",
    customerImpact: "Defines a permitted future timing term only; existing snapshots remain unchanged.", risk: "high",
  }),
  tierPolicyField({
    field: "minimumRewardBps", key: "trade.policy.minimumEligibleRewardBps", section: "policy", label: "Minimum eligible reward rate",
    explanation: "Per-tier eligibility floor for a configured reward rate; it is not the configured return rate itself or market profit.", units: "basis points; 0–10,000 bps (0%–100%)",
    validation: "Integer from 0 through 10,000 basis points.", runtimeConsumer: "server/db.ts validates the selected configured rate against this floor; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would reject a future rate below this floor if the separately guarded financial path is enabled; no result or credit is created by this setting.", risk: "high",
  }),
  tierPolicyField({
    field: "maxDailyRewardMinor", key: "trade.policy.maximumDailyRewardMinor", section: "policy", label: "Maximum daily reward cap",
    explanation: "Per-tier upper bound on reward allowance tracked per customer and day; zero means no additional cap.", units: "currency minor units; 0 = no additional cap",
    validation: "Integer from 0 through 2,147,483,647; maximum per-trade reward cannot exceed a positive daily cap.", runtimeConsumer: "server/db.ts checks reserved/credited reward allowance; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would constrain future reward allowance if the separately guarded financial path is enabled; it is not a wallet balance or earnings guarantee.", risk: "high",
  }),
  tierPolicyField({
    field: "maxRewardPerTradeMinor", key: "trade.policy.maximumRewardPerTradeMinor", section: "policy", label: "Maximum reward per trade",
    explanation: "Per-tier upper bound on reward amount for one trade; zero means no additional cap.", units: "currency minor units; 0 = no additional cap",
    validation: "Integer from 0 through 2,147,483,647; cannot exceed a positive daily reward cap.", runtimeConsumer: "server/db.ts caps a configured reward amount per trade; automatic financial execution remains hard-disabled in this release.",
    customerImpact: "Would cap a future configured reward amount if the separately guarded financial path is enabled; no wallet credit follows from this setting alone.", risk: "high",
  }),
  tierPolicyField({
    field: "companyRotationCountryNames", key: "trade.policy.companyCountryFolders", section: "company-rotation", label: "Company country-folder filters",
    explanation: "Comma-separated exact catalogue folder labels applied after current company approval filtering.", units: "comma-separated catalogue folder names",
    validation: "At most 2,000 characters; unknown folder labels do not establish listing or headquarters status.", runtimeConsumer: "server/db.ts approved-company selection.",
    customerImpact: "Restricts informational company identities to approved records matching the configured folders.",
  }),
  tierPolicyField({
    field: "companyRotationRepeatPolicy", key: "trade.policy.companyRepeatPolicy", section: "company-rotation", label: "Company repeat policy",
    explanation: "Choose whether the approved filtered pool is traversed before a company reference may repeat.", units: "enum: avoid until exhausted or allow repeats",
    validation: "Must be one of the two supported repeat-policy values.", runtimeConsumer: "server/db.ts company rotation state.",
    customerImpact: "Affects which approved reference identity may appear on future informational opportunities; never proves a trade.",
  }),
  {
    key: "trade.opportunity.publishSingle", scope: "record", ownerRoute: "trade-opportunity-publishing",
    section: "manual-publication", label: "Publish one opportunity",
    explanation: "Creates one open opportunity record from administrator-entered terms. A required source reference and operator review note are saved with the administrator identity and accepted terms; the platform does not independently verify the external evidence or the substance of the note.",
    units: "one opportunity record", validation: "Symbol 1–40 characters, venues 1–80 characters, supported currency, positive native minor-unit minimum, reward rate 1–5,000 basis points, duration 10–86,400 seconds, source reference 1–160 characters and review note 1–2,000 characters.",
    saveMutation: "adminOperations.createOffer", readQuery: "adminOperations.offers",
    auditRequirement: "Requires source reference and operator review note; offer and actor-attributed accepted terms/source/review audit event are written in one transaction. External evidence and note substance are not independently verified.",
    effectiveTime: "Available to future delivery while the published opportunity is open and time-valid; existing delivered events are not rewritten.",
    runtimeConsumer: "server/db.ts published-offer customer delivery worker.",
    customerImpact: "May create an informational customer pop-up after eligibility and delivery gates pass; does not itself execute a trade or move funds.",
    risk: "high", availability: "available", controlContract: "adminOperations.createOffer",
  },
  {
    key: "trade.opportunity.publishBulk", scope: "record", ownerRoute: "trade-opportunity-publishing",
    section: "bulk-publication", label: "Import validated opportunities",
    explanation: "Creates a batch of open opportunity records from a fully validated CSV. Per-row source references and operator review notes are saved; external evidence and note substance are not independently verified.",
    units: "1–5,000 opportunity records per batch", validation: "Each row uses the single-opportunity field bounds and supported currencies, including source reference 1–160 characters and review note 1–2,000 characters; batch size is limited to 5,000.",
    saveMutation: "adminOperations.bulkCreateOffers", readQuery: "adminOperations.offers",
    auditRequirement: "Every offer is inserted with its actor-attributed accepted terms/source/review audit event in the same transaction; external evidence and note substance are not independently verified.",
    effectiveTime: "Available to future delivery while each published opportunity remains open and time-valid; existing delivered events are not rewritten.",
    runtimeConsumer: "server/db.ts published-offer customer delivery worker.",
    customerImpact: "May create informational customer pop-ups after eligibility and delivery gates pass; does not itself execute trades or move funds.",
    risk: "high", availability: "available", controlContract: "adminOperations.bulkCreateOffers",
  },
  {
    key: "trade.opportunity.close", scope: "record", ownerRoute: "trade-opportunity-publishing",
    section: "manual-publication", label: "Close an open opportunity",
    explanation: "Closes one currently open, unexpired published opportunity from future delivery consideration. Existing delivered popup and trade snapshots are not rewritten.",
    units: "one opportunity record", validation: "Requires a positive safe offer ID and a trimmed 1–2,000 character reason; only an open, unexpired offer may be closed.",
    saveMutation: "adminOperations.closeOffer", readQuery: "adminOperations.offers",
    auditRequirement: "Requires an administrator actor and reason; open-to-closed state and reason are recorded atomically. A retry returns only after a verified existing audit row and fresh persisted read-back.",
    effectiveTime: "After the verified status change, future delivery considers only still-open opportunities; existing delivery events and customer trade snapshots remain unchanged.",
    runtimeConsumer: "server/db.ts published-offer customer delivery worker reads the saved opportunity status.",
    customerImpact: "Stops future informational delivery consideration for this record; it does not reverse or alter already delivered events, trades, settlements, or wallet entries.",
    risk: "high", availability: "available", controlContract: "adminOperations.closeOffer",
  },
  {
    key: "trade.opportunity.runRetentionCleanup", scope: "record", ownerRoute: "trade-opportunity-publishing",
    section: "retention", label: "Run popup retention cleanup",
    explanation: "Runs the current 24-hour lifecycle-detail retention operation; detail rows older than the retention window are aggregated before deletion.",
    units: "one retention job", validation: "No input is accepted by the current operation; cleanup scope and retention window are server-defined.",
    saveMutation: "adminOperations.runPopupRetention", readQuery: "adminOperations.popupLifecycleSummary",
    auditRequirement: "The current UI mutation accepts no administrator reason or audit-reference field; it is an operational cleanup, not a policy change.",
    effectiveTime: "On invocation, for eligible lifecycle-detail records older than the configured 24-hour retention boundary.",
    runtimeConsumer: "server/db.ts opportunity lifecycle retention service.",
    customerImpact: "Aggregated historical counts remain available; the action does not publish offers, alter current delivery eligibility, or settle trades.",
    risk: "medium", availability: "available", controlContract: "adminOperations.runPopupRetention",
  },
  {
    key: "trade.retry.carryForward", scope: "package", ownerRoute: "trade-retries",
    section: "availability", label: "Carry-forward across daily windows",
    explanation: "The current owner screen states that carry-forward is not enabled; no supported state machine is available to configure.",
    units: "not available", validation: "No mutation is permitted; do not infer carry-forward behavior from retry controls.",
    saveMutation: null, readQuery: packagePolicyRead,
    auditRequirement: "Read-only availability note; enabling requires an approved, implemented retry/carry-forward policy.",
    effectiveTime: "Not available.", runtimeConsumer: "No carry-forward runtime consumer is implemented.",
    customerImpact: "No effect; retry-window expiry is handled as failed work for review.",
    risk: "locked", availability: "not-available",
  },
  {
    key: "trade.package.feePolicy", scope: "package", ownerRoute: "trade-tiers-eligibility",
    section: "package-fee-policy", label: "Package platform fee policy",
    explanation: "Versioned fee percentage and rounding rule selected for a new package allocation according to its allocation time; fee applies only to positive realized gross profit.",
    units: "basis points and rounding enum", validation: "Exact decimal percentage parsing to integer bps; effective time and 5–500 character reason are required.",
    saveMutation: "adminOperations.updatePackageFeePolicy", readQuery: "adminOperations.packageFeePolicies",
    auditRequirement: "Administrator changedBy actor, changedAt timestamp, reason, expected mutation version, prior/new values and fresh read-back of the latest version and effective time.",
    effectiveTime: "A new allocation created after effectiveAt selects this policy; an existing allocation keeps its fee snapshot even when it settles later.",
    runtimeConsumer: "Backend package fee policy selected and snapshotted when a new allocation is created.", customerImpact: "Changes the authorized package fee on positive realized profit only; never changes principal or configured returns.",
    risk: "high", availability: "available", controlContract: "packageFeePolicies.feeRateBps",
  },
  {
    key: "trade.package.initialFeeOnCreate", scope: "package", ownerRoute: "trade-tiers-eligibility",
    section: "package-fee-policy", label: "Initial package fee on creation",
    explanation: "Requires an explicit initial package fee, rounding mode and audit reason when a tier is created.",
    units: "basis points and rounding enum", validation: "Decimal rate must exactly map to 0–10,000 bps; initialFeeReason is required.",
    saveMutation: "adminOperations.createTradingPackage", readQuery: "adminOperations.packageFeePolicies",
    auditRequirement: "Creation actor and explicit initial fee reason are recorded; saved fee is verified from the fresh package-fee read.",
    effectiveTime: "New allocations for the newly created package after its initial fee policy takes effect.",
    runtimeConsumer: "Backend package-creation fee contract.", customerImpact: "Initial package fee policy; no customer selection or financial execution is enabled.",
    risk: "high", availability: "available", controlContract: "packageFeePolicies.initialFeeRateBps",
  },
  {
    key: "trade.deliveryRetry.sharedPolicy", scope: "global", ownerRoute: "trade-retries",
    section: "delivery-retry-policy", label: "Shared delivery retry policy",
    explanation: "One global policy for temporary delivery failures with a delivery-specific interval sequence; it is separate from financial trade retry delay.",
    units: "policy enum, attempts, seconds sequence", validation: "Uses expected version, supported none/temporary policy, 1–20 attempts, whole-second delivery intervals of 5–3,600 seconds per attempt, future effective time and a 5–500 character reason.",
    saveMutation: "adminOperations.updateDeliveryRetryPolicy", readQuery: "adminOperations.deliveryRetryPolicy",
    auditRequirement: "Administrator, reason, prior/new values, version and fresh read-back are required; temporary retry is blocked when unconfigured.",
    effectiveTime: "Future delivery retry decisions; existing scheduled retry timestamps remain unchanged.",
    runtimeConsumer: "Backend shared delivery retry policy contract.", customerImpact: "Controls customer opportunity delivery retry timing only, never trade execution or settlement.",
    risk: "high", availability: "available", controlContract: "deliveryRetryPolicy.policy",
  },
  {
    key: "trade.companyCatalogue.bulkStatus", scope: "record", ownerRoute: "trade-company-catalogue",
    section: "approval-and-lifecycle", label: "Company catalogue status action",
    explanation: "Bulk mark selected reference records verified/unverified, enabled/disabled, archive them, or restore them by clearing archived status without re-approving them; archive revokes customer approval while verification remains separate from enablement.",
    units: "one or more stable Logo IDs", validation: "Mutation accepts 1–1,811 valid catalogue IDs, a supported status and a trimmed 8–500 character reason; archive removes verifiedIds and restore clears archivedIds without re-approving the record.",
    saveMutation: "companyCatalogueReference.updateAdminState", readQuery: "companyCatalogueReference.adminState",
    auditRequirement: "Administrator actor, submitted reason, selected IDs and resulting status are required by the existing status-update contract.",
    effectiveTime: "Immediately on subsequent customer catalogue/pop-up reads; historical completed snapshots are not rewritten.",
    runtimeConsumer: "Company catalogue approval filtering and active popup company identity response.",
    customerImpact: "Controls whether a reference identity may appear; verification is display approval only, not listing or execution authorization.",
    risk: "high", availability: "available", controlContract: "companyCatalogueReference.updateAdminState",
  },
  {
    key: "trade.worker.deadQualificationJobRetry", scope: "record", ownerRoute: "trade-worker-health",
    section: "qualification-recovery", label: "Retry dead-lettered tier qualification job",
    explanation: "Requeues one reviewed dead-lettered qualification job for the normal idempotent worker path; does not directly grant an entitlement or change a wallet.",
    units: "one durable qualification job ID", validation: "Select an existing dead job and supply a reason of 8–500 characters.",
    saveMutation: "adminOperations.requeueDeadQualificationJob", readQuery: "adminOperations.workerHealth",
    auditRequirement: "Administrator actor and mandatory reason are recorded by the guarded recovery operation; refreshed worker/queue state is shown after retry.",
    effectiveTime: "Worker processes the queued job on a subsequent normal cycle.",
    runtimeConsumer: "Tier qualification worker and durable qualification-job queue.",
    customerImpact: "May cause the worker to recompute tier eligibility from the original qualifying ledger record; it does not itself change funds or directly assign a tier.",
    risk: "high", availability: "available", controlContract: "adminOperations.requeueDeadQualificationJob",
  },
  {
    key: "trade.manualPayouts.review", scope: "record", ownerRoute: "trade-manual-payouts",
    section: "manual-payout-review", label: "Manual payout request review and resolution",
    explanation: "The sole Trade Settings UI owner for listing manual payout requests and recording the existing paid/rejected administrative resolution.",
    units: "one payout request", validation: "Uses the existing payout resolution validation and external-reference requirements; the route does not initiate a bank or blockchain transfer.",
    saveMutation: "adminOperations.resolvePayoutRequest", readQuery: "adminOperations.payoutRequests",
    auditRequirement: "Resolution uses the existing server-side manual payout request contract; no UI route duplicates or bypasses that mutation.",
    effectiveTime: "Applies to the selected existing payout request only; no automatic transfer or trade settlement is triggered.",
    runtimeConsumer: "Existing manual payout request list and resolution path; external transfer remains outside Arbitrade.",
    customerImpact: "Records the administrator's existing payout resolution outcome; it does not execute an external payment.",
    risk: "high", availability: "available", controlContract: "adminOperations.resolvePayoutRequest",
  },
  {
    key: "trade.history.read", scope: "record", ownerRoute: "trade-history",
    section: "persisted-trade-history", label: "Trading History",
    explanation: "Read persisted trade lifecycle and evidence fields in bounded trade-ID windows; result amounts are shown only when a saved actual-result confirmation and evidence reference exist.",
    units: "bounded scan window of persisted trade records", validation: "Admin-only read query; supports validated customer ID, lifecycle status, settlement status, UTC confirmed-date bounds and a descending trade-ID cursor. Each scan is capped at 250 records.",
    saveMutation: null, readQuery: "adminOperations.tradingHistory",
    auditRequirement: "Read-only projection from trade_positions; no mutation or inference of missing result, timestamp or evidence fields.",
    effectiveTime: "Displays the persisted trade record and its saved lifecycle/result evidence as read; no operational effect.",
    runtimeConsumer: "Trade Settings → Trading History read-only query.",
    customerImpact: "No customer-visible or financial effect; does not confirm results, reconcile the ledger or change any trade.",
    risk: "low", availability: "locked",
  },
];

export const tradeSettingsOwnershipRegistry: readonly TradeSettingsOwnerDefinition[] = registryEntries.map((entry) => ({
  ...entry,
  readOwner: entry.readQuery,
  writeOwner: entry.saveMutation,
}));

/** Stable route IDs mirrored from the single Trade Settings navigation group. */
export const tradeSettingsRouteOwnerIds = [
  "trade-settings-overview",
  "trade-package-configuration",
  "trade-tiers-eligibility",
  "trade-daily-delivery-caps",
  "trade-delivery-policy",
  "trade-opportunity-publishing",
  "trade-delivery-schedule",
  "trade-duration-closing",
  "trade-popup-display",
  "trade-company-rotation",
  "trade-company-catalogue",
  "trade-capital-funding",
  "trade-fees-earnings",
  "trade-retries",
  "trade-active-pending",
  "trade-manual-payouts",
  "trade-settlement",
  "trade-history",
  "trade-worker-health",
  "trade-audit-policy-history",
  "trade-admin-guide",
] as const;
