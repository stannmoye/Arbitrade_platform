import { describe, expect, it } from "vitest";
import { isValidTotpEncryptionKey } from "./totp";

describe("TOTP encryption key validation", () => {
  it("accepts exactly 32-byte hexadecimal keys", () => {
    expect(isValidTotpEncryptionKey("a".repeat(64))).toBe(true);
  });

  it("accepts canonical base64 encoding of exactly 32 bytes", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(isValidTotpEncryptionKey(key)).toBe(true);
  });

  it.each(["", "not-a-key", "a".repeat(63), "a".repeat(65), "A".repeat(43) + "!", "A".repeat(44)])(
    "rejects malformed or incorrectly sized key values",
    (key) => {
      expect(isValidTotpEncryptionKey(key)).toBe(false);
    },
  );
});
