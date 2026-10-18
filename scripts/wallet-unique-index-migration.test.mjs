import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import {
  ensureCustomerBalanceUniqueIndex,
  WALLET_UNIQUE_INDEX_NAME,
} from "./wallet-unique-index-migration.mjs";

describe("ensureCustomerBalanceUniqueIndex", () => {
  it("leaves an existing unique index unchanged", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[{ Key_name: WALLET_UNIQUE_INDEX_NAME }], []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureCustomerBalanceUniqueIndex(connection)).resolves.toEqual({
      created: false,
      reason: "index already exists",
    });
    expect(statements).toHaveLength(1);
  });

  it("fails closed when duplicate user/currency wallet rows exist", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT userId,currency")) return [[{ userId: 7, currency: "USD" }], []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureCustomerBalanceUniqueIndex(connection)).rejects.toThrow(
      /duplicate customer wallet rows require manual reconciliation/,
    );
    expect(statements.some(({ sql }) => sql.startsWith("ALTER TABLE"))).toBe(false);
  });

  it("adds the unique index only after confirming there are no duplicates", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT userId,currency")) return [[], []];
        if (sql.startsWith("ALTER TABLE")) return [{ affectedRows: 0 }, []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureCustomerBalanceUniqueIndex(connection)).resolves.toEqual({
      created: true,
      reason: "index created",
    });
    expect(statements.map(({ sql }) => sql.split(" ")[0])).toEqual(["SHOW", "SELECT", "ALTER"]);
  });
});


const walletDatabaseUrl = process.env.WALLET_TEST_DATABASE_URL;
const databaseDescribe = walletDatabaseUrl ? describe : describe.skip;

databaseDescribe("wallet unique-index migration against disposable MySQL", () => {
  it("refuses duplicate rows without deleting them, then creates the index after reconciliation", async () => {
    const connection = await mysql.createConnection(walletDatabaseUrl);
    const testUserId = 1900000000;
    const testCurrency = "MIGTEST";
    try {
      const [indexes] = await connection.query(
        "SHOW INDEX FROM customer_balances WHERE Key_name=?",
        [WALLET_UNIQUE_INDEX_NAME],
      );
      if (indexes.length) {
        await connection.query("ALTER TABLE customer_balances DROP INDEX uq_customer_balance_user_currency");
      }

      await connection.execute(
        `INSERT INTO customer_balances (userId, currency, availableMinor, promotionalMinor, earnedMinor)
         VALUES (?, ?, 10, 10, 0), (?, ?, 20, 20, 0)`,
        [testUserId, testCurrency, testUserId, testCurrency],
      );

      await expect(ensureCustomerBalanceUniqueIndex(connection)).rejects.toThrow(
        /duplicate customer wallet rows require manual reconciliation/,
      );
      const [duplicateRows] = await connection.execute(
        "SELECT id FROM customer_balances WHERE userId=? AND currency=?",
        [testUserId, testCurrency],
      );
      expect(duplicateRows).toHaveLength(2);

      await connection.execute(
        "DELETE FROM customer_balances WHERE userId=? AND currency=?",
        [testUserId, testCurrency],
      );
      await expect(ensureCustomerBalanceUniqueIndex(connection)).resolves.toMatchObject({
        created: true,
      });
      const [restoredIndexes] = await connection.query(
        "SHOW INDEX FROM customer_balances WHERE Key_name=?",
        [WALLET_UNIQUE_INDEX_NAME],
      );
      expect(restoredIndexes.length).toBeGreaterThan(0);
    } finally {
      await connection.execute(
        "DELETE FROM customer_balances WHERE userId=? AND currency=?",
        [testUserId, testCurrency],
      );
      const [indexes] = await connection.query(
        "SHOW INDEX FROM customer_balances WHERE Key_name=?",
        [WALLET_UNIQUE_INDEX_NAME],
      );
      if (!indexes.length) await ensureCustomerBalanceUniqueIndex(connection);
      await connection.end();
    }
  }, 30_000);
});
