/** Auto-trading is enabled only after an explicit customer/admin opt-in. */
export function isCustomerAutoTradeExplicitlyEnabled(mode: unknown): boolean {
  return mode === "enabled";
}
