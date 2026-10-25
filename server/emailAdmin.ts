import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { getAppSetting, getDb, setAppSetting } from "./db";
import { sql } from "drizzle-orm";

const execFileAsync = promisify(execFile);
export type EmailMode = "external" | "direct";
export type EmailProvider = "local" | "local-smtp" | "sendgrid" | "aws-ses" | "other";
export type EmailConfig = { provider: EmailProvider; region: string; mode: EmailMode; host: string; port: number; secure: boolean; authType: "login" | "plain" | "none"; user: string; password: string; fromName: string; fromAddress: string; replyTo: string };
export type MailAttachment = { filename: string; content: string; contentType?: string };
const baseConfig = (): EmailConfig => ({ provider: "local", region: "us-east-1", mode: "direct", host: "127.0.0.1", port: 25, secure: false, authType: "login", user: "", password: "", fromName: "Arbitrade", fromAddress: "", replyTo: "" });

function configEncryptionKey() {
  const secret = process.env.SESSION_SECRET || process.env.PASSWORD_PEPPER;
  if (!secret || secret.length < 16) throw new Error("A strong SESSION_SECRET or PASSWORD_PEPPER is required to protect SMTP credentials.");
  return crypto.scryptSync(secret, "arbitrade-email-config-v1", 32);
}
function encryptConfigPassword(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", configEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
function decryptConfigPassword(value: string) {
  if (!value.startsWith("v1:")) return value; // tolerate the branch's legacy plaintext setting until it is next saved
  const [, ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) throw new Error("Saved SMTP credential is malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", configEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function isValidSenderAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

export async function hasSavedEmailConfig() {
  const raw = (await getAppSetting("email.smtp", "")) || "";
  if (!raw.trim() || raw.trim() === "{}") return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && typeof parsed.mode === "string" && typeof parsed.fromAddress === "string" && parsed.fromAddress.trim());
  } catch {
    return false;
  }
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const raw = await getAppSetting("email.smtp", "{}");
  let parsed: Partial<EmailConfig> & { passwordCipher?: string } = {};
  try { parsed = JSON.parse(raw || "{}"); } catch { /* use defaults */ }
  const password = parsed.passwordCipher ? decryptConfigPassword(parsed.passwordCipher) : String(parsed.password || "");
  const validProviders: EmailProvider[] = ["local", "local-smtp", "sendgrid", "aws-ses", "other"];
  return { ...baseConfig(), ...parsed, provider: validProviders.includes(parsed.provider as EmailProvider) ? parsed.provider as EmailProvider : (parsed.mode === "direct" ? "local" : "other"), region: typeof parsed.region === "string" ? parsed.region : "us-east-1", password, port: Number(parsed.port || 25), secure: Boolean(parsed.secure), authType: parsed.authType === "plain" || parsed.authType === "none" ? parsed.authType : "login" };
}
export async function saveEmailConfig(input: Partial<EmailConfig> & { clearPassword?: boolean }, updatedBy?: number) {
  const { clearPassword = false, ...configInput } = input;
  const current = await getEmailConfig();
  // An omitted or blank password means "keep the saved password", not "erase it",
  // unless the administrator explicitly switches providers and clears old credentials.
  const submittedPassword = typeof configInput.password === "string" && configInput.password.length > 0 ? configInput.password : clearPassword ? "" : current.password;
  const next = { ...current, ...configInput, password: submittedPassword };
  const { password, ...safeConfig } = next;
  await setAppSetting("email.smtp", JSON.stringify({ ...safeConfig, passwordCipher: password ? encryptConfigPassword(password) : "" }), updatedBy);
  return { ...next, password: next.password ? "••••••••" : "" };
}
export async function publicEmailConfig() {
  const c = await getEmailConfig();
  return { provider: c.provider, region: c.region, mode: c.mode, host: c.host, port: c.port, secure: c.secure, authType: c.authType, user: c.user, fromName: c.fromName, fromAddress: c.fromAddress, replyTo: c.replyTo, hasPassword: Boolean(c.password) };
}
export async function isEmailAdminConfigured() {
  if (!(await hasSavedEmailConfig())) return false;
  let config: EmailConfig;
  try {
    config = await getEmailConfig();
  } catch {
    return false;
  }
  if (!isValidSenderAddress(config.fromAddress)) return false;
  if (config.mode === "external") {
    if (config.provider === "local") return false;
    const host = typeof config.host === "string" ? config.host.trim() : "";
    const user = typeof config.user === "string" ? config.user.trim() : "";
    const password = typeof config.password === "string" ? config.password : "";
    return Boolean(host
      && Number.isInteger(config.port) && config.port > 0 && config.port <= 65535
      && (!user || password.length > 0)
      && (config.provider === "local-smtp" || config.provider === "other" || Boolean(user && password)));
  }
  if (config.mode !== "direct" || config.provider !== "local") return false;
  try {
    await access(process.env.SENDMAIL_PATH || "/usr/sbin/sendmail", fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function textFromHtml(html: string) { return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
async function deliver(to: string | string[], subject: string, html: string, text?: string, attachments?: MailAttachment[]) {
  if (!(await isEmailAdminConfigured())) {
    throw new Error("Email transport is not configured or is not ready.");
  }
  const config = await getEmailConfig();
  if (!isValidSenderAddress(config.fromAddress)) throw new Error("A valid email sender address is required.");
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) throw new Error("No email recipients supplied");
  const message = { from: config.fromName ? `\"${config.fromName}\" <${config.fromAddress}>` : config.fromAddress, to: recipients.join(","), replyTo: config.replyTo || undefined, subject, html, text: text || textFromHtml(html), attachments: (attachments || []).map(a => ({ filename: a.filename, content: Buffer.from(a.content, "base64"), contentType: a.contentType })) };
  if (config.mode === "direct") {
    const transport = nodemailer.createTransport({ sendmail: true, newline: "unix", path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" });
    const result = await transport.sendMail(message);
    return { messageId: String(result.messageId || "") };
  }
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.authType === "none" || !config.user ? undefined : { type: config.authType, user: config.user, pass: config.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  const result = await transport.sendMail(message);
  return { messageId: String(result.messageId || "") };
}
export async function sendEmail(input: { to: string | string[]; subject: string; html: string; text?: string; attachments?: MailAttachment[] }) {
  const result = await deliver(input.to, input.subject, input.html, input.text, input.attachments);
  return { sent: true, messageId: result.messageId };
}
export async function testEmailConnection(to: string) { await sendEmail({ to, subject: "WiseBond SMTP test", html: "<p>This is a WiseBond SMTP configuration test. Email delivery is working.</p>" }); return { sent: true }; }
export async function sendAdminComposedEmail(adminId: number, input: { recipients: string[]; subject: string; htmlBody: string; textBody?: string; attachments?: MailAttachment[] }) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  if (!input.recipients.length) throw new Error("Select at least one recipient");
  const attachmentJson = JSON.stringify((input.attachments || []).map(x => ({ filename: x.filename, contentType: x.contentType, size: Buffer.from(x.content, "base64").length })));
  const result = await db.execute(sql`INSERT INTO admin_email_messages (adminId,recipientCount,subject,htmlBody,textBody,attachmentJson,status) VALUES (${adminId},${input.recipients.length},${input.subject},${input.htmlBody},${input.textBody || textFromHtml(input.htmlBody)},${attachmentJson},'QUEUED')`);
  const id = Number((result as any)[0]?.insertId || 0);
  try { await sendEmail({ to: input.recipients, subject: input.subject, html: input.htmlBody, text: input.textBody, attachments: input.attachments }); await db.execute(sql`UPDATE admin_email_messages SET status='SENT',sentAt=UTC_TIMESTAMP() WHERE id=${id}`); return { sent: true, id }; }
  catch (error) { await db.execute(sql`UPDATE admin_email_messages SET status='FAILED',lastError=${error instanceof Error ? error.message : "Email delivery failed"} WHERE id=${id}`); throw error; }
}
export async function listEmailRecipients() { const db = await getDb(); if (!db) throw new Error("Database is not available"); const result = await db.execute(sql`SELECT id,name,email FROM users WHERE email IS NOT NULL AND email<>'' ORDER BY role DESC,name,email`); return (result as any)[0] || []; }

export async function issuePasswordReset(userId: number, email: string) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await db.execute(sql`UPDATE password_reset_tokens SET usedAt=UTC_TIMESTAMP() WHERE userId=${userId} AND usedAt IS NULL`);
  await db.execute(sql`INSERT INTO password_reset_tokens (userId,tokenHash,expiresAt) VALUES (${userId},${hash},DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`);
  const base = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/customer?reset_token=${token}`;
  try { await sendEmail({ to: email, subject: "Reset your WiseBond password", html: `<div style="font-family:Arial,sans-serif"><h2>Password reset requested</h2><p>Use the secure link below within 30 minutes to choose a new password.</p><p><a href="${link}">Reset my password</a></p><p>If you did not request this, you can ignore this email.</p></div>` }); } catch (error) { if (process.env.NODE_ENV === "production") throw error; console.warn("[PasswordReset DEV] mail transport unavailable", error instanceof Error ? error.message : error); return { sent: true, developmentToken: token }; }
  return { sent: true };
}
export async function resetPassword(token: string, passwordHash: string) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await db.execute(sql`SELECT id,userId FROM password_reset_tokens WHERE tokenHash=${hash} AND usedAt IS NULL AND expiresAt>UTC_TIMESTAMP() LIMIT 1`);
  const row = (result as any)[0]?.[0] || (result as any)[0];
  if (!row) throw new Error("The reset link is invalid or expired");
  await db.execute(sql`UPDATE users SET passwordHash=${passwordHash} WHERE id=${Number(row.userId)} AND role='user'`);
  await db.execute(sql`UPDATE password_reset_tokens SET usedAt=UTC_TIMESTAMP() WHERE id=${Number(row.id)}`);
  return { success: true, userId: Number(row.userId) };
}

function dayKey() { return new Date().toISOString().slice(0, 10); }
export async function runDailyEmailReports(force = false) {
  const db = await getDb(); if (!db) return { skipped: true, reason: "database" };
  const now = new Date(); const hour = Number(await getAppSetting("email.dailyCloseHourUtc", "23")); const minute = Number(await getAppSetting("email.dailyCloseMinuteUtc", "59"));
  if (!force && (now.getUTCHours() < hour || (now.getUTCHours() === hour && now.getUTCMinutes() < minute))) return { skipped: true, reason: "before-close" };
  const key = `email.dailyReports.${dayKey()}`; if (!force && await getAppSetting(key)) return { skipped: true, reason: "already-sent" };
  const rowsResult = await db.execute(sql`SELECT id,name,email FROM users WHERE role='user' AND email IS NOT NULL AND email<>''`); const users = ((rowsResult as any)[0] || []) as any[];
  let customerSent = 0;
  for (const user of users) {
    const tradesResult = await db.execute(sql`SELECT currency,principalMinor,expectedRewardMinor,status,confirmedAt,settledAt FROM trade_positions WHERE userId=${user.id} AND DATE(COALESCE(settledAt,confirmedAt))=${dayKey()} ORDER BY confirmedAt DESC`); const trades = ((tradesResult as any)[0] || []) as any[];
    const ledgerResult = await db.execute(sql`SELECT currency,amountMinor,entryType,createdAt FROM balance_ledger WHERE userId=${user.id} AND DATE(createdAt)=${dayKey()} ORDER BY createdAt DESC`); const ledger = ((ledgerResult as any)[0] || []) as any[];
    const html = `<div style="font-family:Arial,sans-serif"><h2>WiseBond daily trading statement</h2><p>Hello ${user.name || "Customer"}, here is your statement for ${dayKey()}.</p><h3>Trades (${trades.length})</h3><ul>${trades.map((t:any)=>`<li>${t.currency} · ${t.status} · principal ${t.principalMinor} · expected reward ${t.expectedRewardMinor}</li>`).join("") || "<li>No trades recorded today.</li>"}</ul><h3>Ledger activity (${ledger.length})</h3><ul>${ledger.map((x:any)=>`<li>${x.currency} · ${x.entryType} · ${x.amountMinor}</li>`).join("") || "<li>No ledger activity recorded today.</li>"}</ul><p>All figures are generated from the authoritative WiseBond database.</p></div>`;
    try { await sendEmail({ to: user.email, subject: `WiseBond daily statement · ${dayKey()}`, html }); customerSent++; } catch (error) { console.error("[Email] customer daily statement failed", user.email, error); }
  }
  const adminsResult = await db.execute(sql`SELECT email FROM users WHERE role='admin' AND email IS NOT NULL AND email<>''`); const admins = ((adminsResult as any)[0] || []).map((x:any)=>x.email);
  if (admins.length) { const activityResult = await db.execute(sql`SELECT u.email,bl.currency,bl.amountMinor,bl.entryType,bl.createdAt FROM balance_ledger bl LEFT JOIN users u ON u.id=bl.userId WHERE DATE(bl.createdAt)=${dayKey()} ORDER BY bl.createdAt DESC LIMIT 500`); const activity = ((activityResult as any)[0] || []) as any[]; const html = `<div style="font-family:Arial,sans-serif"><h2>WiseBond admin progress report</h2><p>Daily operational report for ${dayKey()}.</p><p><b>Customer statements sent:</b> ${customerSent} / ${users.length}</p><h3>Ledger activity</h3><ul>${activity.map((x:any)=>`<li>${x.email || "Unknown"} · ${x.currency} · ${x.entryType} · ${x.amountMinor}</li>`).join("") || "<li>No ledger activity today.</li>"}</ul></div>`; try { await sendEmail({ to: admins, subject: `WiseBond admin progress report · ${dayKey()}`, html }); } catch (error) { console.error("[Email] admin daily report failed", error); } }
  await setAppSetting(key, new Date().toISOString()); return { customerSent, customerTotal: users.length, adminRecipients: admins.length };
}
