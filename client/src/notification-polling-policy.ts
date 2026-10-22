export const NOTIFICATION_POLL_BASE_INTERVAL_MS = 5_000;
export const NOTIFICATION_POLL_MAX_INTERVAL_MS = 60_000;

/**
 * Slow repeat polling after consecutive request failures without disabling the
 * durable-history fallback. TanStack Query still owns retry/reconnect behavior;
 * successful fetches reset fetchFailureCount and therefore restore the base rate.
 */
export function notificationPollingInterval(failureCount: number): number {
  const failures = Number.isFinite(failureCount)
    ? Math.max(0, Math.floor(failureCount))
    : 0;
  const exponent = Math.min(failures, 8);
  return Math.min(
    NOTIFICATION_POLL_BASE_INTERVAL_MS * 2 ** exponent,
    NOTIFICATION_POLL_MAX_INTERVAL_MS,
  );
}
