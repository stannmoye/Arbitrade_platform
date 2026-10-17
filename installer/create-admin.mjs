import crypto from "node:crypto";
import mysql from "mysql2/promise";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
  console.error("Set DATABASE_URL, a valid ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters.");
  process.exit(2);
}

const parsed = new URL(databaseUrl);
if (!["mysql:", "mariadb:"].includes(parsed.protocol)) {
  console.error("DATABASE_URL must use mysql:// or mariadb://.");
  process.exit(2);
}
const salt = crypto.randomBytes(16).toString("hex");
const digest = crypto.scryptSync(password, salt, 32).toString("hex");
const passwordHash = `scrypt$${salt}$${digest}`;
const openId = `local:admin:${email}`;
const connection = await mysql.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
  ssl: parsed.searchParams.get("ssl") === "true" ? {} : undefined,
  connectTimeout: 10000,
});

try {
  const [existing] = await connection.execute(
    "SELECT id, email, role FROM users WHERE LOWER(email)=? OR openId=? LIMIT 1",
    [email, openId],
  );
  if (existing.length) {
    throw new Error("An account with this email or administrator identity already exists. No account was changed; use the application's account recovery process or choose a different email.");
  }
  await connection.execute(
    "INSERT INTO users (openId,name,email,loginMethod,role,passwordHash) VALUES (?,?,?,?,?,?)",
    [openId, "Administrator", email, "password", "admin", passwordHash],
  );
  console.log("Administrator created successfully: " + email);
} catch (error) {
  console.error("Administrator creation failed: " + (error?.message || "unknown database error"));
  process.exitCode = 1;
} finally {
  await connection.end();
}
