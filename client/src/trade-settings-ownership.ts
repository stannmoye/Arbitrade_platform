export type TradeSettingsScope = "global" | "package" | "record";
export type TradeSettingsRisk = "low" | "medium" | "high" | "locked";

export type TradeSettingsOwnerDefinition = {
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
  auditRequirement: string;
  effectiveTime: string;
  runtimeConsumer: string;
  customerImpact: string;
  risk: TradeSettingsRisk;
  availability: "available" | "locked" | "not-available";
};

const globalOwner = "trade-package-configuration";
const globalRead = "adminOperations.globalTradeControls";
const globalSave = "adminOperations.updateGlobalTradeControl";

/**
 * Authoritative owner registry for the implemented Trade settings slice.
 * Per-package copies of global delivery masters are intentionally not exposed
 * as owner keys; the old database columns are migration inputs only.
 */
export const tradeSettingsOwnershipRegistry: readonly TradeSettingsOwnerDefinition[] = [
  {
    key: "trade.allocationGate.paused", scope: "global", ownerRoute: globalOwner,
    section: "allocation-safety", label: "New trading allocations",
    explanation: "Pause only new trade reservations and allocations; existing records remain available for review and reconciliation.",
    units: "boolean", validation: "Must be an explicit boolean; pause/resume requires an administrator reason.",
    saveMutation: "adminOperations.updateTradeAllocationControls", readQuery: "adminOperations.tradeAllocationControls",
    auditRequirement: "Actor, reason, previous/new state, timestamp and saved-state read-back.",
    effectiveTime: "Future allocation attempts; never rewrites an existing trade.",
    runtimeConsumer: "server/db.ts createTrade allocation gate.",
    customerImpact: "Blocks new allocations when paused; does not remove informational opportunities or settle existing trades.",
    risk: "high", availability: "available",
  },
  {
    key: "trade.global.tierPolicyMasterEnabled", scope: "global", ownerRoute: globalOwner,
    section: "global-masters", label: "Tier policy master",
    explanation: "Global eligibility gate for otherwise-valid enabled tiers.", units: "boolean",
    validation: "Boolean; writes require a 5–500 character reason and expected policy version.",
    saveMutation: globalSave, readQuery: globalRead,
    auditRequirement: "Actor, reason, previous/new policy, incremented version and read-back.",
    effectiveTime: "Future qualification and delivery decisions; existing snapshots remain unchanged.",
    runtimeConsumer: "server/db.ts tier qualification and opportunity delivery paths.",
    customerImpact: "ON permits valid tiers to be considered; OFF prevents new matching decisions.", risk: "high", availability: "available",
  },
  {
    key: "trade.global.popupDeliveryEnabled", scope: "global", ownerRoute: globalOwner,
    section: "global-masters", label: "Pop-up delivery",
    explanation: "Global gate for new informational customer pop-ups from published open opportunities.", units: "boolean",
    validation: "Boolean; writes require a 5–500 character reason and expected policy version.",
    saveMutation: globalSave, readQuery: globalRead,
    auditRequirement: "Actor, reason, previous/new policy, incremented version and read-back.",
    effectiveTime: "Future delivery only; persisted events remain readable.",
    runtimeConsumer: "server/db.ts customer opportunity delivery worker.",
    customerImpact: "OFF stops new pop-ups; it does not create opportunities or move funds.", risk: "high", availability: "available",
  },
  {
    key: "trade.global.companyRotationEnabled", scope: "global", ownerRoute: globalOwner,
    section: "global-masters", label: "Company rotation",
    explanation: "Controls whether an eligible approved catalogue identity may be attached to an informational opportunity.", units: "boolean",
    validation: "Boolean; customer identities still require current approval, enabled and non-archived state.",
    saveMutation: globalSave, readQuery: globalRead,
    auditRequirement: "Actor, reason, previous/new policy, incremented version and read-back.",
    effectiveTime: "Future identity selection only.", runtimeConsumer: "server/db.ts company spotlight path.",
    customerImpact: "An empty approved pool never fabricates an identity or blocks the informational card.", risk: "medium", availability: "available",
  },
  {
    key: "trade.global.randomizedTimingEnabled", scope: "global", ownerRoute: globalOwner,
    section: "global-masters", label: "Randomized timing",
    explanation: "Enables the saved bounded deterministic cadence variation.", units: "boolean",
    validation: "Boolean; selection must remain inside the configured interval bounds.",
    saveMutation: globalSave, readQuery: globalRead,
    auditRequirement: "Actor, reason, previous/new policy, incremented version and read-back.",
    effectiveTime: "Future delivery deadlines; existing deadlines are not reset.",
    runtimeConsumer: "server/db.ts delivery schedule resolver.",
    customerImpact: "Changes when a future informational event may be delivered; does not create an offer.", risk: "medium", availability: "available",
  },
  {
    key: "trade.global.burstDeliveryEnabled", scope: "global", ownerRoute: globalOwner,
    section: "global-masters", label: "Burst delivery",
    explanation: "Allows only the existing bounded multi-item delivery batch.", units: "boolean",
    validation: "Boolean; existing maximum batch size and quota limits remain enforced.",
    saveMutation: globalSave, readQuery: globalRead,
    auditRequirement: "Actor, reason, previous/new policy, incremented version and read-back.",
    effectiveTime: "Future worker cycles only.", runtimeConsumer: "server/db.ts opportunity delivery worker.",
    customerImpact: "OFF limits a cycle to one item per customer; ON never bypasses quotas.", risk: "medium", availability: "available",
  },
  {
    key: "trade.global.requirePreviousSettlement", scope: "global", ownerRoute: globalOwner,
    section: "global-safety", label: "Require previous settlement",
    explanation: "Safety prerequisite that blocks new financial allocation until previous trades are settled.", units: "locked ON",
    validation: "Cannot be disabled through this control route.", saveMutation: null, readQuery: globalRead,
    auditRequirement: "Read-only status; any future relaxation needs a separate approved safety workflow.",
    effectiveTime: "Future allocation decisions; pending settlement records are never rewritten.",
    runtimeConsumer: "server/db.ts allocation and settlement gates.",
    customerImpact: "May defer financial allocation; informational pop-ups remain a separate lifecycle.", risk: "locked", availability: "locked",
  },
  {
    key: "trade.automaticFinancialExecution", scope: "global", ownerRoute: globalOwner,
    section: "execution-safety-status", label: "Automatic financial execution",
    explanation: "Status is hard-locked OFF by the backend release guard.", units: "locked boolean",
    validation: "No administrator write is permitted by this feature.", saveMutation: null,
    readQuery: "server/db.ts AUTOMATIC_FINANCIAL_EXECUTION_ENABLED constant and server execution guard",
    auditRequirement: "Not editable; any future release requires separate safety review and release gate.",
    effectiveTime: "Not available.", runtimeConsumer: "server/db.ts automatic execution guard.",
    customerImpact: "Informational pop-ups may still be delivered; automatic financial execution remains OFF.", risk: "locked", availability: "locked",
  },
  {
    key: "trade.package.lifecycleEnabled", scope: "package", ownerRoute: "trade-tiers-eligibility",
    section: "lifecycle", label: "Package lifecycle status",
    explanation: "Enable or pause one tier independently from global eligibility and delivery masters.", units: "boolean per package",
    validation: "Boolean; enable transition requires server-side package readiness.",
    saveMutation: "adminOperations.updateTradingPackage", readQuery: "adminOperations.tradingPackages",
    auditRequirement: "Actor, required reason, prior/new terms and fresh saved-record verification.",
    effectiveTime: "Future assignments; existing entitlement snapshots are preserved.",
    runtimeConsumer: "server/db.ts tier qualification.",
    customerImpact: "Affects one tier only and never overrides a global master OFF state.", risk: "high", availability: "available",
  },
];

export const tradeSettingsRouteOwnerIds = [
  "trade-package-configuration",
  "trade-tiers-eligibility",
  "trade-delivery-policy",
  "trade-daily-delivery-caps",
  "trade-delivery-schedule",
  "trade-popup-display",
  "trade-company-rotation",
  "trade-opportunity-publishing",
  "trade-duration-closing",
  "trade-worker-health",
  "trade-settlement",
  "trade-admin-guide",
] as const;
