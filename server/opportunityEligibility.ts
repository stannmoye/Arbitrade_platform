export type CustomerOpportunityEligibilityInput = {
  enabled: boolean;
  allowedAssets: string | null | undefined;
  currency: string;
  symbol?: string | null;
  rewardBps: number;
  minimumRewardBps: number;
};

/**
 * Applies explicit customer opportunity preferences before an offer can be
 * delivered or considered for automatic trading. Empty asset lists fail closed.
 */
export function isCustomerOpportunityAllowed(input: CustomerOpportunityEligibilityInput): boolean {
  if (input.enabled !== true) return false;

  const allowed = new Set(
    String(input.allowedAssets ?? "")
      .split(",")
      .map((asset) => asset.trim().toUpperCase())
      .filter(Boolean),
  );
  const currency = String(input.currency ?? "").trim().toUpperCase();
  const symbol = String(input.symbol ?? "").trim().toUpperCase();

  if (!allowed.size || (!allowed.has(currency) && (!symbol || !allowed.has(symbol)))) {
    return false;
  }

  const rewardBps = Number(input.rewardBps);
  const minimumRewardBps = Number(input.minimumRewardBps);
  if (!Number.isFinite(rewardBps) || !Number.isFinite(minimumRewardBps)) return false;
  return rewardBps >= minimumRewardBps;
}

/**
 * Quiet hours suppress popup delivery, not automatic execution of an otherwise
 * eligible opportunity. Equal start/end values mean quiet hours are disabled.
 */
export function isWithinQuietHours(now: Date, start: string, end: string): boolean {
  const toMinutes = (value: string): number => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
    if (!match) return -1;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return -1;
    return hours * 60 + minutes;
  };

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes < 0 || endMinutes < 0 || startMinutes === endMinutes) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
