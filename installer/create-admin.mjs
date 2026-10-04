import crypto from "node:crypto";
import mysql from "mysql2/promise";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !email || password.length < 12) {
  console.error("Usage: DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD='12+ characters' node installer/create-admin.mjs");
  process.exit(2);
}
const parsed = new URL(databaseUrl);
const salt = crypto.randomBytes(16).toString("hex");
const digest = crypto.scryptSync(password, salt, 32).toString("hex");
const passwordHash = `scrypt$${salt}$${digest}`;
const openId = `local:admin:${email}`;
const connection = await mysql.createConnection({ host: parsed.hostname, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.slice(1), ssl: parsed.searchParams.get("ssl") === "true" ? {} : undefined });
await connection.execute("INSERT INTO users (openId,name,email,loginMethod,role,passwordHash) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),loginMethod=VALUES(loginMethod),role='admin',passwordHash=VALUES(passwordHash)", [openId, "Administrator", email, "password", "admin", passwordHash]);
await connection.end();
console.log(`Administrator provisioned: ${email}`);
