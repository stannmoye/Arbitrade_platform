import { describe, expect, it } from "vitest";
import {
  isRetryableMySqlTransactionError,
  mysqlTransactionRetryDelayMs,
  MYSQL_TRANSACTION_RETRY_BASE_DELAY_MS,
  MYSQL_TRANSACTION_RETRY_JITTER_MS,
  MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS,
  MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS,
} from "./mysql-transaction-retry";

describe("MySQL transaction retry policy", () => {
  it("classifies MySQL and MariaDB deadlock and lock-wait errors, including wrapped errors", () => {
    expect(isRetryableMySqlTransactionError({ code: "ER_LOCK_DEADLOCK" })).toBe(
      true
    );
    expect(isRetryableMySqlTransactionError({ errno: 1205 })).toBe(true);
    expect(
      isRetryableMySqlTransactionError({
        code: "ER_WRAPPER",
        cause: { code: "ER_LOCK_WAIT_TIMEOUT" },
      })
    ).toBe(true);
    expect(
      isRetryableMySqlTransactionError({
        code: "ER_QUERY_TIMEOUT",
        errno: 3024,
      })
    ).toBe(false);
  });

  it("does not retry business errors or cyclic unknown causes", () => {
    expect(
      isRetryableMySqlTransactionError(new Error("duplicate delivery"))
    ).toBe(false);
    const cyclic: { code: string; cause?: unknown } = { code: "ER_WRAPPER" };
    cyclic.cause = cyclic;
    expect(isRetryableMySqlTransactionError(cyclic)).toBe(false);
  });

  it("keeps exponential jitter bounded and caps the transaction attempts", () => {
    expect(MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS).toBe(3);
    expect(mysqlTransactionRetryDelayMs(1, () => 0)).toBe(
      MYSQL_TRANSACTION_RETRY_BASE_DELAY_MS
    );
    expect(mysqlTransactionRetryDelayMs(1, () => 1)).toBe(
      MYSQL_TRANSACTION_RETRY_BASE_DELAY_MS + MYSQL_TRANSACTION_RETRY_JITTER_MS
    );
    expect(mysqlTransactionRetryDelayMs(99, () => 1)).toBe(
      MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS
    );
    expect(mysqlTransactionRetryDelayMs(99, () => 0)).toBeLessThanOrEqual(
      MYSQL_TRANSACTION_RETRY_MAX_DELAY_MS
    );
  });
});
