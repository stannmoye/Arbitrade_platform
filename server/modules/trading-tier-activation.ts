/**
 * Policy readiness is an activation precondition, not an edit precondition.
 * Existing enabled tiers with an incomplete/paused policy remain fail-closed
 * for delivery, but administrators must still be able to save their tier terms.
 */
export function isTradingTierEnablingTransition(currentEnabled: boolean, requestedEnabled: boolean): boolean {
  return !currentEnabled && requestedEnabled;
}
