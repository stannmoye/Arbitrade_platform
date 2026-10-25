import { describe, expect, it } from "vitest";
import { renderEmail } from "./email";
import { decryptEmailPayload, encryptEmailPayload, getDailyDigestSchedule, getZonedMinute } from "./emailQueue";

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
    const ciphertext = parts[2] || "";
    const middle = Math.floor(ciphertext.length / 2);
    parts[2] = `${ciphertext.slice(0, middle)}${ciphertext[middle] === "A" ? "B" : "A"}${ciphertext.slice(middle + 1)}`;
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
