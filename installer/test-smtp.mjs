import "dotenv/config";
import nodemailer from "nodemailer";

const recipientArg = process.argv.find((arg) => arg.startsWith("--to="));
const recipient = recipientArg?.slice("--to=".length).trim();
if (process.env.MAIL_PROVIDER !== "smtp") {
  console.error("Set MAIL_PROVIDER=smtp in the protected .env before testing SMTP.");
  process.exit(2);
}
const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("Missing SMTP configuration: " + missing.join(", "));
  process.exit(2);
}
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("SMTP_PORT must be between 1 and 65535.");
  process.exit(2);
}
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error("Usage: node installer/test-smtp.mjs --to=verified-recipient@example.com");
  process.exit(2);
}
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});
try {
  await transporter.verify();
  console.log("SMTP connection and authentication succeeded.");
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM_NAME
      ? { name: process.env.SMTP_FROM_NAME, address: process.env.SMTP_FROM_EMAIL }
      : process.env.SMTP_FROM_EMAIL,
    to: recipient,
    subject: "Arbitrade SMTP configuration test",
    text: "This message confirms that the Arbitrade server can send email using the configured SMTP settings.",
  });
  console.log("Test email accepted by SMTP server. Message ID: " + String(result.messageId || "(not supplied)"));
} catch (error) {
  console.error("SMTP test failed. Check hostname, port, TLS mode, credentials, sender authorization, and hosting-provider outbound SMTP restrictions.");
  console.error("Provider error code: " + String(error?.code || "unknown"));
  process.exitCode = 1;
} finally {
  transporter.close();
}
