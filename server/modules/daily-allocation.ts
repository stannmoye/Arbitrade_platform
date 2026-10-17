export type DailyAllocationInput = {
  limitMinor: number;
  alreadyAllocatedMinor: number;
  requestedMinor: number;
};

/**
 * A zero, negative, fractional, or unsafe limit fails closed. The caller passes
 * amounts denominated in the same currency's minor units.
 */
export function isWithinDailyAllocationLimit(input: DailyAllocationInput): boolean {
  const { limitMinor, alreadyAllocatedMinor, requestedMinor } = input;
  if (
    !Number.isSafeInteger(limitMinor) ||
    !Number.isSafeInteger(alreadyAllocatedMinor) ||
    !Number.isSafeInteger(requestedMinor) ||
    limitMinor <= 0 ||
    alreadyAllocatedMinor < 0 ||
    requestedMinor <= 0
  ) {
    return false;
  }
  return alreadyAllocatedMinor <= limitMinor && requestedMinor <= limitMinor - alreadyAllocatedMinor;
}
