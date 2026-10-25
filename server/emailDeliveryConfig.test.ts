import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./emailAdmin", () => ({
  isEmailAdminConfigured: vi.fn(),
  sendEmail: vi.fn(),
}));

import { isEmailAdminConfigured, sendEmail as sendPortalEmail } from "./emailAdmin";
import { isEmailDeliveryConfigured, sendRenderedEmail } from "./email";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEmailAdminConfigured).mockResolvedValue(false);
  vi.mocked(sendPortalEmail).mockResolvedValue({ sent: true, messageId: "portal-message-id" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin-portal-only email delivery configuration", () => {
  it("allows the application to run without email being configured", async () => {
    expect(await isEmailDeliveryConfigured()).toBe(false);
  });

  it("uses the saved admin-portal transport for transactional mail", async () => {
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

  it("fails closed when admin-portal mail settings are unavailable", async () => {
    vi.mocked(isEmailAdminConfigured).mockRejectedValue(new Error("configuration unavailable"));
    expect(await isEmailDeliveryConfigured()).toBe(false);
  });
});
