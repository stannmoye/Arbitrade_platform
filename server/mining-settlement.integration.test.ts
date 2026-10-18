import mysql from "mysql2/promise";
import { afterEach, describe, expect, it } from "vitest";
import { settleDuePendingBoostRewards } from "./mining";

const databaseUrl = process.env.MINING_SETTLEMENT_TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const TEST_USER_ID = 1900000421;
const TEST_TRIGGER = "trg_test_fail_mining_settlement";

type Fixture = {
  rewardId?: number;
  reference?: string;
  platformWalletId?: number;
  platformWalletExisted?: boolean;
  platformInitialBalance?: string;
};

async function ensureTables(db: mysql.Connection) {
  await db.query(`CREATE TABLE IF NOT EXISTS mining_pending_boost_rewards (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    rewardEventId INT NULL,
    rewardDay DATE NOT NULL,
    amountCki DECIMAL(36,18) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    settledAt DATETIME(3) NULL,
    settlementReference VARCHAR(120) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_pending_boost_reward_event (rewardEventId),
    UNIQUE KEY uq_pending_boost_settlement_reference (settlementReference),
    INDEX idx_pending_boost_day_status (rewardDay,status,userId)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS mining_ledger_transactions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NULL,
    actorUserId INT NULL,
    transactionType VARCHAR(120) NOT NULL,
    status VARCHAR(24) NOT NULL,
    idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
    referenceCode VARCHAR(40) NOT NULL,
    reversalOfId INT NULL,
    reason VARCHAR(255) NULL,
    metadataJson LONGTEXT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS v5_wallets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    assetCode VARCHAR(32) NOT NULL,
    availableAmount VARCHAR(128) NOT NULL DEFAULT '0',
    lockedAmount VARCHAR(128) NOT NULL DEFAULT '0',
    pendingAmount VARCHAR(128) NOT NULL DEFAULT '0',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_test_v5_wallet_user_asset (userId,assetCode)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS v5_wallet_ledger (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    walletId INT NOT NULL,
    entryType VARCHAR(40) NOT NULL,
    amount VARCHAR(128) NOT NULL,
    assetCode VARCHAR(32) NOT NULL,
    referenceType VARCHAR(80) NOT NULL,
    referenceId VARCHAR(128) NOT NULL,
    idempotencyKey VARCHAR(128) NOT NULL UNIQUE,
    reversalOfId INT NULL,
    precisionSnapshotJson TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS mining_wallet_baselines (
    walletId INT NOT NULL PRIMARY KEY,
    assetCode VARCHAR(32) NOT NULL,
    openingAmount VARCHAR(128) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
}

async function preparePlatformWallet(db: mysql.Connection, fixture: Fixture) {
  const [before] = await db.execute<any[]>(
    "SELECT id,availableAmount FROM v5_wallets WHERE userId=0 AND assetCode='CKI' ORDER BY id LIMIT 1",
  );
  fixture.platformWalletExisted = Boolean(before[0]);
  if (!before[0]) {
    await db.execute(
      "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (0,'CKI','0','0','0')",
    );
  }
  const [rows] = await db.execute<any[]>(
    "SELECT id,availableAmount FROM v5_wallets WHERE userId=0 AND assetCode='CKI' ORDER BY id LIMIT 1",
  );
  fixture.platformWalletId = Number(rows[0].id);
  fixture.platformInitialBalance = String(rows[0].availableAmount);
}

async function cleanupFixture(db: mysql.Connection, fixture: Fixture) {
  await db.query(`DROP TRIGGER IF EXISTS ${TEST_TRIGGER}`);
  if (fixture.reference) {
    const [txRows] = await db.execute<any[]>(
      "SELECT id FROM mining_ledger_transactions WHERE idempotencyKey=?",
      [fixture.reference],
    );
    for (const row of txRows) {
      await db.execute(
        "DELETE FROM v5_wallet_ledger WHERE referenceType='mining_transaction' AND referenceId=?",
        [String(row.id)],
      );
    }
    await db.execute("DELETE FROM mining_ledger_transactions WHERE idempotencyKey=?", [fixture.reference]);
  }
  if (fixture.rewardId) {
    await db.execute("DELETE FROM mining_pending_boost_rewards WHERE id=?", [fixture.rewardId]);
  }
  const [wallets] = await db.execute<any[]>(
    "SELECT id FROM v5_wallets WHERE userId=? AND assetCode='CKI'",
    [TEST_USER_ID],
  );
  for (const wallet of wallets) {
    await db.execute("DELETE FROM mining_wallet_baselines WHERE walletId=?", [Number(wallet.id)]);
  }
  await db.execute("DELETE FROM v5_wallets WHERE userId=? AND assetCode='CKI'", [TEST_USER_ID]);
  if (fixture.platformWalletId && fixture.platformInitialBalance !== undefined) {
    if (fixture.platformWalletExisted) {
      await db.execute("UPDATE v5_wallets SET availableAmount=? WHERE id=?", [
        fixture.platformInitialBalance,
        fixture.platformWalletId,
      ]);
    } else {
      await db.execute("DELETE FROM mining_wallet_baselines WHERE walletId=?", [fixture.platformWalletId]);
      await db.execute("DELETE FROM v5_wallets WHERE id=?", [fixture.platformWalletId]);
    }
  }
}

async function insertPendingReward(db: mysql.Connection, amount: string, fixture: Fixture) {
  fixture.reference = `mining-boost-settlement:${TEST_USER_ID}`;
  await db.execute(
    "DELETE FROM mining_pending_boost_rewards WHERE userId=?",
    [TEST_USER_ID],
  );
  const [result] = await db.execute<any>(
    "INSERT INTO mining_pending_boost_rewards (userId,rewardEventId,rewardDay,amountCki,status) VALUES (?,NULL,'2000-01-01',?,'pending')",
    [TEST_USER_ID, amount],
  );
  fixture.rewardId = Number(result.insertId);
  fixture.reference = `mining-boost-settlement:${fixture.rewardId}`;
}

databaseDescribe("daily mining boost settlement database integration", () => {
  let activeConnections: mysql.Connection[] = [];
  let activeFixture: Fixture | null = null;

  afterEach(async () => {
    if (!databaseUrl || !activeFixture) return;
    const cleanup = await mysql.createConnection(databaseUrl);
    try {
      await cleanupFixture(cleanup, activeFixture);
    } finally {
      await cleanup.end();
      activeFixture = null;
    }
    for (const connection of activeConnections) {
      try { await connection.end(); } catch { /* already closed */ }
    }
    activeConnections = [];
  });

  it("settles a pending reward once under competing workers and reconciles the ledger", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await preparePlatformWallet(setup, fixture);
      await insertPendingReward(setup, "1.25000000", fixture);

      const first = await mysql.createConnection(databaseUrl!);
      const second = await mysql.createConnection(databaseUrl!);
      activeConnections = [first, second];
      const [left, right] = await Promise.all([
        settleDuePendingBoostRewards(first as unknown as Parameters<typeof settleDuePendingBoostRewards>[0]),
        settleDuePendingBoostRewards(second as unknown as Parameters<typeof settleDuePendingBoostRewards>[0]),
      ]);
      expect(left + right).toBe(1);

      const [pendingRows] = await setup.execute<any[]>(
        "SELECT status,settlementReference FROM mining_pending_boost_rewards WHERE id=?",
        [fixture.rewardId],
      );
      expect(pendingRows).toHaveLength(1);
      expect(pendingRows[0].status).toBe("settled");
      expect(pendingRows[0].settlementReference).toBe(fixture.reference);

      const [transactions] = await setup.execute<any[]>(
        "SELECT id FROM mining_ledger_transactions WHERE idempotencyKey=?",
        [fixture.reference],
      );
      expect(transactions).toHaveLength(1);
      const transactionId = Number(transactions[0].id);
      const [entries] = await setup.execute<any[]>(
        "SELECT wl.amount,w.userId FROM v5_wallet_ledger wl JOIN v5_wallets w ON w.id=wl.walletId WHERE wl.referenceType='mining_transaction' AND wl.referenceId=? ORDER BY wl.id",
        [String(transactionId)],
      );
      expect(entries).toHaveLength(2);
      expect(entries.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(0, 8);
      const customerEntry = entries.find(row => Number(row.userId) === TEST_USER_ID);
      expect(Number(customerEntry?.amount)).toBeCloseTo(1.25, 8);

      const [customerWallet] = await setup.execute<any[]>(
        "SELECT availableAmount FROM v5_wallets WHERE userId=? AND assetCode='CKI'",
        [TEST_USER_ID],
      );
      expect(customerWallet).toHaveLength(1);
      expect(Number(customerWallet[0].availableAmount)).toBeCloseTo(1.25, 8);

      const retry = await settleDuePendingBoostRewards(
        setup as unknown as Parameters<typeof settleDuePendingBoostRewards>[0],
      );
      expect(retry).toBe(0);
      const [transactionsAfterRetry] = await setup.execute<any[]>(
        "SELECT id FROM mining_ledger_transactions WHERE idempotencyKey=?",
        [fixture.reference],
      );
      expect(transactionsAfterRetry).toHaveLength(1);
    } finally {
      await setup.end();
    }
  }, 30_000);

  it("marks a zero-value pending reward settled without creating financial ledger entries", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await insertPendingReward(setup, "0.00000000", fixture);

      const settled = await settleDuePendingBoostRewards(
        setup as unknown as Parameters<typeof settleDuePendingBoostRewards>[0],
      );
      expect(settled).toBe(0);

      const [pendingRows] = await setup.execute<any[]>(
        "SELECT status,settlementReference FROM mining_pending_boost_rewards WHERE id=?",
        [fixture.rewardId],
      );
      expect(pendingRows[0]?.status).toBe("settled");
      expect(pendingRows[0]?.settlementReference).toBe(fixture.reference);
      const [transactions] = await setup.execute<any[]>(
        "SELECT id FROM mining_ledger_transactions WHERE idempotencyKey=?",
        [fixture.reference],
      );
      expect(transactions).toHaveLength(0);
    } finally {
      await setup.end();
    }
  }, 30_000);

  it("rolls back the ledger and leaves the reward pending if ledger posting fails", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await preparePlatformWallet(setup, fixture);
      await insertPendingReward(setup, "2.50000000", fixture);
      await setup.query(`CREATE TRIGGER ${TEST_TRIGGER} BEFORE INSERT ON v5_wallet_ledger
        FOR EACH ROW BEGIN
          IF NEW.entryType = 'mining_boost_daily_settlement' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intentional settlement rollback test';
          END IF;
        END`);

      await expect(
        settleDuePendingBoostRewards(setup as unknown as Parameters<typeof settleDuePendingBoostRewards>[0]),
      ).rejects.toThrow();

      const [pendingRows] = await setup.execute<any[]>(
        "SELECT status FROM mining_pending_boost_rewards WHERE id=?",
        [fixture.rewardId],
      );
      expect(pendingRows[0]?.status).toBe("pending");
      const [transactions] = await setup.execute<any[]>(
        "SELECT id FROM mining_ledger_transactions WHERE idempotencyKey=?",
        [fixture.reference],
      );
      expect(transactions).toHaveLength(0);
      const [customerWallets] = await setup.execute<any[]>(
        "SELECT id FROM v5_wallets WHERE userId=? AND assetCode='CKI'",
        [TEST_USER_ID],
      );
      expect(customerWallets).toHaveLength(0);
    } finally {
      await setup.end();
    }
  }, 30_000);
});
