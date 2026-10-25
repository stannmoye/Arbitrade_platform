import { isEmailAdminConfigured, sendEmail } from "./emailAdmin";

export type EmailTemplate =
  | "system_notification"
  | "wallet_adjustment"
  | "admin_message"
  | "daily_digest"
  | "email_verification"
  | "password_reset"
  | "email_test";

export type EmailPayload = Record<string, string | number | boolean | null | undefined>;
export type RenderedEmail = { subject: string; text: string; html: string };
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]!));
const cleanText = (value: unknown, max = 8000) => String(value ?? "").trim().slice(0, max);
const paragraph = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, "<br>");
const wrap = (title: string, body: string) => `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.55"><div style="max-width:620px;margin:24px auto;padding:24px;border:1px solid #e5e9f0;border-radius:12px"><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}<p style="font-size:12px;color:#667085;margin-top:28px">Automated account message. Do not reply with passwords or verification codes.</p></div></body></html>`;

export function renderEmail(template: EmailTemplate, payload: EmailPayload): RenderedEmail {
  switch (template) {
    case "system_notification": {
      const title = cleanText(payload.title, 200) || "Account notification";
      const body = cleanText(payload.body, 4000);
      return { subject: `Account notification: ${title}`.slice(0, 180), text: `${title}\n\n${body}`, html: wrap(title, `<p>${paragraph(body)}</p>`) };
    }
    case "wallet_adjustment": {
      const direction = payload.mode === "debit" ? "debit" : "credit";
      const title = `Demo wallet ${direction} recorded`;
      const amount = cleanText(payload.amount, 64);
      const currency = cleanText(payload.currency, 32);
      const reference = cleanText(payload.reference, 120);
      const text = `A simulated ${direction} adjustment of ${amount} ${currency} was recorded in your internal demo ledger.${reference ? ` Reference: ${reference}.` : ""}\n\nThis is not a real deposit or withdrawal. No cash, custody asset, or payment was moved.`;
      const html = wrap(title, `<p>A simulated ${direction} adjustment of <strong>${escapeHtml(amount)} ${escapeHtml(currency)}</strong> was recorded in your internal demo ledger.</p><p>This is <strong>not a real deposit or withdrawal</strong>. No cash, custody asset, or payment was moved.</p>${reference ? `<p>Reference: ${escapeHtml(reference)}</p>` : ""}`);
      return { subject: `[Demo] ${title}`, text, html };
    }
    case "admin_message": {
      const subjectLine = cleanText(payload.subject, 160) || "Message from the support team";
      const body = cleanText(payload.body, 8000);
      return { subject: subjectLine, text: body, html: wrap(subjectLine, `<p>${paragraph(body)}</p>`) };
    }
    case "daily_digest": {
      const date = cleanText(payload.date, 32);
      const timezone = cleanText(payload.timezone, 80);
      const activityCount = Math.max(0, Number(payload.activityCount) || 0);
      const unreadCount = Math.max(0, Number(payload.unreadCount) || 0);
      const title = `Your daily account activity summary${date ? ` · ${date}` : ""}`;
      const text = `${title}\n\nDemo-ledger activity recorded: ${activityCount}\nUnread in-app notifications: ${unreadCount}\nReporting timezone: ${timezone || "not specified"}\n\nThis is an informational summary of internal demo records. It is not a statement of cash, custody, or withdrawable funds.`;
      const html = wrap(title, `<p>Demo-ledger activity recorded: <strong>${activityCount}</strong></p><p>Unread in-app notifications: <strong>${unreadCount}</strong></p><p>Reporting timezone: ${escapeHtml(timezone || "not specified")}</p><p><strong>Informational only:</strong> this summary covers internal demo records, not cash, custody, or withdrawable funds.</p>`);
      return { subject: title, text, html };
    }
    case "email_verification": {
      const code = cleanText(payload.code, 12);
      const title = "Verify your email address";
      return { subject: title, text: `Your email verification code is ${code}. It expires in 15 minutes. This verifies access to this inbox only; it does not complete identity verification or KYC.`, html: wrap(title, `<p>Your verification code is:</p><p style="font-size:28px;letter-spacing:6px"><strong>${escapeHtml(code)}</strong></p><p>It expires in 15 minutes. This verifies access to this inbox only; it does not complete identity verification or KYC.</p>`) };
    }
    case "password_reset": {
      const code = cleanText(payload.code, 12);
      const title = "Reset your password";
      return { subject: title, text: `Your one-time password reset code is ${code}. It expires in 30 minutes.\n\nIf you did not request this, ignore this message.`, html: wrap(title, `<p>Your one-time password reset code is:</p><p style="font-size:28px;letter-spacing:6px"><strong>${escapeHtml(code)}</strong></p><p>It expires in 30 minutes. If you did not request this, ignore this message.</p>`) };
    }
    case "email_test": {
      const testId = cleanText(payload.testId, 80);
      const title = "Email delivery test";
      return { subject: `[TEST] ${title}`, text: `This is a test message from the Arbitrade email system. Test ID: ${testId}. No customer transaction was created.`, html: wrap(title, `<p>This is a test message from the email system.</p><p>Test ID: ${escapeHtml(testId)}</p><p>No customer transaction was created.</p>`) };
    }
  }
}

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

// Email delivery configuration is stored and managed in the authenticated admin portal.
export const isEmailDeliveryConfigured = () => isEmailAdminConfigured();
export async function sendRenderedEmail(to: string, rendered: RenderedEmail): Promise<{ sent: boolean; messageId?: string }> {
  const result = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
  return { sent: result.sent, ...("messageId" in result ? { messageId: result.messageId } : {}) };
}
