import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptVaultValue, encryptVaultValue, isApiAccessVaultConfigured, testMetaWhatsAppCredentials } from "./api-access-vault";

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

describe("Meta WhatsApp connection verification", () => {
  it("checks the configured phone number without exposing the access token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer private-test-token");
      return new Response(JSON.stringify({
        id: "1234567890",
        display_phone_number: "+2348000000000",
        verified_name: "Arbitrade",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await testMetaWhatsAppCredentials({
      accessToken: "private-test-token",
      phoneNumberId: "1234567890",
      graphApiVersion: "v26.0",
    });
    expect(result.success).toBe(true);
    expect(result.displayPhoneNumber).toBe("+2348000000000");
    expect(JSON.stringify(result)).not.toContain("private-test-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a safe diagnostic when Meta rejects credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "secret details" } }), { status: 401 })));
    await expect(testMetaWhatsAppCredentials({
      accessToken: "private-test-token",
      phoneNumberId: "1234567890",
      graphApiVersion: "v26.0",
    })).rejects.toThrow("Meta rejected the credentials");
  });
});
