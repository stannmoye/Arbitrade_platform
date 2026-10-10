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

async function provisionAccount({ email, name, role, packageName, password }) {
  const [matches] = await connection.execute(
    "SELECT id FROM users WHERE email = ? ORDER BY id ASC",
    [email],
  );
  if (matches.length > 1) {
    throw new Error(`Multiple user records found for ${email}; reconcile duplicates before provisioning.`);
  }

  const passwordHash = hashPassword(password);
  if (matches.length === 1) {
    await connection.execute(
      "UPDATE users SET name = ?, loginMethod = 'password', role = ?, passwordHash = ?, packageName = ? WHERE id = ?",
      [name, role, passwordHash, packageName, matches[0].id],
    );
    return;
  }

  const openIdPrefix = role === "admin" ? "local:admin:" : "local:user:";
  await connection.execute(
    "INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, packageName) VALUES (?, ?, ?, 'password', ?, ?, ?)",
    [`${openIdPrefix}${email}`, name, email, role, passwordHash, packageName],
  );
}

await provisionAccount({ email: adminEmail, name: "Administrator", role: "admin", packageName: "Institutional", password: adminPassword });
await provisionAccount({ email: customerEmail, name: "Customer Account", role: "user", packageName: "Starter", password: customerPassword });
await connection.end();

console.log(`Administrator account provisioned in database: ${adminEmail}`);
console.log(`Customer account provisioned in database: ${customerEmail}`);
