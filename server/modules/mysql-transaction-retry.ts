const MYSQL_DEADLOCK_CODES = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

export const MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS = 3;
export const MYSQL_TRANSACTION_RETRY_BASE_DELAY_MS = 25;
export const MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS = 250;
export const MYSQL_TRANSACTION_RETRY_JITTER_MS = 25;

type RetryError = {
  code?: unknown;
  errno?: unknown;
  cause?: unknown;
};

function isRetryableErrorCode(error: RetryError): boolean {
  const code = String(error.code ?? "").toUpperCase();
  return (
    MYSQL_DEADLOCK_CODES.has(code) ||
    error.errno === 1205 ||
    error.errno === 1213
  );
}

/**
 * Retry only the transient InnoDB deadlock/lock-wait errors emitted by MySQL
 * and MariaDB. Business, validation, and unknown database errors fail closed.
 */
export function isRetryableMySqlTransactionError(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (current === null || typeof current !== "object" || visited.has(current))
      return false;
    visited.add(current);
    if (isRetryableErrorCode(current as RetryError)) return true;
    current = (current as RetryError).cause;
  }
  return false;
}

/** Return a bounded delay for the failed attempt number (1-based). */
export function mysqlTransactionRetryDelayMs(
  failedAttempt: number,
  random = Math.random
): number {
  if (!Number.isSafeInteger(failedAttempt) || failedAttempt < 1) {
    throw new Error("Invalid MySQL transaction retry attempt");
  }
  const exponential = Math.min(
    MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS,
    MYSQL_TRANSACTION_RETRY_BASE_DELAY_MS * 2 ** (failedAttempt - 1)
  );
  const jitter = Math.floor(
    Math.max(0, Math.min(1, random())) * MYSQL_TRANSACTION_RETRY_JITTER_MS
  );
  return Math.min(MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS, exponential + jitter);
}
