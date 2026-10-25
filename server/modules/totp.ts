import { getRuntimeSecret } from "../_core/runtimeSecrets";
import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function encryptionKey(): Buffer {
  const raw = getRuntimeSecret("TOTP_ENCRYPTION_KEY");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be configured as a 32-byte hex or base64 key.");
  return key;
}

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

const RECOVERY_CODE_COUNT = 10;

/** Generate one-time high-entropy recovery codes. Plaintext values are returned only once. */
export function generateTotpRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(10).toString("hex").toUpperCase();
    return raw.match(/.{4}/g)!.join("-");
  });
}

/** Hash a formatted recovery code for storage. Invalid input returns null. */
export function hashTotpRecoveryCode(code: string): string | null {
  const normalized = String(code ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-F0-9]{20}$/.test(normalized)) return null;
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Return the stored hashes with exactly one matching recovery code consumed. */
export function consumeTotpRecoveryCode(code: string, storedHashes: readonly string[] | null | undefined): string[] | null {
  const hashedCode = hashTotpRecoveryCode(code);
  if (!hashedCode || !Array.isArray(storedHashes) || storedHashes.length === 0) return null;
  const candidate = Buffer.from(hashedCode, "hex");
  let matchIndex = -1;
  for (let index = 0; index < storedHashes.length; index++) {
    const storedHash = storedHashes[index];
    if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/i.test(storedHash)) return null;
    const stored = Buffer.from(storedHash, "hex");
    if (crypto.timingSafeEqual(candidate, stored)) matchIndex = index;
  }
  if (matchIndex < 0) return null;
  return storedHashes.filter((_, index) => index !== matchIndex);
}

export function encryptTotpSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptTotpSecret(encrypted: string): string {
  const [version, ivText, tagText, ciphertextText, extra] = encrypted.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText || extra !== undefined) throw new Error("Stored authenticator secret is invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export function totpAtStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, "0");
}

/** Returns the matched 30-second counter, rejecting counters already consumed. */
export function verifyTotpCode(secret: string, code: string, nowMs = Date.now(), lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(code) || !Number.isFinite(nowMs) || !Number.isSafeInteger(lastUsedStep)) return null;
  const currentStep = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [currentStep + 1, currentStep, currentStep - 1]) {
    if (step <= lastUsedStep || step < 0) continue;
    const expected = totpAtStep(secret, step);
    const a = Buffer.from(expected, "ascii");
    const b = Buffer.from(code, "ascii");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return step;
  }
  return null;
}

export function totpProvisioningUri(secret: string, account: string, issuer = "Arbitrade"): string {
  const label = `${issuer}:${account}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
