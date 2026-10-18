import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  beginMiningIdempotency,
  finishMiningIdempotency,
  inMiningTransaction,
  type Db,
} from "./mining-store";

const databaseUrl = process.env.MINING_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("Mining idempotency against real MySQL/MariaDB transactions", () => {
  const pool = databaseUrl ? mysql.createPool(databaseUrl) : null;

  beforeAll(async () => {
    if (!pool) throw new Error("MINING_TEST_DATABASE_URL is required for this integration suite");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS v5_idempotency_keys (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT NOT NULL,
        keyValue VARCHAR(220) NOT NULL,
        command VARCHAR(100) NOT NULL,
        resultJson LONGTEXT NULL,
        UNIQUE KEY uq_mining_idempotency_key (keyValue)
      ) ENGINE=InnoDB
    `);
    await pool.query("DELETE FROM v5_idempotency_keys");
  });

  afterAll(async () => {
    await pool?.query("DELETE FROM v5_idempotency_keys");
    await pool?.end();
  });

  it("serializes concurrent retries and returns the committed result to the second transaction", async () => {
    if (!pool) throw new Error("Missing database pool");
    const first = await pool.getConnection();
    const second = await pool.getConnection();
    const key = `mysql-race:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const expected = { conversionId: 731, status: "EXECUTED" };
    let secondEnteredReservation = false;
    let secondSettled = false;

    try {
      await first.beginTransaction();
      await expect(beginMiningIdempotency(first as unknown as Db, 42, key, "mining.swap.confirm"))
        .resolves.toBeNull();

      const retry = inMiningTransaction(second as unknown as Db, async () => {
        secondEnteredReservation = true;
        const prior = await beginMiningIdempotency(second as unknown as Db, 42, key, "mining.swap.confirm");
        if (prior) return { replayed: true, result: prior };
        await finishMiningIdempotency(second as unknown as Db, key, { unexpected: "second execution" });
        return { replayed: false };
      }).finally(() => { secondSettled = true; });

      // The second INSERT IGNORE must wait on the unique-key lock held by the first transaction.
      while (!secondEnteredReservation) await new Promise(resolve => setTimeout(resolve, 5));
      await new Promise(resolve => setTimeout(resolve, 75));
      expect(secondSettled).toBe(false);

      await finishMiningIdempotency(first as unknown as Db, key, expected);
      await first.commit();

      await expect(retry).resolves.toEqual({ replayed: true, result: expected });
      const [rows] = await pool.query<any[]>(
        "SELECT resultJson FROM v5_idempotency_keys WHERE keyValue=?",
        [key],
      );
      expect(JSON.parse(String(rows[0].resultJson))).toEqual(expected);
    } catch (error) {
      try { await first.rollback(); } catch { /* preserve the assertion/operation failure */ }
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("allows a safe retry when the transaction that reserved the key rolls back", async () => {
    if (!pool) throw new Error("Missing database pool");
    const first = await pool.getConnection();
    const retry = await pool.getConnection();
    const key = `mysql-rollback:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    try {
      await first.beginTransaction();
      await expect(beginMiningIdempotency(first as unknown as Db, 42, key, "mining.swap.confirm"))
        .resolves.toBeNull();
      await first.rollback();

      await retry.beginTransaction();
      await expect(beginMiningIdempotency(retry as unknown as Db, 42, key, "mining.swap.confirm"))
        .resolves.toBeNull();
      const result = { conversionId: 732, status: "EXECUTED" };
      await finishMiningIdempotency(retry as unknown as Db, key, result);
      await retry.commit();

      const [rows] = await pool.query<any[]>(
        "SELECT resultJson FROM v5_idempotency_keys WHERE keyValue=?",
        [key],
      );
      expect(JSON.parse(String(rows[0].resultJson))).toEqual(result);
    } finally {
      try { await first.rollback(); } catch { /* no open transaction is also valid */ }
      try { await retry.rollback(); } catch { /* no open transaction is also valid */ }
      first.release();
      retry.release();
    }
  });

  it("rejects the same committed key when reused for a different command", async () => {
    if (!pool) throw new Error("Missing database pool");
    const first = await pool.getConnection();
    const second = await pool.getConnection();
    const key = `mysql-command:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    try {
      await first.beginTransaction();
      await expect(beginMiningIdempotency(first as unknown as Db, 42, key, "mining.swap.confirm"))
        .resolves.toBeNull();
      await finishMiningIdempotency(first as unknown as Db, key, { conversionId: 733 });
      await first.commit();

      await expect(inMiningTransaction(second as unknown as Db, () =>
        beginMiningIdempotency(second as unknown as Db, 42, key, "mining.purchase.confirm"),
      )).rejects.toThrow(/different Mining action/i);
    } finally {
      try { await first.rollback(); } catch { /* no open transaction is also valid */ }
      first.release();
      second.release();
    }
  });
});
