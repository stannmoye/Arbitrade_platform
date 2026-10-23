import { afterEach, describe, expect, it } from "vitest";
import { decryptVaultValue, encryptVaultValue, isApiAccessVaultConfigured } from "./api-access-vault";

const originalKey = process.env.API_ACCESS_ENCRYPTION_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.API_ACCESS_ENCRYPTION_KEY;
  else process.env.API_ACCESS_ENCRYPTION_KEY = originalKey;
});

describe("API access encrypted provider vault", () => {
  it("encrypts provider values at rest and decrypts them with the configured key", () => {
    process.env.API_ACCESS_ENCRYPTION_KEY = "test-only-encryption-key-long-enough-123456789";
    const secret = "very-private-token-value";
    const serialized = encryptVaultValue(secret);
    expect(serialized).not.toContain(secret);
    expect(decryptVaultValue(serialized)).toBe(secret);
    expect(isApiAccessVaultConfigured()).toBe(true);
  });

  it("rejects tampered ciphertext rather than returning corrupted provider secrets", () => {
    process.env.API_ACCESS_ENCRYPTION_KEY = "test-only-encryption-key-long-enough-123456789";
    const envelope = JSON.parse(encryptVaultValue("wallet-provider-secret")) as { v: number; iv: string; tag: string; ciphertext: string };
    envelope.ciphertext = (envelope.ciphertext.startsWith("A") ? "B" : "A") + envelope.ciphertext.slice(1);
    expect(() => decryptVaultValue(JSON.stringify(envelope))).toThrow();
  });

  it("fails closed when the private encryption key is missing or too short", () => {
    delete process.env.API_ACCESS_ENCRYPTION_KEY;
    expect(isApiAccessVaultConfigured()).toBe(false);
    expect(() => encryptVaultValue("secret")).toThrow(/API_ACCESS_ENCRYPTION_KEY/);
    process.env.API_ACCESS_ENCRYPTION_KEY = "short";
    expect(() => decryptVaultValue('{"v":1,"iv":"AA","tag":"AA","ciphertext":"AA"}')).toThrow(/API_ACCESS_ENCRYPTION_KEY/);
  });
});
