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

/**
 * First owner-registry increment for settings/actions isolated by the blueprint.
 * This intentionally documents the current per-package storage of delivery
 * switches; it does not assert that these switches are a canonical global row.
 */
export const tradeSettingsOwnershipRegistry: readonly TradeSettingsOwnerDefinition[] = [
  {
    key: "trade.allocationGate.paused",
    scope: "global",
    ownerRoute: "trade-package-configuration",
    section: "allocation-safety",
    label: "New trading allocations",
    explanation: "Pause only new trade reservations and allocations; existing records remain available for review and reconciliation.",
    units: "boolean",
    validation: "Must be an explicit boolean; resume/pause requires an administrator reason.",
    saveMutation: "adminOperations.updateTradeAllocationControls",
    readQuery: "adminOperations.tradeAllocationControls",
    auditRequirement: "Actor, reason, previous/new state, timestamp and saved-state read-back.",
    effectiveTime: "Future allocation attempts; never rewrites an existing trade.",
    runtimeConsumer: "server/db.ts createTrade allocation gate.",
    customerImpact: "Blocks new allocations when paused; does not remove informational opportunities or settle existing trades.",
    risk: "high",
    availability: "available",
  },
  {
    key: "trade.package.tierPolicyEnabled",
    scope: "package",
    ownerRoute: "trade-package-configuration",
    section: "package-policy-controls",
    label: "Tier policy",
    explanation: "Enable or pause this package's persisted tier policy.",
    units: "boolean per package",
    validation: "Boolean; package readiness is required only when transitioning from disabled to enabled.",
    saveMutation: "adminOperations.updatePackagePolicies",
    readQuery: "adminOperations.packagePolicies",
    auditRequirement: "Actor, required reason, previous/new policy values and incremented policy version.",
    effectiveTime: "Future eligibility/delivery decisions; existing entitlement and opportunity snapshots remain unchanged.",
    runtimeConsumer: "Persisted opportunity package policy checks in the server delivery worker.",
    customerImpact: "Affects eligibility/delivery under this package only.",
    risk: "high",
    availability: "available",
  },
  {
    key: "trade.package.popupDeliveryEnabled",
    scope: "package",
    ownerRoute: "trade-package-configuration",
    section: "package-policy-controls",
    label: "Pop-up delivery",
    explanation: "Allow or pause new informational opportunity delivery for this package.",
    units: "boolean per package",
    validation: "Boolean; automatic financial execution remains separately hard-disabled.",
    saveMutation: "adminOperations.updatePackagePolicies",
    readQuery: "adminOperations.packagePolicies",
    auditRequirement: "Actor, required reason, previous/new policy values and incremented policy version.",
    effectiveTime: "Future delivery decisions; already persisted customer events remain durable.",
    runtimeConsumer: "Persisted opportunity package policy checks in the server delivery worker.",
    customerImpact: "Controls informational pop-up delivery for this package; creates no offer or wallet movement.",
    risk: "high",
    availability: "available",
  },
  {
    key: "trade.package.companyRotationEnabled",
    scope: "package",
    ownerRoute: "trade-package-configuration",
    section: "package-policy-controls",
    label: "Company rotation",
    explanation: "Allow approved catalogue identities to be attached to eligible informational opportunities for this package.",
    units: "boolean per package",
    validation: "Boolean; customer identities still require the currently approved catalogue pool.",
    saveMutation: "adminOperations.updatePackagePolicies",
    readQuery: "adminOperations.packagePolicies",
    auditRequirement: "Actor, required reason, previous/new policy values and incremented policy version.",
    effectiveTime: "Future identity selection; existing historical snapshots are immutable.",
    runtimeConsumer: "Server-side approved company catalogue and rotation path.",
    customerImpact: "May add an approved reference identity; never proves listing, execution or profit.",
    risk: "medium",
    availability: "available",
  },
  {
    key: "trade.package.randomizedTimingEnabled",
    scope: "package",
    ownerRoute: "trade-package-configuration",
    section: "package-policy-controls",
    label: "Randomized timing",
    explanation: "Use the persisted package's configured deterministic timing bounds rather than always choosing the minimum interval.",
    units: "boolean per package",
    validation: "Boolean; selected intervals remain inside saved limits.",
    saveMutation: "adminOperations.updatePackagePolicies",
    readQuery: "adminOperations.packagePolicies",
    auditRequirement: "Actor, required reason, previous/new policy values and incremented policy version.",
    effectiveTime: "Future delivery deadlines only; already persisted deadlines are not reset.",
    runtimeConsumer: "Server opportunity delivery schedule.",
    customerImpact: "Changes when a future informational event may be delivered; it does not generate opportunities.",
    risk: "medium",
    availability: "available",
  },
  {
    key: "trade.package.burstDeliveryEnabled",
    scope: "package",
    ownerRoute: "trade-package-configuration",
    section: "package-policy-controls",
    label: "Burst delivery",
    explanation: "Permit the existing bounded multi-item delivery batch for this package.",
    units: "boolean per package",
    validation: "Boolean; the configured maximum burst size remains bounded.",
    saveMutation: "adminOperations.updatePackagePolicies",
    readQuery: "adminOperations.packagePolicies",
    auditRequirement: "Actor, required reason, previous/new policy values and incremented policy version.",
    effectiveTime: "Future worker cycles only.",
    runtimeConsumer: "Server opportunity delivery worker.",
    customerImpact: "May change the number of eligible informational items in a worker cycle; does not bypass quotas or create offers.",
    risk: "medium",
    availability: "available",
  },
  {
    key: "trade.automaticFinancialExecution",
    scope: "global",
    ownerRoute: "trade-package-configuration",
    section: "execution-safety-status",
    label: "Automatic financial execution",
    explanation: "Status is locked OFF by the backend release guard.",
    units: "locked boolean",
    validation: "No administrator write is permitted by this feature.",
    saveMutation: null,
    readQuery: "server/db.ts AUTOMATIC_FINANCIAL_EXECUTION_ENABLED constant and persisted policy status",
    auditRequirement: "Not editable; any future release requires separate safety review and release gate.",
    effectiveTime: "Not available.",
    runtimeConsumer: "Server execution guard; it must continue to reject automatic execution.",
    customerImpact: "Informational pop-ups may still be delivered; no automatic allocation or settlement is enabled.",
    risk: "locked",
    availability: "locked",
  },
] as const;

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
