import { describe, expect, it } from "vitest";
import { validateInitialAccountInput } from "./initial-accounts-input.mjs";

const validInput = () => ({
  ADMIN_EMAIL: " Admin@Example.test ",
  ADMIN_PASSWORD: "admin-password-123",
});

describe("fresh-install administrator validation", () => {
  it("normalizes the administrator email", () => {
    expect(validateInitialAccountInput(validInput())).toEqual({
      adminEmail: "admin@example.test",
      adminPassword: "admin-password-123",
    });
  });

  it("rejects missing or invalid administrator email addresses", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_EMAIL: "" })).toThrow(/ADMIN_EMAIL/);
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_EMAIL: "not-an-email" })).toThrow(/ADMIN_EMAIL/);
  });

  it("requires an administrator password between 12 and 200 characters", () => {
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_PASSWORD: "short" })).toThrow(/ADMIN_PASSWORD/);
    expect(() => validateInitialAccountInput({ ...validInput(), ADMIN_PASSWORD: "a".repeat(201) })).toThrow(/ADMIN_PASSWORD/);
  });

  it("does not require or return customer credentials", () => {
    expect(validateInitialAccountInput(validInput())).not.toHaveProperty("customerEmail");
    expect(validateInitialAccountInput(validInput())).not.toHaveProperty("customerPassword");
  });
});
