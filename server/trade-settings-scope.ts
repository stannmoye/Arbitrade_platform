export const globalTradePolicyFields = ["enabled", "automaticDelivery"] as const;
export type GlobalTradePolicyField = (typeof globalTradePolicyFields)[number];

/**
 * Package Settings mutations must contain tier terms only. Global delivery
 * gates have their own Package Configuration owner and must not be smuggled
 * into a package create/update payload or persisted as a second source.
 */
export function assertPackageTermsPayload(payload: Record<string, unknown>) {
  for (const field of globalTradePolicyFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`Global Trade Setting '${field}' belongs to Package Configuration, not Package Settings`);
    }
  }
  return true;
}

export function hasGlobalTradePolicyField(payload: Record<string, unknown>) {
  return globalTradePolicyFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}
