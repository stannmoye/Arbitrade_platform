export const CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE = "Activation date unavailable";

/** Formats persisted activation timestamps without exposing invalid dates in the customer portal. */
export function formatCustomerTradingPackageActivationDate(
  value: Date | string | number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE;
  }

  return date.toLocaleDateString();
}
