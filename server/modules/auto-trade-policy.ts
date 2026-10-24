export type CustomerAutoTradeMode = "inherit" | "enabled" | "disabled";

export type EffectiveAutoTradeInput = {
  /** Package-level setting can never be overridden by an account preference. */
  packageEnabled: boolean;
  /** Global setting is the default only for customers that inherit. */
  globalDefaultEnabled: boolean;
  customerMode: CustomerAutoTradeMode;
};

/**
 * Resolves the effective auto-trade switch shared by customer requests and
 * background cycles. Explicit customer overrides take precedence over the
 * global default, while the administrator's package-level kill switch wins.
 */
export function resolveEffectiveAutoTradeEnabled(input: EffectiveAutoTradeInput): boolean {
  if (!input.packageEnabled) return false;
  if (input.customerMode === "enabled") return true;
  if (input.customerMode === "disabled") return false;
  return input.globalDefaultEnabled;
}

/** UI query calls must not mutate wallet/trade state; only a scheduler opts in. */
export function shouldExecuteAutomaticTrades(options?: { executeAutomaticTrades?: boolean }): boolean {
  return options?.executeAutomaticTrades === true;
}