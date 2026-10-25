import { describe, expect, it } from "vitest";
import { validateInitialAccountInput } from "./initial-accounts-input.mjs";

const validInput = () => ({
  ADMIN_EMAIL: " Admin@Example.test ",
  ADMIN_PASSWORD: "admin-password-123",
  CUSTOMER_EMAIL: "Customer@Example.test",
  CUSTOMER_PASSWORD: "customer-password-456",
});

describe("fresh-install initial account validation", () => {
  it("normalizes both email addresses", () => {
    expect(validateInitialAccountInput(validInput())).toMatchObject({
      adminEmail: "admin@example.test",
      customerEmail: "customer@example.test",
    });
  });

  it("rejects missing or invalid email addresses", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_EMAIL: "" })).toThrow(/CUSTOMER_EMAIL/);
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_EMAIL: "not-an-email" })).toThrow(/ADMIN_EMAIL/);
  });

  it("requires independent passwords of at least 12 characters", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_PASSWORD: "short" })).toThrow(/ADMIN_PASSWORD/);
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_PASSWORD: "short" })).toThrow(/CUSTOMER_PASSWORD/);
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_PASSWORD: "admin-password-123" })).toThrow(/must be different/);
  });

  it("rejects passwords longer than the application-supported maximum", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_PASSWORD: "a".repeat(201) })).toThrow(/ADMIN_PASSWORD/);
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_PASSWORD: "b".repeat(201) })).toThrow(/CUSTOMER_PASSWORD/);
  });

  it("rejects identical administrator and customer email addresses", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_EMAIL: "ADMIN@example.test" })).toThrow(/different email addresses/);
  });

  it("rejects oversized email addresses", () => {
    const longEmail = "a".repeat(310) + "@example.test";
    expect(() => validateInitialAccountInput({ ...validInput(), CUSTOMER_EMAIL: longEmail })).toThrow(/CUSTOMER_EMAIL/);
  });
});
