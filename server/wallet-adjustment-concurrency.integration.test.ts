import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.WALLET_TEST_DATABASE_URL;
const walletDescribe = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replace(/-/g, "");
const balancesTable = `wallet_concurrency_balances_${suffix}`;
const ledgerTable = `wallet_concurrency_ledger_${suffix}`;
let pool: mysql.Pool | undefined;

walletDescribe("wallet SQL concurrency integration (disposable MySQL)", () => {
  beforeAll(async () => {
    pool = mysql.createPool(databaseUrl!);
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE ${balancesTable} (
          id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
          userId BIGINT UNSIGNED NOT NULL,
          currency VARCHAR(12) NOT NULL,
          availableMinor BIGINT NOT NULL,
          promotionalMinor BIGINT NOT NULL DEFAULT 0,
          UNIQUE KEY uq_wallet_user_currency (userId, currency)
        ) ENGINE=InnoDB
      `);
      await connection.query(`
        CREATE TABLE ${ledgerTable} (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          userId BIGINT UNSIGNED NOT NULL,
          currency VARCHAR(12) NOT NULL,
          amountMinor BIGINT NOT NULL,
          CONSTRAINT chk_wallet_ledger_nonzero CHECK (amountMinor <> 0)
        ) ENGINE=InnoDB
      `);
    } finally {
      connection.release();
    }
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    const connection = await pool.getConnection();
    try {
      await connection.query(`DROP TABLE IF EXISTS ${ledgerTable}`);
      await connection.query(`DROP TABLE IF EXISTS ${balancesTable}`);
    } finally {
      connection.release();
      await pool.end();
    }
  }, 30_000);

  async function resetBalance(availableMinor: number) {
    const connection = await pool!.getConnection();
    try {
      await connection.query(`DELETE FROM ${ledgerTable}`);
      await connection.query(`DELETE FROM ${balancesTable}`);
      await connection.query(
        `INSERT INTO ${balancesTable} (id, userId, currency, availableMinor, promotionalMinor) VALUES (1, 7001, 'USD', ?, 0)`,
        [availableMinor],
      );
    } finally {
      connection.release();
    }
  }

  async function debit(amountMinor: number) {
    const connection = await pool!.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        `UPDATE ${balancesTable}
         SET availableMinor = availableMinor - ?
         WHERE id = 1 AND availableMinor >= ?`,
        [amountMinor, amountMinor],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `INSERT INTO ${ledgerTable} (userId, currency, amountMinor) VALUES (7001, 'USD', ?)`,
        [-amountMinor],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function credit(amountMinor: number) {
    const connection = await pool!.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        `UPDATE ${balancesTable}
         SET availableMinor = availableMinor + ?, promotionalMinor = promotionalMinor + ?
         WHERE id = 1
           AND availableMinor <= ?
           AND promotionalMinor <= ?`,
        [amountMinor, amountMinor, Number.MAX_SAFE_INTEGER - amountMinor, Number.MAX_SAFE_INTEGER - amountMinor],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `INSERT INTO ${ledgerTable} (userId, currency, amountMinor) VALUES (7001, 'USD', ?)`,
        [amountMinor],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function snapshot() {
    const connection = await pool!.getConnection();
    try {
      const [balances] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT availableMinor, promotionalMinor FROM ${balancesTable} WHERE id = 1`,
      );
      const [ledger] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS entryCount, COALESCE(SUM(amountMinor), 0) AS ledgerTotal FROM ${ledgerTable}`,
      );
      return {
        availableMinor: Number(balances[0].availableMinor),
        promotionalMinor: Number(balances[0].promotionalMinor),
        entryCount: Number(ledger[0].entryCount),
        ledgerTotal: Number(ledger[0].ledgerTotal),
      };
    } finally {
      connection.release();
    }
  }

  it("serializes competing debits and reconciles accepted ledger entries", async () => {
    await resetBalance(100);
    const outcomes = await Promise.all(Array.from({ length: 20 }, () => debit(10)));
    const state = await snapshot();

    expect(outcomes.filter(Boolean)).toHaveLength(10);
    expect(state.availableMinor).toBe(0);
    expect(state.entryCount).toBe(10);
    expect(state.ledgerTotal).toBe(-100);
    expect(100 + state.ledgerTotal).toBe(state.availableMinor);
  }, 30_000);

  it("serializes competing credits and reconciles the ledger to the final balance", async () => {
    await resetBalance(0);
    const outcomes = await Promise.all(Array.from({ length: 20 }, () => credit(10)));
    const state = await snapshot();

    expect(outcomes.every(Boolean)).toBe(true);
    expect(state.availableMinor).toBe(200);
    expect(state.promotionalMinor).toBe(200);
    expect(state.entryCount).toBe(20);
    expect(state.ledgerTotal).toBe(200);
    expect(state.ledgerTotal).toBe(state.availableMinor);
  }, 30_000);


  it("rolls back a balance change when the ledger write fails", async () => {
    await resetBalance(50);
    const connection = await pool!.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE ${balancesTable} SET availableMinor = availableMinor - 10 WHERE id = 1 AND availableMinor >= 10`,
      );
      await expect(
        connection.execute(
          `INSERT INTO ${ledgerTable} (userId, currency, amountMinor) VALUES (7001, 'USD', 0)`,
        ),
      ).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      await connection.rollback();
    } finally {
      connection.release();
    }

    const state = await snapshot();
    expect(state.availableMinor).toBe(50);
    expect(state.entryCount).toBe(0);
    expect(state.ledgerTotal).toBe(0);
  }, 30_000);

  it("enforces one wallet per user and currency at the database layer", async () => {
    await resetBalance(1);
    const connection = await pool!.getConnection();
    try {
      await expect(
        connection.execute(
          `INSERT INTO ${balancesTable} (id, userId, currency, availableMinor, promotionalMinor) VALUES (2, 7001, 'USD', 5, 5)`,
        ),
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    } finally {
      connection.release();
    }
  }, 30_000);
});
