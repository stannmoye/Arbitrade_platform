import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  beginMiningIdempotency,
  finishMiningIdempotency,
  inMiningTransaction,
  postMiningLedgerEntries,
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS v5_wallets (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        assetCode VARCHAR(32) NOT NULL,
        availableAmount VARCHAR(128) NOT NULL DEFAULT '0',
        lockedAmount VARCHAR(128) NOT NULL DEFAULT '0',
        pendingAmount VARCHAR(128) NOT NULL DEFAULT '0',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_test_wallet_user_asset (userId, assetCode)
      ) ENGINE=InnoDB
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS v5_wallet_ledger (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        walletId INT NOT NULL,
        entryType VARCHAR(40) NOT NULL,
        amount VARCHAR(128) NOT NULL,
        assetCode VARCHAR(32) NOT NULL,
        referenceType VARCHAR(80) NOT NULL,
        referenceId VARCHAR(128) NOT NULL,
        idempotencyKey VARCHAR(128) NOT NULL,
        reversalOfId INT NULL,
        precisionSnapshotJson TEXT NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_test_wallet_ledger_idempotency (idempotencyKey)
      ) ENGINE=InnoDB
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mining_wallet_baselines (
        walletId INT NOT NULL PRIMARY KEY,
        assetCode VARCHAR(32) NOT NULL,
        openingAmount DECIMAL(36,18) NOT NULL,
        capturedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB
    `);
    await pool.query("DELETE FROM v5_wallet_ledger");
    await pool.query("DELETE FROM mining_wallet_baselines");
    await pool.query("DELETE FROM v5_wallets");
    await pool.query("DELETE FROM v5_idempotency_keys");
  });

  afterAll(async () => {
    await pool?.query("DELETE FROM v5_wallet_ledger");
    await pool?.query("DELETE FROM mining_wallet_baselines");
    await pool?.query("DELETE FROM v5_wallets");
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

  it("persists balanced per-asset wallet journal entries and matching wallet balances", async () => {
    if (!pool) throw new Error("Missing database pool");
    const conn = await pool.getConnection();
    const userId = 700000 + (Date.now() % 100000);
    const transactionId = Date.now();
    try {
      await conn.execute(
        "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?,?,?,?)",
        [userId, "CKI", "5.00000000", "0", "0"],
      );
      await conn.execute(
        "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?,?,?,?)",
        [0, "CKI", "0.00000000", "0", "0"],
      );

      const ids = await inMiningTransaction(conn as unknown as Db, () =>
        postMiningLedgerEntries(conn as unknown as Db, { id: transactionId, referenceCode: `mysql-ledger:${transactionId}` }, [
          { userId, asset: "CKI", amount: "-2.00000000", entryType: "customer_debit" },
          { userId: 0, asset: "CKI", amount: "2.00000000", entryType: "platform_credit" },
        ]),
      );

      expect(ids).toHaveLength(2);
      const [walletRows] = await pool.query<any[]>(
        "SELECT userId,availableAmount FROM v5_wallets WHERE assetCode='CKI' AND userId IN (?,0) ORDER BY userId",
        [userId],
      );
      expect(walletRows.map(row => [Number(row.userId), String(row.availableAmount)])).toEqual([
        [0, "2.00000000"],
        [userId, "3.00000000"],
      ]);
      const [ledgerRows] = await pool.query<any[]>(
        "SELECT amount,assetCode,referenceId FROM v5_wallet_ledger WHERE referenceId=? ORDER BY id",
        [String(transactionId)],
      );
      expect(ledgerRows).toHaveLength(2);
      expect(ledgerRows.every(row => row.assetCode === "CKI")).toBe(true);
      expect(ledgerRows.reduce((total, row) => total + Number(row.amount), 0)).toBeCloseTo(0, 8);
    } finally {
      conn.release();
    }
  });

  it("rolls back wallet balances, journal rows, and opening baselines after an injected failure", async () => {
    if (!pool) throw new Error("Missing database pool");
    const conn = await pool.getConnection();
    const userId = 700000 + (Date.now() % 100000);
    const transactionId = Date.now() + 1;
    const failure = new Error("injected failure after ledger write");
    try {
      await conn.execute(
        "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?,?,?,?)",
        [userId, "CKI", "5.00000000", "0", "0"],
      );
      await conn.execute(
        "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?,?,?,?)",
        [0, "CKI", "0.00000000", "0", "0"],
      );

      await expect(inMiningTransaction(conn as unknown as Db, async () => {
        await postMiningLedgerEntries(conn as unknown as Db, { id: transactionId, referenceCode: `mysql-rollback:${transactionId}` }, [
          { userId, asset: "CKI", amount: "-1.00000000", entryType: "customer_debit" },
          { userId: 0, asset: "CKI", amount: "1.00000000", entryType: "platform_credit" },
        ]);
        throw failure;
      })).rejects.toBe(failure);

      const [walletRows] = await pool.query<any[]>(
        "SELECT userId,availableAmount FROM v5_wallets WHERE assetCode='CKI' AND userId IN (?,0) ORDER BY userId",
        [userId],
      );
      expect(walletRows.map(row => [Number(row.userId), String(row.availableAmount)])).toEqual([
        [0, "0.00000000"],
        [userId, "5.00000000"],
      ]);
      const [ledgerRows] = await pool.query<any[]>(
        "SELECT id FROM v5_wallet_ledger WHERE referenceId=?",
        [String(transactionId)],
      );
      expect(ledgerRows).toHaveLength(0);
      const [baselineRows] = await pool.query<any[]>(
        "SELECT walletId FROM mining_wallet_baselines WHERE walletId IN (SELECT id FROM v5_wallets WHERE userId IN (?,0))",
        [userId],
      );
      expect(baselineRows).toHaveLength(0);
    } finally {
      try { await conn.rollback(); } catch { /* no open transaction is also valid */ }
      conn.release();
    }
  });
});
