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
