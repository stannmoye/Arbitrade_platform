import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelCustomerPayoutRequest,
  createCustomerPayoutRequest,
  getDb,
  listCustomerPayoutRequests,
  resolveCustomerPayoutRequest,
} from "./db";

const databaseUrl = process.env.PAYOUT_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

type WalletBalance = { availableMinor: number; lockedMinor: number; promotionalMinor: number };
type PayoutInput = {
  currency: "USD";
  amountMinor: number;
  destinationType: "bank_transfer";
  destinationDetails: string;
  idempotencyKey: string;
};

integrationDescribe("manual payout lifecycle against disposable MySQL/MariaDB", () => {
  const pool = databaseUrl ? mysql.createPool(databaseUrl) : null;
  const fixtureUserIds: number[] = [];
  let previousPolicy: string | null = null;
  let policyExisted = false;
  let adminId = 0;

  const unique = (prefix: string) => prefix + "-" + crypto.randomUUID();
  const destination = "Beneficiary Example; Example Bank; account 0000123456";

  async function setPolicy(policy: Record<string, unknown>) {
    if (!pool) throw new Error("Missing payout test database pool");
    await pool.execute(
      "INSERT INTO app_settings (settingKey,settingValue) VALUES ('policy.defaults',?) ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue)",
      [JSON.stringify(policy)],
    );
  }

  async function createAccount(role: "user" | "admin" = "user", options: { withdrawalsEnabled?: boolean; kycRequired?: boolean } = {}) {
    if (!pool) throw new Error("Missing payout test database pool");
    const openId = unique("payout-ci");
    const email = openId + "@example.test";
    const [insert] = await pool.execute<any>(
      "INSERT INTO users (openId,name,email,role,lastSignedIn) VALUES (?,?,?, ?,NOW())",
      [openId, "Payout CI Fixture", email, role],
    );
    const userId = Number(insert.insertId);
    fixtureUserIds.push(userId);

    if (role === "user") {
      await pool.execute(
        "INSERT INTO customer_controls (userId,accountStatus,withdrawalsEnabled,kycRequired,emailVerified) VALUES (?, 'active', ?, ?, 1)",
        [userId, options.withdrawalsEnabled === false ? 0 : 1, options.kycRequired === true ? 1 : 0],
      );
      await pool.execute(
        "INSERT INTO customer_balances (userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor) VALUES (?, 'USD', 10000, 0, 2000, 0)",
        [userId],
      );
    }
    return userId;
  }

  async function balance(userId: number): Promise<WalletBalance> {
    if (!pool) throw new Error("Missing payout test database pool");
    const [rows] = await pool.execute<any[]>(
      "SELECT availableMinor,lockedMinor,promotionalMinor FROM customer_balances WHERE userId=? AND currency='USD' LIMIT 1",
      [userId],
    );
    if (!rows[0]) throw new Error("Expected payout fixture wallet was not found");
    return {
      availableMinor: Number(rows[0].availableMinor),
      lockedMinor: Number(rows[0].lockedMinor),
      promotionalMinor: Number(rows[0].promotionalMinor),
    };
  }

  async function ledgerCount(userId: number, entryType: string) {
    if (!pool) throw new Error("Missing payout test database pool");
    const [rows] = await pool.execute<any[]>(
      "SELECT COUNT(*) AS count FROM balance_ledger WHERE userId=? AND entryType=?",
      [userId, entryType],
    );
    return Number(rows[0].count);
  }

  function requestInput(amountMinor: number, idempotencyKey: string): PayoutInput {
    return {
      currency: "USD",
      amountMinor,
      destinationType: "bank_transfer",
      destinationDetails: destination,
      idempotencyKey,
    };
  }

  beforeAll(async () => {
    if (!pool) throw new Error("PAYOUT_TEST_DATABASE_URL is required for the payout integration suite");
    const [policyRows] = await pool.execute<any[]>(
      "SELECT settingValue FROM app_settings WHERE settingKey='policy.defaults' LIMIT 1",
    );
    policyExisted = policyRows.length > 0;
    previousPolicy = policyExisted ? String(policyRows[0].settingValue) : null;

    const [currencyRows] = await pool.execute<any[]>(
      "SELECT code,scale,enabled FROM currency_registry WHERE code='USD' LIMIT 1",
    );
    if (!currencyRows[0] || Number(currencyRows[0].enabled) !== 1 || Number(currencyRows[0].scale) !== 2) {
      throw new Error("The disposable installation must contain an enabled USD currency with scale 2");
    }
    await setPolicy({ kyc: false, withdrawals: true, twofa: false, facial: false });
    adminId = await createAccount("admin");
  });

  afterAll(async () => {
    if (!pool) return;
    if (fixtureUserIds.length) {
      const marks = fixtureUserIds.map(() => "?").join(",");
      const params = [...fixtureUserIds];
      for (const table of [
        "customer_notifications",
        "payout_requests",
        "balance_ledger",
        "customer_balances",
        "customer_controls",
        "kyc_profiles",
        "users",
      ]) {
        const idColumn = table === "users" ? "id" : "userId";
        await pool.execute("DELETE FROM " + table + " WHERE " + idColumn + " IN (" + marks + ")", params);
      }
    }
    if (policyExisted && previousPolicy !== null) {
      await pool.execute("UPDATE app_settings SET settingValue=? WHERE settingKey='policy.defaults'", [previousPolicy]);
    } else {
      await pool.execute("DELETE FROM app_settings WHERE settingKey='policy.defaults'");
    }
    const internalDb = await getDb() as any;
    if (internalDb?.$client && typeof internalDb.$client.end === "function") await internalDb.$client.end();
    await pool.end();
  });

  it("reserves non-promotional funds once, replays matching keys, and releases on cancel", async () => {
    const userId = await createAccount();
    const key = unique("payout-idem");
    const input = requestInput(5000, key);

    const created = await createCustomerPayoutRequest(userId, input);
    expect(created.status).toBe("pending");
    expect(await balance(userId)).toEqual({ availableMinor: 5000, lockedMinor: 5000, promotionalMinor: 2000 });

    const replay = await createCustomerPayoutRequest(userId, input);
    expect(Number(replay.id)).toBe(Number(created.id));
    expect(await ledgerCount(userId, "payout_reserve")).toBe(1);

    await expect(createCustomerPayoutRequest(userId, requestInput(5001, key)))
      .rejects.toThrow("already used for a different request");
    await expect(createCustomerPayoutRequest(userId, requestInput(3001, unique("payout-too-large"))))
      .rejects.toThrow("exceeds the available non-promotional balance");
    expect(await balance(userId)).toEqual({ availableMinor: 5000, lockedMinor: 5000, promotionalMinor: 2000 });

    const cancelled = await cancelCustomerPayoutRequest(userId, Number(created.id));
    expect(cancelled.status).toBe("cancelled");
    expect(await balance(userId)).toEqual({ availableMinor: 10000, lockedMinor: 0, promotionalMinor: 2000 });
    expect(await ledgerCount(userId, "payout_reserve")).toBe(1);
    expect(await ledgerCount(userId, "payout_release")).toBe(1);
    const history = await listCustomerPayoutRequests(userId);
    expect(history.map((item: any) => Number(item.id))).toContain(Number(created.id));
  });

  it("marks a request paid only with a unique manual reference and releases rejected requests", async () => {
    const userId = await createAccount();
    const paidRequest = await createCustomerPayoutRequest(userId, requestInput(2500, unique("payout-paid")));
    const externalReference = unique("external-transfer");
    const paid = await resolveCustomerPayoutRequest(adminId, {
      requestId: Number(paidRequest.id),
      action: "paid",
      externalReference,
    });
    expect(paid.status).toBe("paid");
    expect(paid.externalReference).toBe(externalReference);
    expect(await balance(userId)).toEqual({ availableMinor: 7500, lockedMinor: 0, promotionalMinor: 2000 });
    expect(await ledgerCount(userId, "payout_reserve")).toBe(1);
    expect(await ledgerCount(userId, "payout_paid")).toBe(1);

    const rejectedRequest = await createCustomerPayoutRequest(userId, requestInput(4000, unique("payout-reject")));
    const rejected = await resolveCustomerPayoutRequest(adminId, {
      requestId: Number(rejectedRequest.id),
      action: "rejected",
      note: "CI fixture rejection; no external transfer was sent.",
    });
    expect(rejected.status).toBe("rejected");
    expect(await balance(userId)).toEqual({ availableMinor: 7500, lockedMinor: 0, promotionalMinor: 2000 });
    expect(await ledgerCount(userId, "payout_release")).toBe(1);

    const duplicateReferenceRequest = await createCustomerPayoutRequest(userId, requestInput(1000, unique("payout-duplicate-ref")));
    await expect(resolveCustomerPayoutRequest(adminId, {
      requestId: Number(duplicateReferenceRequest.id),
      action: "paid",
      externalReference,
    })).rejects.toThrow("already assigned to another payout");
    expect((await balance(userId)).lockedMinor).toBe(1000);
    await resolveCustomerPayoutRequest(adminId, {
      requestId: Number(duplicateReferenceRequest.id),
      action: "rejected",
      note: "Release duplicate-reference fixture.",
    });
    expect(await balance(userId)).toEqual({ availableMinor: 7500, lockedMinor: 0, promotionalMinor: 2000 });
  });

  it("serializes competing administrator resolutions so a request is finalized only once", async () => {
    const userId = await createAccount();
    const request = await createCustomerPayoutRequest(userId, requestInput(1000, unique("payout-race")));
    const results = await Promise.allSettled([
      resolveCustomerPayoutRequest(adminId, {
        requestId: Number(request.id),
        action: "paid",
        externalReference: unique("external-race"),
      }),
      resolveCustomerPayoutRequest(adminId, {
        requestId: Number(request.id),
        action: "rejected",
        note: "Competing CI resolution.",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [finalRows] = await pool!.execute<any[]>(
      "SELECT status FROM payout_requests WHERE id=? LIMIT 1",
      [Number(request.id)],
    );
    expect(["paid", "rejected"]).toContain(finalRows[0]?.status);
    const current = await balance(userId);
    expect(current.lockedMinor).toBe(0);
    if (finalRows[0].status === "paid") expect(current.availableMinor).toBe(9000);
    else expect(current.availableMinor).toBe(10000);
  });

  it("fails closed when customer withdrawal permission, global policy, or required KYC is missing", async () => {
    const blockedCustomer = await createAccount("user", { withdrawalsEnabled: false, kycRequired: false });
    await expect(createCustomerPayoutRequest(blockedCustomer, requestInput(1000, unique("payout-disabled-customer"))))
      .rejects.toThrow("Withdrawals are not enabled for this customer account");

    const enabledCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: false });
    await setPolicy({ kyc: false, withdrawals: false, twofa: false, facial: false });
    try {
      await expect(createCustomerPayoutRequest(enabledCustomer, requestInput(1000, unique("payout-disabled-global"))))
        .rejects.toThrow("Withdrawals are disabled by the global policy");
    } finally {
      await setPolicy({ kyc: false, withdrawals: true, twofa: false, facial: false });
    }

    const kycCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: true });
    await expect(createCustomerPayoutRequest(kycCustomer, requestInput(1000, unique("payout-kyc-required"))))
      .rejects.toThrow("Complete the required identity verification");
    expect(await ledgerCount(blockedCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(enabledCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(kycCustomer, "payout_reserve")).toBe(0);
  });
});
