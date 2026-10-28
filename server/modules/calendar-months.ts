/** Add calendar months while clamping to the last valid day of the target month. */
export function addCalendarMonths(from: Date, months: number): Date {
  if (!Number.isFinite(from.getTime()) || !Number.isSafeInteger(months) || months < 1 || months > 1200) {
    throw new RangeError("A valid entitlement start time and duration of 1–1200 calendar months are required");
  }
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
