import { describe, expect, it } from "vitest";
import { canAttemptOneTimeCode, generateOneTimeCode, hashOneTimeCode, isWithinResendCooldown } from "./emailAuth";

describe("email auth codes", () => {
  it("generates eight-digit numeric one-time codes", () => {
    for (let i = 0; i < 100; i++) expect(generateOneTimeCode()).toMatch(/^\d{8}$/);
  });

  it("uses a salted SHA-256 hash instead of storing the code", () => {
    const code = "01234567";
    const a = hashOneTimeCode(code, "salt-a");
    const b = hashOneTimeCode(code, "salt-b");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(code);
    expect(a).not.toBe(b);
    expect(hashOneTimeCode(code, "salt-a")).toBe(a);
  });

  it("allows only the configured number of one-time-code attempts", () => {
    expect(canAttemptOneTimeCode(0)).toBe(true);
    expect(canAttemptOneTimeCode(4)).toBe(true);
    expect(canAttemptOneTimeCode(5)).toBe(false);
    expect(canAttemptOneTimeCode(6)).toBe(false);
    expect(canAttemptOneTimeCode(-1)).toBe(false);
    expect(canAttemptOneTimeCode(1.5)).toBe(false);
  });

  it("enforces a one-minute resend cooldown", () => {
    const requestedAt = new Date("2026-10-09T08:00:00.000Z");
    expect(isWithinResendCooldown(requestedAt, new Date("2026-10-09T08:00:59.999Z"))).toBe(true);
    expect(isWithinResendCooldown(requestedAt, new Date("2026-10-09T08:01:00.000Z"))).toBe(false);
  });
});
