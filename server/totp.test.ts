import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32, totpAtStep, verifyTotpCode, totpProvisioningUri } from "./modules/totp";

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
