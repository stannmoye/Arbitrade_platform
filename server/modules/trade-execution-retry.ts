export type TradeExecutionRetryDecision =
  | { kind: "retry"; attemptNumber: number; retryAt: Date; errorCode: string }
  | { kind: "failed"; attemptNumber: number; errorCode: string };

const RETRYABLE_CODES = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "POOL_CONNLIMIT",
]);

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").toUpperCase();
    if (/^[A-Z0-9_]{1,80}$/.test(code)) return code;
  }
  return "TRADE_ALLOCATION_REJECTED";
}

/**
 * Only known transient infrastructure failures are retried. Business-rule,
 * entitlement, balance, and policy rejections fail closed instead of looping.
 * failedAttempts is the durable attempt count after the failed attempt.
 */
export function decideTradeExecutionRetry(
  error: unknown,
  failedAttempts: number,
  maxAttempts: number,
  now: Date = new Date(),
  retryDelaySeconds = 30,
): TradeExecutionRetryDecision {
  if (!Number.isSafeInteger(failedAttempts) || failedAttempts < 1 ||
      !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
      !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(retryDelaySeconds) || retryDelaySeconds < 1) {
    throw new Error("Invalid trade execution retry policy inputs");
  }

  let code = errorCodeOf(error);
  const message = error instanceof Error ? error.message : "";
  const transientMessage = /temporarily unavailable|connection (?:reset|lost|closed)|socket hang up|deadlock|lock wait timeout|timed out|try again later/i.test(message);
  if (transientMessage && code === "TRADE_ALLOCATION_REJECTED") code = "TEMPORARY_EXECUTION_FAILURE";
  if (!RETRYABLE_CODES.has(code) && !transientMessage) {
    return { kind: "failed", attemptNumber: failedAttempts, errorCode: code };
  }
  if (failedAttempts >= maxAttempts) {
    return { kind: "failed", attemptNumber: failedAttempts, errorCode: "TEMPORARY_EXECUTION_RETRIES_EXHAUSTED" };
  }
  return {
    kind: "retry",
    attemptNumber: failedAttempts,
    retryAt: new Date(now.getTime() + retryDelaySeconds * 1000),
    errorCode: code,
  };
}
