import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import {
  ensureTradeSettlementReferenceUniqueIndex,
  TRADE_SETTLEMENT_REFERENCE_INDEX_NAME,
} from "./trade-settlement-reference-index.mjs";

describe("ensureTradeSettlementReferenceUniqueIndex", () => {
  it("leaves an existing settlement reference index unchanged", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[{ Key_name: TRADE_SETTLEMENT_REFERENCE_INDEX_NAME }], []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureTradeSettlementReferenceUniqueIndex(connection)).resolves.toEqual({
      created: false,
      reason: "index already exists",
    });
    expect(statements).toHaveLength(1);
  });

  it("fails closed when historical settlement references are duplicated", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT settlementReference")) return [[{ settlementReference: "duplicate-ref" }], []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureTradeSettlementReferenceUniqueIndex(connection)).rejects.toThrow(
      /duplicate settlement references require manual reconciliation/,
    );
    expect(statements.some(({ sql }) => sql.startsWith("ALTER TABLE"))).toBe(false);
  });

  it("adds the unique index after a clean duplicate preflight", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT settlementReference")) return [[], []];
        if (sql.startsWith("ALTER TABLE")) return [{ affectedRows: 0 }, []];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    await expect(ensureTradeSettlementReferenceUniqueIndex(connection)).resolves.toEqual({
      created: true,
      reason: "index created",
    });
    expect(statements.map(({ sql }) => sql.split(" ")[0])).toEqual(["SHOW", "SELECT", "ALTER"]);
  });
});

const databaseUrl = process.env.WALLET_TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

databaseDescribe("settlement reference migration against disposable MySQL-compatible database", () => {
  it("preserves duplicate historical references and only adds the index after reconciliation", async () => {
    const connection = await mysql.createConnection(databaseUrl);
    const testUserId = 1900000001;
    const testCurrency = "MIGTEST";
    const testReference = "DUPLICATE-MIGRATION-REFERENCE";
    try {
      const [indexes] = await connection.query(
        "SHOW INDEX FROM trade_positions WHERE Key_name=?",
        [TRADE_SETTLEMENT_REFERENCE_INDEX_NAME],
      );
      if (indexes.length) {
        await connection.query("ALTER TABLE trade_positions DROP INDEX uq_trade_settlement_reference");
      }

      await connection.execute(
        `INSERT INTO trade_positions
          (userId, offerId, currency, principalMinor, expectedRewardMinor, settlesAt, settlementReference)
         VALUES (?, 1, ?, 10, 0, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY), ?),
                (?, 1, ?, 20, 0, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY), ?)`,
        [testUserId, testCurrency, testReference, testUserId, testCurrency, testReference],
      );

      await expect(ensureTradeSettlementReferenceUniqueIndex(connection)).rejects.toThrow(
        /duplicate settlement references require manual reconciliation/,
      );
      const [duplicates] = await connection.execute(
        "SELECT id FROM trade_positions WHERE settlementReference=?",
        [testReference],
      );
      expect(duplicates).toHaveLength(2);

      await connection.execute("DELETE FROM trade_positions WHERE settlementReference=?", [testReference]);
      await expect(ensureTradeSettlementReferenceUniqueIndex(connection)).resolves.toMatchObject({ created: true });
      const [restored] = await connection.query(
        "SHOW INDEX FROM trade_positions WHERE Key_name=?",
        [TRADE_SETTLEMENT_REFERENCE_INDEX_NAME],
      );
      expect(restored.length).toBeGreaterThan(0);
    } finally {
      await connection.execute("DELETE FROM trade_positions WHERE settlementReference=?", [testReference]);
      const [indexes] = await connection.query(
        "SHOW INDEX FROM trade_positions WHERE Key_name=?",
        [TRADE_SETTLEMENT_REFERENCE_INDEX_NAME],
      );
      if (!indexes.length) await ensureTradeSettlementReferenceUniqueIndex(connection);
      await connection.end();
    }
  }, 30_000);
});
