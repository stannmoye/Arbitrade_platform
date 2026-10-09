import { describe, expect, it, vi } from "vitest";
import { createSmtpMailer, isSmtpConfigured, renderEmail } from "./email";
import { decryptEmailPayload, encryptEmailPayload, getDailyDigestSchedule, getZonedMinute } from "./emailQueue";

const smtpEnv = (): NodeJS.ProcessEnv => ({
  MAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "mailer",
  SMTP_PASSWORD: "test-only-password",
  SMTP_FROM_EMAIL: "no-reply@example.test",
  SMTP_FROM_NAME: "Test Mailer",
});

describe("SMTP mail adapter", () => {
  it("fails closed when the provider is disabled or configuration is incomplete", async () => {
    const env: NodeJS.ProcessEnv = { MAIL_PROVIDER: "disabled" };
    const factory = vi.fn();
    const mailer = createSmtpMailer(env, factory as any);
    expect(mailer.isConfigured()).toBe(false);
    expect(isSmtpConfigured({ ...smtpEnv(), SMTP_PASSWORD: "" })).toBe(false);
    await expect(mailer.send("test@example.test", { subject: "x", text: "x", html: "x" })).rejects.toThrow(/disabled|incompletely configured/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses the injected SMTP transport and sends a rendered message", async () => {
    const sent: any[] = [];
    const factory = vi.fn((_config: any) => ({ sendMail: async (message: any) => { sent.push(message); return { messageId: "unit-test-message" }; } }));
    const mailer = createSmtpMailer(smtpEnv(), factory as any);
    expect(mailer.isConfigured()).toBe(true);
    const message = renderEmail("email_test", { testId: "test-123" });
    const result = await mailer.send("customer@example.test", message);
    expect(factory).toHaveBeenCalledOnce();
    expect(factory.mock.calls[0]?.[0]).toMatchObject({ host: "smtp.example.test", port: 587, secure: false, auth: { user: "mailer", pass: "test-only-password" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "customer@example.test", subject: "[TEST] Email delivery test", text: expect.stringContaining("test-123") });
    expect(result).toEqual({ messageId: "unit-test-message" });
  });

  it("rejects invalid recipients before contacting SMTP", async () => {
    const sendMail = vi.fn();
    const mailer = createSmtpMailer(smtpEnv(), (() => ({ sendMail })) as any);
    await expect(mailer.send("not-an-address", { subject: "x", text: "x", html: "x" })).rejects.toThrow("Invalid email recipient");
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("email templates and encrypted outbox payloads", () => {
  it("escapes untrusted system and direct-admin content", () => {
    const notice = renderEmail("system_notification", { title: "<script>bad</script>", body: "<img src=x onerror=alert(1)>" });
    expect(notice.html).not.toContain("<script>");
    expect(notice.html).toContain("&lt;script&gt;");
    const direct = renderEmail("admin_message", { subject: "<b>hello</b>", body: "<svg onload=alert(1)>" });
    expect(direct.html).not.toContain("<svg");
    expect(direct.html).toContain("&lt;svg");
  });

  it("labels balance notices as simulated internal ledger adjustments, never deposits or withdrawals", () => {
    const email = renderEmail("wallet_adjustment", { mode: "credit", amount: "12.50", currency: "USD", reference: "ledger-1" });
    expect(email.subject).toContain("[Demo]");
    expect(email.text).toContain("not a real deposit or withdrawal");
    expect(email.text).toContain("No cash, custody asset, or payment was moved");
  });

  it("encrypts queued payloads and authenticates ciphertext on read", () => {
    const encrypted = encryptEmailPayload({ code: "01234567", body: "private" }, "test-session-secret");
    expect(encrypted).not.toContain("01234567");
    expect(decryptEmailPayload(encrypted, "test-session-secret")).toEqual({ code: "01234567", body: "private" });
    const parts = encrypted.split(".");
    parts[2] = `${parts[2]?.slice(0, -1)}A`;
    expect(() => decryptEmailPayload(parts.join("."), "test-session-secret")).toThrow();
  });

  it("validates digest schedule settings and formats a wall-clock minute in its timezone", () => {
    expect(getDailyDigestSchedule({ EMAIL_DAILY_DIGEST_TIME: "", EMAIL_DAILY_DIGEST_TIMEZONE: "Europe/London" })).toBeNull();
    expect(getDailyDigestSchedule({ EMAIL_DAILY_DIGEST_TIME: "25:00", EMAIL_DAILY_DIGEST_TIMEZONE: "Europe/London" })).toBeNull();
    expect(getDailyDigestSchedule({ EMAIL_DAILY_DIGEST_TIME: "08:30", EMAIL_DAILY_DIGEST_TIMEZONE: "Not/AZone" })).toBeNull();
    expect(getDailyDigestSchedule({ EMAIL_DAILY_DIGEST_TIME: "08:30", EMAIL_DAILY_DIGEST_TIMEZONE: "Europe/London" })).toEqual({ time: "08:30", timezone: "Europe/London" });
    expect(getZonedMinute(new Date("2026-10-09T07:30:00.000Z"), "Europe/London")).toEqual({ dateKey: "2026-10-09", time: "08:30" });
  });
});
