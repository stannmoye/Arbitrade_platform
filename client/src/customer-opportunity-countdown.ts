function timestampMilliseconds(value: unknown): number | null {
  let milliseconds: number;
  if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === "number") milliseconds = value;
  else if (typeof value === "string" && value.trim()) milliseconds = Date.parse(value);
  else return null;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function remainingOpportunityMilliseconds(
  closesAt: unknown,
  nowMilliseconds: number,
  serverClockOffsetMilliseconds = 0,
): number | null {
  const closesAtMilliseconds = timestampMilliseconds(closesAt);
  if (closesAtMilliseconds === null || !Number.isFinite(nowMilliseconds) || !Number.isFinite(serverClockOffsetMilliseconds)) return null;
  return Math.max(0, closesAtMilliseconds - (nowMilliseconds + serverClockOffsetMilliseconds));
}

export function remainingOpportunitySeconds(
  closesAt: unknown,
  nowMilliseconds: number,
  serverClockOffsetMilliseconds = 0,
): number | null {
  const remaining = remainingOpportunityMilliseconds(closesAt, nowMilliseconds, serverClockOffsetMilliseconds);
  return remaining === null ? null : Math.ceil(remaining / 1_000);
}
