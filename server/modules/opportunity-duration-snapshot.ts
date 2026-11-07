export const MIN_OPPORTUNITY_DURATION_SECONDS = 10;
export const MAX_OPPORTUNITY_DURATION_SECONDS = 86_400;
export const MAX_COMPLETION_DISPLAY_SECONDS = 3_600;

export type ValidatedOpportunityDurationSnapshot = {
  minimumTradeDurationSeconds: number;
  maximumTradeDurationSeconds: number;
  configuredDurationSeconds: number;
  completionDisplaySeconds: number;
  generatedAtMs: number;
  rewardAtMs: number;
  closesAtMs: number;
};

type OpportunityDurationTimestamps = {
  opensAt: unknown;
  rewardAt: unknown;
  closesAt: unknown;
  offerDurationSeconds: unknown;
  eventDurationSeconds: unknown;
  eventPopupDisplaySeconds: unknown;
};

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function timestampMilliseconds(value: unknown): number | null {
  let milliseconds: number;
  if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === "number") milliseconds = value;
  else if (typeof value === "string" && value.trim()) milliseconds = Date.parse(value);
  else return null;
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

// Package policy is read once when an opportunity is generated. Later admin edits
// must not be consulted when validating this persisted snapshot for allocation.
export function isOpportunityDurationWithinBounds(
  minimumTradeDurationSeconds: unknown,
  maximumTradeDurationSeconds: unknown,
  configuredDurationSeconds: unknown,
): boolean {
  return isIntegerInRange(minimumTradeDurationSeconds, MIN_OPPORTUNITY_DURATION_SECONDS, MAX_OPPORTUNITY_DURATION_SECONDS)
    && isIntegerInRange(maximumTradeDurationSeconds, minimumTradeDurationSeconds, MAX_OPPORTUNITY_DURATION_SECONDS)
    && isIntegerInRange(configuredDurationSeconds, minimumTradeDurationSeconds, maximumTradeDurationSeconds);
}

function databaseSecond(milliseconds: number): number {
  // MySQL/MariaDB timestamp columns in this schema have whole-second precision.
  return Math.floor((milliseconds + 500) / 1_000) * 1_000;
}

export function validateOpportunityDurationSnapshot(
  rawSnapshot: unknown,
  timestamps: OpportunityDurationTimestamps,
): ValidatedOpportunityDurationSnapshot | null {
  if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) return null;
  const snapshot = rawSnapshot as Record<string, unknown>;
  const minimumTradeDurationSeconds = snapshot.minimumTradeDurationSeconds;
  const maximumTradeDurationSeconds = snapshot.maximumTradeDurationSeconds;
  const configuredDurationSeconds = snapshot.configuredDurationSeconds;
  const completionDisplaySeconds = snapshot.completionDisplaySeconds;
  if (!isOpportunityDurationWithinBounds(minimumTradeDurationSeconds, maximumTradeDurationSeconds, configuredDurationSeconds)
    || !isIntegerInRange(completionDisplaySeconds, 1, MAX_COMPLETION_DISPLAY_SECONDS)
    || !isIntegerInRange(timestamps.offerDurationSeconds, MIN_OPPORTUNITY_DURATION_SECONDS, MAX_OPPORTUNITY_DURATION_SECONDS)
    || !isIntegerInRange(timestamps.eventDurationSeconds, MIN_OPPORTUNITY_DURATION_SECONDS, MAX_OPPORTUNITY_DURATION_SECONDS)
    || !isIntegerInRange(timestamps.eventPopupDisplaySeconds, 1, MAX_OPPORTUNITY_DURATION_SECONDS + MAX_COMPLETION_DISPLAY_SECONDS)) return null;

  const generatedAtMs = timestampMilliseconds(snapshot.generatedAt);
  const opensAtMs = timestampMilliseconds(timestamps.opensAt);
  const rewardAtMs = timestampMilliseconds(timestamps.rewardAt);
  const closesAtMs = timestampMilliseconds(timestamps.closesAt);
  if (generatedAtMs === null || opensAtMs === null || rewardAtMs === null || closesAtMs === null) return null;
  if (timestamps.offerDurationSeconds !== configuredDurationSeconds || timestamps.eventDurationSeconds !== configuredDurationSeconds
    || timestamps.eventPopupDisplaySeconds !== configuredDurationSeconds + completionDisplaySeconds) return null;

  const expectedOpensAtMs = Math.floor(generatedAtMs / 1_000) * 1_000;
  const expectedRewardAtMs = databaseSecond(generatedAtMs + configuredDurationSeconds * 1_000);
  const expectedClosesAtMs = databaseSecond(generatedAtMs + (configuredDurationSeconds + completionDisplaySeconds) * 1_000);
  if (opensAtMs !== expectedOpensAtMs || rewardAtMs !== expectedRewardAtMs || closesAtMs !== expectedClosesAtMs
    || closesAtMs !== rewardAtMs + completionDisplaySeconds * 1_000) return null;

  return {
    minimumTradeDurationSeconds: minimumTradeDurationSeconds as number,
    maximumTradeDurationSeconds: maximumTradeDurationSeconds as number,
    configuredDurationSeconds,
    completionDisplaySeconds,
    generatedAtMs,
    rewardAtMs,
    closesAtMs,
  };
}
