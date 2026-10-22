import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpAtStep } from "./modules/totp";
import {
  cancelCustomerPayoutRequest,
  createCustomerPayoutRequest,
  getCustomerPayoutEligibility,
  getCustomerAuthenticatorStatus,
  startCustomerAuthenticatorEnrollment,
  confirmCustomerAuthenticatorEnrollment,
  generateCustomerAuthenticatorRecoveryCodes,
  startCustomerAuthenticatorRecoveryReplacement,
  startCustomerAuthenticatorReplacement,
  confirmCustomerAuthenticatorReplacement,
  deleteAdminCustomer,
  getDb,
  listCustomerPayoutRequests,
  resolveCustomerPayoutRequest,
} from "./db";

const databaseUrl = process.env.PAYOUT_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

type WalletBalance = { availableMinor: number; lockedMinor: number; promotionalMinor: number };
type PayoutInput = {
  currency: "USD" | "EUR" | "GBP" | "BTC" | "ETH" | "USDT";
  amountMinor: number;
  destinationType: "bank_transfer" | "crypto_transfer";
  destinationDetails: string;
  idempotencyKey: string;
  totpCode?: string;
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
        "customer_totp_authenticators",
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

    await expect(createCustomerPayoutRequest(userId, { ...requestInput(1000, unique("fiat-to-crypto")), destinationType: "crypto_transfer" }))
      .rejects.toThrow("USD, EUR, and GBP payouts require a bank-transfer destination");
    await expect(createCustomerPayoutRequest(userId, { ...requestInput(1000, unique("crypto-to-bank")), currency: "BTC", destinationType: "bank_transfer" }))
      .rejects.toThrow("BTC, ETH, and USDT payouts require a crypto-wallet destination");
    expect(await balance(userId)).toEqual({ availableMinor: 10000, lockedMinor: 0, promotionalMinor: 2000 });

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

  it("requires an enrolled authenticator under the default 2FA policy and rejects replayed codes", async () => {
    const userId = await createAccount();
    const previousEncryptionKey = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = "a".repeat(64);
    try {
      await setPolicy({ kyc: false, withdrawals: true, twofa: true, facial: false });
      const blocked = await getCustomerPayoutEligibility(userId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toContain("Set up and confirm an authenticator");

      // Two tabs may start setup together. Both responses must describe the same
      // persisted pending secret, rather than invalidating the first tab's QR code.
      const [setup, repeatedSetup] = await Promise.all([
        startCustomerAuthenticatorEnrollment(userId),
        startCustomerAuthenticatorEnrollment(userId),
      ]);
      expect(repeatedSetup.secret).toBe(setup.secret);
      expect(repeatedSetup.provisioningUri).toBe(setup.provisioningUri);
      expect(repeatedSetup.expiresAt).toEqual(setup.expiresAt);

      const enrollmentStep = Math.floor(Date.now() / 30_000);
      const enrolled = await confirmCustomerAuthenticatorEnrollment(userId, totpAtStep(setup.secret, enrollmentStep));
      expect(enrolled.recoveryCodes).toHaveLength(10);
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
      expect((await getCustomerPayoutEligibility(userId)).allowed).toBe(true);

      // Replacing a key requires a fresh code from the existing authenticator. The
      // previous key stays enabled until the new key is explicitly confirmed.
      const replacementStartStep = Math.floor(Date.now() / 30_000);
      const replacement = await startCustomerAuthenticatorReplacement(
        userId,
        totpAtStep(setup.secret, replacementStartStep + 1),
      );
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ enabled: true, replacementPending: true });
      await expect(startCustomerAuthenticatorReplacement(
        userId,
        totpAtStep(setup.secret, replacementStartStep + 1),
      )).rejects.toThrow("invalid, expired, or has already been used");
      await confirmCustomerAuthenticatorReplacement(
        userId,
        totpAtStep(replacement.secret, replacementStartStep),
      );
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ enabled: true, replacementPending: false, recoveryCodesRemaining: 10 });
      expect((await getCustomerPayoutEligibility(userId)).allowed).toBe(true);

      // Regenerating codes requires an unused current TOTP and invalidates the old set.
      const recoveryCodeStep = Math.floor(Date.now() / 30_000) + 1;
      const regenerated = await generateCustomerAuthenticatorRecoveryCodes(userId, totpAtStep(replacement.secret, recoveryCodeStep));
      expect(regenerated.recoveryCodes).toHaveLength(10);
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ recoveryCodesRemaining: 10 });

      // Race two lost-device recovery attempts with the same one-time code.
      // Exactly one transaction may consume it and create the pending authenticator.
      const recoveryAttempts = await Promise.allSettled([
        startCustomerAuthenticatorRecoveryReplacement(userId, regenerated.recoveryCodes[0]),
        startCustomerAuthenticatorRecoveryReplacement(userId, regenerated.recoveryCodes[0]),
      ]);
      const successfulRecoveries = recoveryAttempts.filter(
        (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof startCustomerAuthenticatorRecoveryReplacement>>> =>
          attempt.status === "fulfilled",
      );
      const rejectedRecoveries = recoveryAttempts.filter((attempt) => attempt.status === "rejected");
      expect(successfulRecoveries).toHaveLength(1);
      expect(rejectedRecoveries).toHaveLength(1);
      expect((rejectedRecoveries[0] as PromiseRejectedResult).reason.message)
        .toContain("invalid or has already been used");
      const recovery = successfulRecoveries[0].value;
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ enabled: true, replacementPending: true, recoveryCodesRemaining: 9 });
      await confirmCustomerAuthenticatorReplacement(
        userId,
        totpAtStep(recovery.secret, Math.floor(Date.now() / 30_000)),
      );
      expect(await getCustomerAuthenticatorStatus(userId)).toMatchObject({ enabled: true, replacementPending: false, recoveryCodesRemaining: 9 });
      expect((await getCustomerPayoutEligibility(userId)).allowed).toBe(true);

      const payoutStep = Math.floor(Date.now() / 30_000) + 1;
      const code = totpAtStep(recovery.secret, payoutStep);
      const request = await createCustomerPayoutRequest(userId, { ...requestInput(1000, unique("payout-totp")), totpCode: code });
      expect(request.status).toBe("pending");
      expect(await balance(userId)).toEqual({ availableMinor: 9000, lockedMinor: 1000, promotionalMinor: 2000 });

      await expect(createCustomerPayoutRequest(userId, { ...requestInput(1000, unique("payout-totp-replay")), totpCode: code }))
        .rejects.toThrow("invalid, expired, or has already been used");
      expect(await balance(userId)).toEqual({ availableMinor: 9000, lockedMinor: 1000, promotionalMinor: 2000 });
      await cancelCustomerPayoutRequest(userId, Number(request.id));
    } finally {
      if (previousEncryptionKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
      else process.env.TOTP_ENCRYPTION_KEY = previousEncryptionKey;
      await setPolicy({ kyc: false, withdrawals: true, twofa: false, facial: false });
    }
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

  it("prevents customer deletion while a payout is pending and removes payout history after terminal closure", async () => {
    const userId = await createAccount();
    const request = await createCustomerPayoutRequest(userId, requestInput(1000, unique("payout-delete-guard")));
    await expect(deleteAdminCustomer(userId)).rejects.toThrow("Resolve or cancel pending payout requests before deleting this customer.");
    expect(await balance(userId)).toEqual({ availableMinor: 9000, lockedMinor: 1000, promotionalMinor: 2000 });

    await cancelCustomerPayoutRequest(userId, Number(request.id));
    await expect(deleteAdminCustomer(userId)).resolves.toEqual({ success: true });
    const [userRows] = await pool!.execute<any[]>("SELECT id FROM users WHERE id=? LIMIT 1", [userId]);
    const [payoutRows] = await pool!.execute<any[]>("SELECT id FROM payout_requests WHERE userId=? LIMIT 1", [userId]);
    expect(userRows).toHaveLength(0);
    expect(payoutRows).toHaveLength(0);
  });

  it("fails closed when customer withdrawal permission, global policy, or required KYC is missing", async () => {
    const blockedCustomer = await createAccount("user", { withdrawalsEnabled: false, kycRequired: false });
    expect(await getCustomerPayoutEligibility(blockedCustomer)).toEqual({
      allowed: false,
      reason: "Withdrawals are not enabled for this customer account.",
    });
    await expect(createCustomerPayoutRequest(blockedCustomer, requestInput(1000, unique("payout-disabled-customer"))))
      .rejects.toThrow("Withdrawals are not enabled for this customer account");

    const enabledCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: false });
    await setPolicy({ kyc: false, withdrawals: false, twofa: false, facial: false });
    try {
      expect(await getCustomerPayoutEligibility(enabledCustomer)).toEqual({
        allowed: false,
        reason: "Withdrawals are disabled by the global policy.",
      });
      await expect(createCustomerPayoutRequest(enabledCustomer, requestInput(1000, unique("payout-disabled-global"))))
        .rejects.toThrow("Withdrawals are disabled by the global policy");
    } finally {
      await setPolicy({ kyc: false, withdrawals: true, twofa: false, facial: false });
    }

    const kycCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: true });
    expect(await getCustomerPayoutEligibility(kycCustomer)).toEqual({
      allowed: false,
      reason: "Complete the required identity verification before requesting a payout.",
    });
    await expect(createCustomerPayoutRequest(kycCustomer, requestInput(1000, unique("payout-kyc-required"))))
      .rejects.toThrow("Complete the required identity verification");
    const twoFactorCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: false });
    await pool!.execute("UPDATE customer_controls SET twoFactorRequired=1 WHERE userId=?", [twoFactorCustomer]);
    expect(await getCustomerPayoutEligibility(twoFactorCustomer)).toEqual({
      allowed: false,
      reason: "Set up and confirm an authenticator before requesting a payout.",
    });
    await expect(createCustomerPayoutRequest(twoFactorCustomer, requestInput(1000, unique("payout-customer-2fa"))))
      .rejects.toThrow("Set up and confirm an authenticator");

    const globalTwoFactorCustomer = await createAccount("user", { withdrawalsEnabled: true, kycRequired: false });
    await setPolicy({ kyc: false, withdrawals: true, twofa: true, facial: false });
    try {
      expect(await getCustomerPayoutEligibility(globalTwoFactorCustomer)).toMatchObject({
        allowed: false,
        reason: "Set up and confirm an authenticator before requesting a payout.",
      });
      await expect(createCustomerPayoutRequest(globalTwoFactorCustomer, requestInput(1000, unique("payout-global-2fa"))))
        .rejects.toThrow("Set up and confirm an authenticator");
    } finally {
      await setPolicy({ kyc: false, withdrawals: true, twofa: false, facial: false });
    }
    expect(await ledgerCount(blockedCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(enabledCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(kycCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(twoFactorCustomer, "payout_reserve")).toBe(0);
    expect(await ledgerCount(globalTwoFactorCustomer, "payout_reserve")).toBe(0);
  });
});
