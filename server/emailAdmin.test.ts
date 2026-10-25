import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => new Map<string, string>());

vi.mock("./db", () => ({
  getAppSetting: vi.fn(async (key: string, fallback = "") => settings.get(key) ?? fallback),
  getDb: vi.fn(),
  setAppSetting: vi.fn(async (key: string, value: string) => {
    settings.set(key, value);
  }),
}));

import { getAppSetting, setAppSetting } from "./db";
import { getEmailConfig, hasSavedEmailConfig, isEmailAdminConfigured, publicEmailConfig, saveEmailConfig, sendEmail } from "./emailAdmin";

beforeEach(() => {
  settings.clear();
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "unit-test-session-secret-with-enough-length");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin-configured email transport", () => {
  it("keeps delivery disabled until an administrator explicitly saves a transport", async () => {
    expect(await hasSavedEmailConfig()).toBe(false);
    expect(await isEmailAdminConfigured()).toBe(false);
    expect(getAppSetting).toHaveBeenCalledWith("email.smtp", "");
  });

  it("fails closed when saved transport metadata is invalid", async () => {
    settings.set("email.smtp", JSON.stringify({
      mode: "unexpected",
      fromAddress: "no-reply@example.test",
    }));
    expect(await isEmailAdminConfigured()).toBe(false);
  });

  it("refuses to send through the default sender when no transport was saved", async () => {
    await expect(sendEmail({
      to: "customer@example.test",
      subject: "Test",
      html: "<p>Test</p>",
    })).rejects.toThrow(/transport is not configured/i);
  });

  it("encrypts the SMTP password in settings and preserves it on a blank password update", async () => {
    await saveEmailConfig({
      mode: "external",
      host: "smtp.example.test",
      port: 587,
      secure: false,
      authType: "login",
      user: "mailer",
      password: "unit-test-mail-password",
      fromName: "Test Mailer",
      fromAddress: "no-reply@example.test",
      replyTo: "",
    });

    const firstSaved = settings.get("email.smtp") || "";
    expect(firstSaved).not.toContain("unit-test-mail-password");
    expect(JSON.parse(firstSaved).passwordCipher).toMatch(/^v1:/);
    expect(await hasSavedEmailConfig()).toBe(true);
    expect(await isEmailAdminConfigured()).toBe(true);

    await saveEmailConfig({ password: undefined, fromName: "Updated Sender" });

    const secondSaved = settings.get("email.smtp") || "";
    expect(secondSaved).not.toContain("unit-test-mail-password");
    expect(await getEmailConfig()).toMatchObject({
      password: "unit-test-mail-password",
      fromName: "Updated Sender",
    });
    expect(setAppSetting).toHaveBeenCalledTimes(2);
  });

  it("never includes a saved SMTP password in the public settings response", async () => {
    await saveEmailConfig({
      mode: "external",
      host: "smtp.example.test",
      port: 587,
      secure: false,
      authType: "login",
      user: "mailer",
      password: "unit-test-mail-password",
      fromName: "Test Mailer",
      fromAddress: "no-reply@example.test",
      replyTo: "",
    });

    const publicConfig = await publicEmailConfig();
    expect(publicConfig).toMatchObject({ hasPassword: true, fromAddress: "no-reply@example.test" });
    expect(publicConfig).not.toHaveProperty("password");
    expect(JSON.stringify(publicConfig)).not.toContain("unit-test-mail-password");
  });
});
