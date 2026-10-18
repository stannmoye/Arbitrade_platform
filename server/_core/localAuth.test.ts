import { afterEach, describe, expect, it } from "vitest";
import { createLocalSession, verifyLocalSession } from "./localAuth";

const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("local session authentication version", () => {
  it("signs and returns the authentication version in a local session", () => {
    process.env.SESSION_SECRET = "local-auth-test-secret";
    const token = createLocalSession(42, 7);
    expect(verifyLocalSession(token)).toMatchObject({ userId: 42, authVersion: 7 });
  });

  it("rejects tampering with the signed authentication version", () => {
    process.env.SESSION_SECRET = "local-auth-test-secret";
    const token = createLocalSession(42, 7);
    const parts = token.split(".");
    parts[2] = "8";
    expect(verifyLocalSession(parts.join("."))).toBeNull();
  });

  it("rejects missing and malformed session tokens", () => {
    process.env.SESSION_SECRET = "local-auth-test-secret";
    expect(verifyLocalSession(undefined)).toBeNull();
    expect(verifyLocalSession("not-a-session")).toBeNull();
  });
});
