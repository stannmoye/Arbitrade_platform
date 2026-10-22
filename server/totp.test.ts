import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeBase32, encodeBase32, totpAtStep, verifyTotpCode, totpProvisioningUri } from "./modules/totp";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0060_customer_totp_authenticators.sql", import.meta.url), "utf8");
const customerSettingsUi = readFileSync(new URL("../client/src/components/CustomerAuthenticatorSettings.tsx", import.meta.url), "utf8");
const payoutUi = readFileSync(new URL("../client/src/components/PayoutRequests.tsx", import.meta.url), "utf8");

describe("TOTP primitives", () => {
  it("round-trips base32 secrets", () => {
    const bytes = Buffer.from("hello authenticator");
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
  });

  it("matches RFC 6238 SHA-1 test data and rejects a replayed time step", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpAtStep(secret, 1)).toBe("287082");
    expect(verifyTotpCode(secret, "287082", 59_000, -1)).toBe(1);
    expect(verifyTotpCode(secret, "287082", 59_000, 1)).toBeNull();
    expect(verifyTotpCode(secret, "00000x", 59_000, -1)).toBeNull();
  });

  it("creates an authenticator-app provisioning URI without a network dependency", () => {
    const uri = totpProvisioningUri("JBSWY3DPEHPK3PXP", "customer@example.test");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Arbitrade");
  });
});

describe("customer TOTP integration contract", () => {
  it("stores only encrypted authenticator secrets and tracks a monotonic replay counter", () => {
    expect(schemaSource).toContain('mysqlTable("customer_totp_authenticators"');
    expect(migrationSource).toContain("pendingSecretCiphertext");
    expect(migrationSource).toContain("lastUsedStep");
    expect(dbSource).toContain("encryptTotpSecret(secret)");
    expect(dbSource).toContain("decryptTotpSecret(row.secretCiphertext)");
    expect(dbSource).toContain("lastUsedStep: step");
    expect(dbSource).toContain("await consumePayoutAuthenticatorCode(tx, userId, totpCode)");
  });

  it("exposes protected enrollment and replacement endpoints and collects a code with each protected payout", () => {
    expect(routerSource).toContain("startAuthenticatorEnrollment: protectedProcedure");
    expect(routerSource).toContain("confirmAuthenticatorEnrollment: protectedProcedure");
    expect(routerSource).toContain("totpCode: z.string().regex(/^\\d{6}$/).optional()");
    expect(customerSettingsUi).toContain("Confirm authenticator");
    expect(customerSettingsUi).toContain("result.secret");
    expect(payoutUi).toContain('id="payout-totp-code"');
    expect(payoutUi).toContain("totpCode: totpCode || undefined");
    expect(routerSource).toContain("startAuthenticatorReplacement: protectedProcedure");
    expect(routerSource).toContain("confirmAuthenticatorReplacement: protectedProcedure");
    expect(customerSettingsUi).toContain("Replace authenticator");
    expect(customerSettingsUi).toContain("The existing authenticator remains active until you confirm the replacement.");
    expect(dbSource).toContain("startCustomerAuthenticatorReplacement");
    expect(dbSource).toContain("confirmCustomerAuthenticatorReplacement");
  });
});
