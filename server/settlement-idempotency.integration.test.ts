import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, manuallySettleTrade } from "./db";

const databaseUrl = process.env.WALLET_TEST_DATABASE_URL;
const settlementDescribe = databaseUrl ? describe : describe.skip;
type Fixture = {
  adminId: number;
  userId: number;
  currency: string;
  tradeId: number;
};
let pool: mysql.Pool | undefined;
const fixtures: Fixture[] = [];

settlementDescribe("manual settlement idempotency and rollback (disposable MySQL-compatible database)", () => {
  beforeAll(async () => {
    pool = mysql.createPool(databaseUrl!);
  }, 30_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!pool) return;
    for (const fixture of fixtures.splice(0)) {
      const connection = await pool.getConnection();
      try {
        await connection.execute(
          "DELETE FROM trade_lifecycle_events WHERE tradeId=?",
          [fixture.tradeId],
        );
        await connection.execute(
          "DELETE FROM balance_ledger WHERE userId=? AND currency=?",
          [fixture.userId, fixture.currency],
        );
        await connection.execute(
          "DELETE FROM trade_reward_reservations WHERE tradeId=?",
          [fixture.tradeId],
        );
        await connection.execute("DELETE FROM trade_positions WHERE id=?", [fixture.tradeId]);
        await connection.execute(
          "DELETE FROM customer_balances WHERE userId=? AND currency=?",
          [fixture.userId, fixture.currency],
        );
        await connection.execute("DELETE FROM currency_registry WHERE code=?", [fixture.currency]);
        await connection.execute(
          "DELETE FROM users WHERE id IN (?, ?)",
          [fixture.adminId, fixture.userId],
        );
      } finally {
        connection.release();
      }
    }
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    const drizzleDb = await getDb();
    await (drizzleDb as any)?.$client?.end?.();
    await pool.end();
  }, 30_000);

  async function createFixture(lockedMinor = 100): Promise<Fixture> {
    const suffix = randomUUID().replace(/-/g, "");
    const adminOpenId = `settlement-admin-${suffix}`;
    const userOpenId = `settlement-user-${suffix}`;
    const currency = `S${suffix.slice(0, 10).toUpperCase()}`;
    const connection = await pool!.getConnection();
    try {
      const [adminInsert] = await connection.execute<mysql.ResultSetHeader>(
        "INSERT INTO users (openId, name, email, role) VALUES (?, 'Settlement test admin', ?, 'admin')",
        [adminOpenId, `${adminOpenId}@example.test`],
      );
      const [userInsert] = await connection.execute<mysql.ResultSetHeader>(
        "INSERT INTO users (openId, name, email, role) VALUES (?, 'Settlement test user', ?, 'user')",
        [userOpenId, `${userOpenId}@example.test`],
      );
      const adminId = Number(adminInsert.insertId);
      const userId = Number(userInsert.insertId);

      await connection.execute(
        "INSERT INTO currency_registry (code, name, symbol, scale, assetType, usdRate, rateProvider, enabled) VALUES (?, 'Settlement test currency', 'S', 2, 'fiat', '1', 'test', 1)",
        [currency],
      );
      await connection.execute(
        "INSERT INTO customer_balances (userId, currency, availableMinor, lockedMinor, promotionalMinor, earnedMinor) VALUES (?, ?, 0, ?, 0, 0)",
        [userId, currency, lockedMinor],
      );
      const [tradeInsert] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO trade_positions
          (userId, offerId, currency, principalMinor, expectedRewardMinor, status, settlesAt, settlementStatus, rewardReservedMinor, rewardCreditedMinor)
         VALUES (?, 1, ?, 100, 50, 'confirmed', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND), 'pending', 50, 0)`,
        [userId, currency],
      );
      const tradeId = Number(tradeInsert.insertId);
      await connection.execute(
        "INSERT INTO trade_reward_reservations (userId, tradeId, packageName, windowKey, currency, reservedMinor, status) VALUES (?, ?, 'Settlement Test', 'integration-window', ?, 50, 'reserved')",
        [userId, tradeId, currency],
      );

      const fixture = { adminId, userId, currency, tradeId };
      fixtures.push(fixture);
      return fixture;
    } finally {
      connection.release();
    }
  }

  async function readFixture(fixture: Fixture) {
    const connection = await pool!.getConnection();
    try {
      const [balances] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT availableMinor, lockedMinor, promotionalMinor, earnedMinor FROM customer_balances WHERE userId=? AND currency=?",
        [fixture.userId, fixture.currency],
      );
      const [ledger] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS entryCount, COALESCE(SUM(amountMinor), 0) AS ledgerTotal FROM balance_ledger WHERE userId=? AND currency=?",
        [fixture.userId, fixture.currency],
      );
      const [trades] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT status, settlementStatus, rewardReservedMinor, rewardCreditedMinor, settlementReference FROM trade_positions WHERE id=?",
        [fixture.tradeId],
      );
      const [reservations] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT status FROM trade_reward_reservations WHERE tradeId=?",
        [fixture.tradeId],
      );
      const [events] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS eventCount FROM trade_lifecycle_events WHERE tradeId=?",
        [fixture.tradeId],
      );
      return {
        balance: {
          availableMinor: Number(balances[0].availableMinor),
          lockedMinor: Number(balances[0].lockedMinor),
          promotionalMinor: Number(balances[0].promotionalMinor),
          earnedMinor: Number(balances[0].earnedMinor),
        },
        ledger: {
          entryCount: Number(ledger[0].entryCount),
          ledgerTotal: Number(ledger[0].ledgerTotal),
        },
        trade: trades[0],
        reservation: reservations[0],
        eventCount: Number(events[0].eventCount),
      };
    } finally {
      connection.release();
    }
  }

  it("allows one winner for concurrent settlement attempts on the same trade", async () => {
    const fixture = await createFixture();
    const outcomes = await Promise.allSettled([
      manuallySettleTrade(fixture.tradeId, fixture.adminId, {
        rewardMinor: 25,
        settlementReference: `settle-${randomUUID().slice(0, 18)}-A`,
      }),
      manuallySettleTrade(fixture.tradeId, fixture.adminId, {
        rewardMinor: 25,
        settlementReference: `settle-${randomUUID().slice(0, 18)}-B`,
      }),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    const state = await readFixture(fixture);
    expect(state.balance).toEqual({
      availableMinor: 125,
      lockedMinor: 0,
      promotionalMinor: 0,
      earnedMinor: 25,
    });
    expect(state.ledger).toEqual({ entryCount: 2, ledgerTotal: 125 });
    expect(state.trade.status).toBe("settled");
    expect(state.trade.settlementStatus).toBe("completed");
    expect(Number(state.trade.rewardReservedMinor)).toBe(0);
    expect(Number(state.trade.rewardCreditedMinor)).toBe(25);
    expect(state.reservation.status).toBe("credited");
    expect(state.eventCount).toBe(2);
    expect(state.ledger.ledgerTotal).toBe(state.balance.availableMinor);
  }, 30_000);

  it("rolls back ledger and wallet writes when the reward ledger insert fails", async () => {
    const fixture = await createFixture();
    const connection = await pool!.getConnection();
    let triggerCreated = false;
    try {
      await connection.query(`
        CREATE TRIGGER trg_settlement_test_fail_reward
        BEFORE INSERT ON balance_ledger
        FOR EACH ROW
        BEGIN
          IF NEW.amountMinor = 25 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test forced settlement ledger failure';
          END IF;
        END
      `);
      triggerCreated = true;
    } finally {
      connection.release();
    }

    try {
      await expect(
        manuallySettleTrade(fixture.tradeId, fixture.adminId, {
          rewardMinor: 25,
          settlementReference: `settle-${randomUUID().slice(0, 18)}-rollback`,
        }),
      ).rejects.toThrow(/forced settlement ledger failure/i);
      const state = await readFixture(fixture);
      expect(state.balance).toEqual({
        availableMinor: 0,
        lockedMinor: 100,
        promotionalMinor: 0,
        earnedMinor: 0,
      });
      expect(state.ledger).toEqual({ entryCount: 0, ledgerTotal: 0 });
      expect(state.trade.status).toBe("confirmed");
      expect(state.trade.settlementStatus).toBe("pending");
      expect(state.reservation.status).toBe("reserved");
      expect(state.eventCount).toBe(0);
    } finally {
      if (triggerCreated) {
        const connection = await pool!.getConnection();
        try {
          await connection.query("DROP TRIGGER IF EXISTS trg_settlement_test_fail_reward");
        } finally {
          connection.release();
        }
      }
    }
  }, 30_000);

  it("returns the committed settlement if post-commit popup lifecycle recording fails", async () => {
    const fixture = await createFixture();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const connection = await pool!.getConnection();
    let tableRenamed = false;
    try {
      await connection.query(
        "RENAME TABLE opportunity_popup_events TO opportunity_popup_events_settlement_test_saved",
      );
      tableRenamed = true;
    } finally {
      connection.release();
    }

    try {
      await expect(
        manuallySettleTrade(fixture.tradeId, fixture.adminId, {
          rewardMinor: 25,
          settlementReference: `settle-${randomUUID().slice(0, 18)}-postcommit`,
        }),
      ).resolves.toMatchObject({ tradeId: fixture.tradeId, rewardMinor: 25, totalMinor: 125 });

      const state = await readFixture(fixture);
      expect(state.balance.availableMinor).toBe(125);
      expect(state.balance.lockedMinor).toBe(0);
      expect(state.ledger).toEqual({ entryCount: 2, ledgerTotal: 125 });
      expect(state.trade.status).toBe("settled");
      expect(consoleSpy).toHaveBeenCalledWith(
        "[TradeSettlement] Settlement committed, but popup lifecycle update failed:",
        "Error",
      );
    } finally {
      if (tableRenamed) {
        const connection = await pool!.getConnection();
        try {
          await connection.query(
            "RENAME TABLE opportunity_popup_events_settlement_test_saved TO opportunity_popup_events",
          );
        } finally {
          connection.release();
        }
      }
    }
  }, 30_000);

  it("rejects settlement if the wallet no longer holds the reserved principal", async () => {
    const fixture = await createFixture(0);
    await expect(
      manuallySettleTrade(fixture.tradeId, fixture.adminId, {
        rewardMinor: 25,
        settlementReference: `settle-${randomUUID().slice(0, 18)}-unlocked`,
      }),
    ).rejects.toThrow(/does not contain a safe reserved principal balance/i);
    const state = await readFixture(fixture);
    expect(state.balance).toEqual({
      availableMinor: 0,
      lockedMinor: 0,
      promotionalMinor: 0,
      earnedMinor: 0,
    });
    expect(state.ledger).toEqual({ entryCount: 0, ledgerTotal: 0 });
    expect(state.trade.status).toBe("confirmed");
    expect(state.trade.settlementStatus).toBe("pending");
    expect(state.reservation.status).toBe("reserved");
  }, 30_000);
});
