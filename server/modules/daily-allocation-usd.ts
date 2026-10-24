export type NativeAllocationAmount = { minor: number; scale: number; usdRate: number };
export type UsdDailyAllocationInput = { limitUsdMinor: number; alreadyAllocated: NativeAllocationAmount[]; requested: NativeAllocationAmount };

/** Enforces one daily cap across assets in USD cents. Invalid FX metadata fails closed. */
export function isWithinUsdDailyAllocationLimit(input: UsdDailyAllocationInput): boolean {
  if (!Number.isSafeInteger(input.limitUsdMinor) || input.limitUsdMinor <= 0) return false;
  let totalUsdMinor = 0;
  for (const item of [...input.alreadyAllocated, input.requested]) {
    if (!Number.isSafeInteger(item.minor) || item.minor < 0 || !Number.isInteger(item.scale) || item.scale < 0 || item.scale > 12 || !Number.isFinite(item.usdRate) || item.usdRate <= 0) return false;
    const amountUsdMinor = Math.round((item.minor / Math.pow(10, item.scale)) * item.usdRate * 100);
    if (!Number.isSafeInteger(amountUsdMinor) || amountUsdMinor < 0) return false;
    totalUsdMinor += amountUsdMinor;
    if (!Number.isSafeInteger(totalUsdMinor) || totalUsdMinor > input.limitUsdMinor) return false;
  }
  return true;
}