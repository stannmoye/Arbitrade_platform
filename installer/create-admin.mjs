import crypto from "node:crypto";
import mysql from "mysql2/promise";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
  console.error("Set DATABASE_URL, a valid ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters.");
  process.exit(2);
}

let parsed;
let databaseName;
let databaseUser;
let databasePassword;
try {
  parsed = new URL(databaseUrl);
  if (!["mysql:", "mariadb:"].includes(parsed.protocol)) {
    console.error("DATABASE_URL must use mysql:// or mariadb://; the configured value is not displayed.");
    process.exit(2);
  }
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  databaseUser = decodeURIComponent(parsed.username);
  databasePassword = decodeURIComponent(parsed.password);
  if (!databaseName || !databaseUser) {
    console.error("DATABASE_URL must include a database name and username; the configured value is not displayed.");
    process.exit(2);
  }
} catch {
  console.error("DATABASE_URL is malformed or contains invalid encoding. The configured value is not displayed.");
  process.exit(2);
}
const salt = crypto.randomBytes(16).toString("hex");
const digest = crypto.scryptSync(password, salt, 32).toString("hex");
const passwordHash = `scrypt${salt}${digest}`;
const openId = `local:admin:${email}`;
let connection;
try {
  connection = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: databaseUser,
    password: databasePassword,
    database: databaseName,
    ssl: parsed.searchParams.get("ssl") === "true" ? {} : undefined,
    connectTimeout: 10000,
  });
} catch (error) {
  const errorCode = String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  console.error("Could not connect to the configured database (code: " + (errorCode || "unavailable") + "). Check private database settings; details are not displayed.");
  process.exit(1);
}

try {
  const [existing] = await connection.execute(
    "SELECT id, email, role FROM users WHERE LOWER(email)=? OR openId=? LIMIT 1",
    [email, openId],
  );
  if (existing.length) {
    const duplicate = new Error("An account with this email or administrator identity already exists. No account was changed; use the application's account recovery process or choose a different email.");
    duplicate.code = "DUPLICATE_ADMIN_ACCOUNT";
    throw duplicate;
  }
  await connection.execute(
    "INSERT INTO users (openId,name,email,loginMethod,role,passwordHash) VALUES (?,?,?,?,?,?)",
    [openId, "Administrator", email, "password", "admin", passwordHash],
  );
  console.log("Administrator created successfully: " + email);
} catch (error) {
  if (error?.code === "DUPLICATE_ADMIN_ACCOUNT") {
    console.error(error.message);
  } else {
    const errorCode = String(error?.code || "unknown").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
    console.error("Administrator creation failed (code: " + (errorCode || "unknown") + "). Database details are not displayed.");
  }
  process.exitCode = 1;
} finally {
  await connection.end();
}
