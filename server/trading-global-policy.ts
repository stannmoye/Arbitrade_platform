export const TRADE_GLOBAL_CONTROL_SETTINGS_KEY = "trade.globalControls";
export const TRADE_GLOBAL_CONTROL_MIGRATION_DIAGNOSTIC_KEY = "trade.globalControls.migrationDiagnostic";

export const TRADE_GLOBAL_MASTER_KEYS = [
  "tierPolicyMasterEnabled",
  "informationalPopupDeliveryEnabled",
  "companyRotationEnabled",
  "randomizedTimingEnabled",
  "burstDeliveryEnabled",
  "requirePreviousSettlement",
] as const;

export type TradeGlobalMasterKey = typeof TRADE_GLOBAL_MASTER_KEYS[number];
export type TradeGlobalMasterValues = Record<TradeGlobalMasterKey, boolean>;
export type TradeGlobalControlPolicy = TradeGlobalMasterValues & {
  policyVersion: number;
  updatedBy: number | null;
  updatedAt: string | null;
};
export type TradeGlobalControlStatus = TradeGlobalControlPolicy & {
  available: boolean;
  migrationDiagnostic: Record<string, unknown> | null;
};

export const FAIL_CLOSED_TRADE_GLOBAL_CONTROLS: TradeGlobalMasterValues = {
  tierPolicyMasterEnabled: false,
  informationalPopupDeliveryEnabled: false,
  companyRotationEnabled: false,
  randomizedTimingEnabled: false,
  burstDeliveryEnabled: false,
  requirePreviousSettlement: true,
};

export type LegacyPackageControlRow = {
  packageName: string;
  policyEnabled: boolean;
  automaticDelivery: boolean;
  companyRotationEnabled: boolean;
  randomizationEnabled: boolean;
  burstEnabled: boolean;
  requirePreviousSettlement: boolean;
};

export type LegacyControlMigrationPreview = {
  policy: TradeGlobalMasterValues;
  sourcePolicyCount: number;
  offPackages: Record<TradeGlobalMasterKey, string[]>;
  conflicts: Record<TradeGlobalMasterKey, boolean>;
};

/**
 * Mirrors migration 0100's restrictive precedence. An existing false on any
 * legacy copy keeps the corresponding global master OFF until an
 * administrator explicitly changes it. Package lifecycle `packages.enabled`
 * remains a separate per-tier gate. The previous-settlement prerequisite is
 * seeded ON globally; only an authorized, reasoned global-policy update may
 * change it after migration.
 */
export function previewLegacyTradeGlobalControls(rows: readonly LegacyPackageControlRow[]): LegacyControlMigrationPreview {
  const deliveryKeys = [
    ["informationalPopupDeliveryEnabled", "automaticDelivery"],
    ["companyRotationEnabled", "companyRotationEnabled"],
    ["randomizedTimingEnabled", "randomizationEnabled"],
    ["burstDeliveryEnabled", "burstEnabled"],
  ] as const;
  const policy: TradeGlobalMasterValues = {
    tierPolicyMasterEnabled: rows.length > 0 && rows.every(row => row.policyEnabled === true),
    informationalPopupDeliveryEnabled: rows.length > 0 && rows.every(row => row.automaticDelivery === true),
    companyRotationEnabled: rows.length > 0 && rows.every(row => row.companyRotationEnabled === true),
    randomizedTimingEnabled: rows.length > 0 && rows.every(row => row.randomizationEnabled === true),
    burstDeliveryEnabled: rows.length > 0 && rows.every(row => row.burstEnabled === true),
    requirePreviousSettlement: true,
  };
  const offPackages = {} as LegacyControlMigrationPreview["offPackages"];
  const conflicts = {} as LegacyControlMigrationPreview["conflicts"];
  offPackages.tierPolicyMasterEnabled = rows.filter(row => row.policyEnabled === false).map(row => row.packageName).sort();
  conflicts.tierPolicyMasterEnabled = rows.some(row => row.policyEnabled === false) && rows.some(row => row.policyEnabled === true);
  for (const [masterKey, legacyKey] of deliveryKeys) {
    offPackages[masterKey] = rows.filter(row => row[legacyKey] === false).map(row => row.packageName).sort();
    conflicts[masterKey] = rows.some(row => row[legacyKey] === false) && rows.some(row => row[legacyKey] === true);
  }
  offPackages.requirePreviousSettlement = rows.filter(row => row.requirePreviousSettlement === false).map(row => row.packageName).sort();
  conflicts.requirePreviousSettlement = rows.some(row => row.requirePreviousSettlement === false) && rows.some(row => row.requirePreviousSettlement === true);
  return { policy, sourcePolicyCount: rows.length, offPackages, conflicts };
}

export function parseTradeGlobalControlPolicy(raw: unknown): TradeGlobalControlPolicy | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (TRADE_GLOBAL_MASTER_KEYS.some(key => typeof record[key] !== "boolean")) return null;
  const policyVersion = Number(record.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) return null;
  const updatedBy = record.updatedBy === null || record.updatedBy === undefined ? null : Number(record.updatedBy);
  if (updatedBy !== null && (!Number.isSafeInteger(updatedBy) || updatedBy < 1)) return null;
  const updatedAt = record.updatedAt === null || record.updatedAt === undefined ? null : String(record.updatedAt);
  return {
    tierPolicyMasterEnabled: record.tierPolicyMasterEnabled as boolean,
    informationalPopupDeliveryEnabled: record.informationalPopupDeliveryEnabled as boolean,
    companyRotationEnabled: record.companyRotationEnabled as boolean,
    randomizedTimingEnabled: record.randomizedTimingEnabled as boolean,
    burstDeliveryEnabled: record.burstDeliveryEnabled as boolean,
    requirePreviousSettlement: record.requirePreviousSettlement as boolean,
    policyVersion,
    updatedBy,
    updatedAt,
  };
}

/**
 * Missing or malformed global policy fails closed. A valid saved OFF value
 * bypasses only the prior-unsettled-trade prerequisite for future allocations.
 */
export function requiresPreviousSettlementForAllocation(
  policy: Pick<TradeGlobalControlPolicy, "requirePreviousSettlement"> | null | undefined,
): boolean {
  return policy == null || policy.requirePreviousSettlement;
}
