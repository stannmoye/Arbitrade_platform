import mysql from "mysql2/promise";
import { afterEach, describe, expect, it } from "vitest";
import { settleDuePositions } from "./stakeEarn";

const databaseUrl = process.env.STAKE_SETTLEMENT_TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const TEST_USER_ID = 1900000422;

type Fixture = { positionId?: number; reference?: string };

async function ensureTables(db: mysql.Connection) {
  await db.query(`CREATE TABLE IF NOT EXISTS stake_positions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    positionCode VARCHAR(80) NOT NULL,
    userId INT NOT NULL,
    productId INT NOT NULL,
    asset VARCHAR(32) NOT NULL,
    principalMinor BIGINT NOT NULL,
    rewardMinor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL,
    openedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    maturityAt DATETIME NOT NULL,
    nextRewardAt DATETIME NULL,
    originalLedgerReference VARCHAR(160) NULL,
    completedAt DATETIME NULL,
    INDEX idx_test_stake_due (userId,status,maturityAt)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS balance_ledger (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    currency VARCHAR(32) NOT NULL,
    amountMinor BIGINT NOT NULL,
    entryType VARCHAR(80) NOT NULL,
    reference VARCHAR(160) NOT NULL,
    withdrawable BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_test_stake_ledger_reference (reference)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS customer_balances (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    currency VARCHAR(32) NOT NULL,
    availableMinor BIGINT NOT NULL DEFAULT 0,
    lockedMinor BIGINT NOT NULL DEFAULT 0,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_test_stake_balance_user_currency (userId,currency)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS stake_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    positionId INT NOT NULL,
    eventType VARCHAR(80) NOT NULL,
    previousState VARCHAR(40) NOT NULL,
    newState VARCHAR(40) NOT NULL,
    amountMinor BIGINT NOT NULL,
    asset VARCHAR(32) NOT NULL,
    metadataJson TEXT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS customer_notifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
}

async function inTransaction(db: mysql.Connection, userId: number) {
  await db.beginTransaction();
  try {
    await settleDuePositions(db as unknown as Parameters<typeof settleDuePositions>[0], userId);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function insertMaturePosition(db: mysql.Connection, fixture: Fixture, withBalance: boolean) {
  await db.execute("DELETE FROM stake_positions WHERE userId=?", [TEST_USER_ID]);
  await db.execute("DELETE FROM balance_ledger WHERE userId=?", [TEST_USER_ID]);
  await db.execute("DELETE FROM stake_events WHERE userId=?", [TEST_USER_ID]);
  await db.execute("DELETE FROM customer_notifications WHERE userId=?", [TEST_USER_ID]);
  await db.execute("DELETE FROM customer_balances WHERE userId=?", [TEST_USER_ID]);
  if (withBalance) {
    await db.execute(
      "INSERT INTO customer_balances (userId,currency,availableMinor,lockedMinor) VALUES (?,'USD',500,500)",
      [TEST_USER_ID],
    );
  }
  const [result] = await db.execute<any>(
    "INSERT INTO stake_positions (positionCode,userId,productId,asset,principalMinor,rewardMinor,status,openedAt,updatedAt,maturityAt,nextRewardAt,originalLedgerReference) VALUES (?,?,1,'USD',500,0,'ACTIVE',NOW(),NOW(),'2000-01-01 00:00:00',NULL,'test-stake-allocation')",
    [`STK-SETTLEMENT-${TEST_USER_ID}`, TEST_USER_ID],
  );
  fixture.positionId = Number(result.insertId);
  fixture.reference = `stake-settlement:${fixture.positionId}`;
}

databaseDescribe("Stake & Earn maturity settlement database integration", () => {
  let activeFixture: Fixture | null = null;

  afterEach(async () => {
    if (!databaseUrl || !activeFixture) return;
    const db = await mysql.createConnection(databaseUrl);
    try {
      if (activeFixture.reference) {
        await db.execute("DELETE FROM balance_ledger WHERE reference=?", [activeFixture.reference]);
      }
      if (activeFixture.positionId) {
        await db.execute("DELETE FROM stake_events WHERE positionId=?", [activeFixture.positionId]);
        await db.execute("DELETE FROM stake_positions WHERE id=?", [activeFixture.positionId]);
      }
      await db.execute("DELETE FROM customer_notifications WHERE userId=?", [TEST_USER_ID]);
      await db.execute("DELETE FROM customer_balances WHERE userId=?", [TEST_USER_ID]);
    } finally {
      await db.end();
      activeFixture = null;
    }
  });

  it("releases a mature position once under competing settlement calls", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await insertMaturePosition(setup, fixture, true);
      const first = await mysql.createConnection(databaseUrl!);
      const second = await mysql.createConnection(databaseUrl!);
      try {
        await Promise.all([
          inTransaction(first, TEST_USER_ID),
          inTransaction(second, TEST_USER_ID),
        ]);
      } finally {
        await first.end();
        await second.end();
      }

      const [positions] = await setup.execute<any[]>(
        "SELECT status FROM stake_positions WHERE id=?",
        [fixture.positionId],
      );
      expect(positions[0]?.status).toBe("COMPLETED");
      const [ledger] = await setup.execute<any[]>(
        "SELECT amountMinor FROM balance_ledger WHERE reference=?",
        [fixture.reference],
      );
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].amountMinor)).toBe(500);
      const [balances] = await setup.execute<any[]>(
        "SELECT availableMinor,lockedMinor FROM customer_balances WHERE userId=? AND currency='USD'",
        [TEST_USER_ID],
      );
      expect(balances).toHaveLength(1);
      expect(Number(balances[0].availableMinor)).toBe(1000);
      expect(Number(balances[0].lockedMinor)).toBe(0);
      const [events] = await setup.execute<any[]>(
        "SELECT id FROM stake_events WHERE positionId=? AND eventType='position.completed'",
        [fixture.positionId],
      );
      expect(events).toHaveLength(1);
    } finally {
      await setup.end();
    }
  }, 30_000);

  it("rolls back settlement when locked wallet funds are below the position principal", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await insertMaturePosition(setup, fixture, true);
      await setup.execute(
        "UPDATE customer_balances SET lockedMinor=0 WHERE userId=? AND currency='USD'",
        [TEST_USER_ID],
      );

      await expect(inTransaction(setup, TEST_USER_ID)).rejects.toThrow(/sufficient locked funds/i);

      const [ledger] = await setup.execute<any[]>(
        "SELECT id FROM balance_ledger WHERE reference=?",
        [fixture.reference],
      );
      expect(ledger).toHaveLength(0);
      const [positions] = await setup.execute<any[]>(
        "SELECT status FROM stake_positions WHERE id=?",
        [fixture.positionId],
      );
      expect(positions[0]?.status).toBe("ACTIVE");
      const [balances] = await setup.execute<any[]>(
        "SELECT availableMinor,lockedMinor FROM customer_balances WHERE userId=? AND currency='USD'",
        [TEST_USER_ID],
      );
      expect(Number(balances[0].availableMinor)).toBe(500);
      expect(Number(balances[0].lockedMinor)).toBe(0);
    } finally {
      await setup.end();
    }
  }, 30_000);

  it("fails closed if a principal-release ledger already exists for an active position", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await insertMaturePosition(setup, fixture, true);
      await setup.execute(
        "INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,'USD',500,'stake_principal_release',?,false)",
        [TEST_USER_ID, fixture.reference],
      );

      await expect(inTransaction(setup, TEST_USER_ID)).rejects.toThrow(/principal-release ledger already exists/i);

      const [ledger] = await setup.execute<any[]>(
        "SELECT id FROM balance_ledger WHERE reference=?",
        [fixture.reference],
      );
      expect(ledger).toHaveLength(1);
      const [positions] = await setup.execute<any[]>(
        "SELECT status FROM stake_positions WHERE id=?",
        [fixture.positionId],
      );
      expect(positions[0]?.status).toBe("ACTIVE");
      const [balances] = await setup.execute<any[]>(
        "SELECT availableMinor,lockedMinor FROM customer_balances WHERE userId=? AND currency='USD'",
        [TEST_USER_ID],
      );
      expect(Number(balances[0].availableMinor)).toBe(500);
      expect(Number(balances[0].lockedMinor)).toBe(500);
      const [events] = await setup.execute<any[]>(
        "SELECT id FROM stake_events WHERE positionId=? AND eventType='position.completed'",
        [fixture.positionId],
      );
      expect(events).toHaveLength(0);
    } finally {
      await setup.end();
    }
  }, 30_000);

  it("rolls back the principal-release ledger entry if the wallet row is missing", async () => {
    const setup = await mysql.createConnection(databaseUrl!);
    const fixture: Fixture = {};
    activeFixture = fixture;
    try {
      await ensureTables(setup);
      await insertMaturePosition(setup, fixture, false);
      await expect(inTransaction(setup, TEST_USER_ID)).rejects.toThrow(/exactly one wallet row/);

      const [ledger] = await setup.execute<any[]>(
        "SELECT id FROM balance_ledger WHERE reference=?",
        [fixture.reference],
      );
      expect(ledger).toHaveLength(0);
      const [positions] = await setup.execute<any[]>(
        "SELECT status FROM stake_positions WHERE id=?",
        [fixture.positionId],
      );
      expect(positions[0]?.status).toBe("ACTIVE");
      const [events] = await setup.execute<any[]>(
        "SELECT id FROM stake_events WHERE positionId=? AND eventType='position.completed'",
        [fixture.positionId],
      );
      expect(events).toHaveLength(0);
    } finally {
      await setup.end();
    }
  }, 30_000);
});
