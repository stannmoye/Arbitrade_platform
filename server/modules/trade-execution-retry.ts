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

function retryErrorMetadata(error: unknown): { code: string; transientMessage: boolean } {
  const codes: string[] = [];
  const messages: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  // Database and network clients sometimes wrap their original error in cause.
  // Inspect a bounded, cycle-safe chain but keep the retry allowlist unchanged.
  for (let depth = 0; depth < 8; depth += 1) {
    if (current === null || typeof current !== "object" || visited.has(current)) break;
    visited.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.message === "string") messages.push(record.message);
    if ("code" in record) {
      const code = String(record.code ?? "").toUpperCase();
      if (/^[A-Z0-9_]{1,80}$/.test(code)) codes.push(code);
    }
    current = record.cause;
  }

  return {
    code: codes.find(code => RETRYABLE_CODES.has(code)) ?? codes[0] ?? "TRADE_ALLOCATION_REJECTED",
    transientMessage: messages.some(message => /temporarily unavailable|connection (?:reset|lost|closed)|socket hang up|deadlock|lock wait timeout|timed out|try again later/i.test(message)),
  };
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

  const metadata = retryErrorMetadata(error);
  let code = metadata.code;
  if (metadata.transientMessage && code === "TRADE_ALLOCATION_REJECTED") code = "TEMPORARY_EXECUTION_FAILURE";
  if (!RETRYABLE_CODES.has(code) && !metadata.transientMessage) {
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
