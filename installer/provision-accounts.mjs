import crypto from "node:crypto";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
const customerEmail = String(process.env.CUSTOMER_EMAIL || "").trim().toLowerCase();
const customerPassword = String(process.env.CUSTOMER_PASSWORD || "");
if (!adminEmail || !customerEmail || adminPassword.length < 12 || customerPassword.length < 12) {
  console.error("Provide ADMIN_EMAIL, ADMIN_PASSWORD, CUSTOMER_EMAIL and CUSTOMER_PASSWORD; both passwords must contain at least 12 characters.");
  process.exit(2);
}
if (adminEmail === customerEmail) {
  console.error("Administrator and customer accounts must use different email addresses.");
  process.exit(2);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

const parsed = new URL(databaseUrl);
const connection = await mysql.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.slice(1),
  ssl: parsed.searchParams.get("ssl") === "true" ? {} : undefined,
});

const accountSql = `
  INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, packageName)
  VALUES (?, ?, ?, 'password', ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    loginMethod = VALUES(loginMethod),
    role = VALUES(role),
    passwordHash = VALUES(passwordHash),
    packageName = VALUES(packageName)
`;
await connection.execute(accountSql, [`local:admin:${adminEmail}`, "Administrator", adminEmail, "admin", hashPassword(adminPassword), "Institutional"]);
await connection.execute(accountSql, [`local:customer:${customerEmail}`, "Customer Account", customerEmail, "user", hashPassword(customerPassword), "Starter"]);
await connection.end();

console.log(`Administrator account provisioned in database: ${adminEmail}`);
console.log(`Customer account provisioned in database: ${customerEmail}`);
