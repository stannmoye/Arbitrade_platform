import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./emailAdmin", () => ({
  hasSavedEmailConfig: vi.fn(),
  isEmailAdminConfigured: vi.fn(),
  sendEmail: vi.fn(),
}));

import { hasSavedEmailConfig, isEmailAdminConfigured, sendEmail as sendPortalEmail } from "./emailAdmin";
import { isEmailDeliveryConfigured, sendRenderedEmail } from "./email";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MAIL_PROVIDER", "disabled");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
  vi.stubEnv("SMTP_FROM_EMAIL", "");
  vi.mocked(hasSavedEmailConfig).mockResolvedValue(false);
  vi.mocked(isEmailAdminConfigured).mockResolvedValue(false);
  vi.mocked(sendPortalEmail).mockResolvedValue({ sent: true, messageId: "portal-message-id" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared email delivery configuration", () => {
  it("does not require SMTP to be available when no transport is configured", async () => {
    expect(await isEmailDeliveryConfigured()).toBe(false);
  });

  it("uses the saved admin-portal transport for transactional mail", async () => {
    vi.mocked(hasSavedEmailConfig).mockResolvedValue(true);
    vi.mocked(isEmailAdminConfigured).mockResolvedValue(true);

    expect(await isEmailDeliveryConfigured()).toBe(true);
    await expect(sendRenderedEmail("customer@example.test", {
      subject: "Test subject",
      text: "Test text",
      html: "<p>Test text</p>",
    })).resolves.toEqual({ messageId: "portal-message-id" });

    expect(sendPortalEmail).toHaveBeenCalledWith({
      to: "customer@example.test",
      subject: "Test subject",
      text: "Test text",
      html: "<p>Test text</p>",
    });
  });

  it("uses the legacy environment SMTP fallback only when no portal config is saved", async () => {
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASSWORD", "test-only-password");
    vi.stubEnv("SMTP_FROM_EMAIL", "no-reply@example.test");
    vi.mocked(hasSavedEmailConfig).mockResolvedValue(false);

    expect(await isEmailDeliveryConfigured()).toBe(true);
    expect(sendPortalEmail).not.toHaveBeenCalled();
  });

  it("fails closed when an explicit portal config is saved but its transport is not ready", async () => {
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASSWORD", "test-only-password");
    vi.stubEnv("SMTP_FROM_EMAIL", "no-reply@example.test");
    vi.mocked(hasSavedEmailConfig).mockResolvedValue(true);
    vi.mocked(isEmailAdminConfigured).mockResolvedValue(false);

    expect(await isEmailDeliveryConfigured()).toBe(false);
  });
});
