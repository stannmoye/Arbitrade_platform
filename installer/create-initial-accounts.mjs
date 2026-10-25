import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { validateInitialAccountInput } from "./initial-accounts-input.mjs";

function fail(message, code = 1) {
  console.error("[installer] ERROR: " + message);
  process.exit(code);
}

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) fail("DATABASE_URL is required to create the initial accounts.");

let accounts;
try {
  accounts = validateInitialAccountInput(process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : "Initial account configuration is invalid.", 2);
}

let parsed;
let databaseName;
let databaseUser;
let databasePassword;
try {
  parsed = new URL(databaseUrl);
  if (!["mysql:", "mariadb:"].includes(parsed.protocol)) {
    fail("DATABASE_URL must use mysql:// or mariadb://; the configured value is not displayed.", 2);
  }
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  databaseUser = decodeURIComponent(parsed.username);
  databasePassword = decodeURIComponent(parsed.password);
  if (!parsed.hostname || !databaseName || !databaseUser) {
    fail("DATABASE_URL must include a host, database name, and username; the configured value is not displayed.", 2);
  }
} catch {
  fail("DATABASE_URL is malformed or contains invalid encoding; the configured value is not displayed.", 2);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 32).toString("hex");
  return \`scrypt$\${salt}$\${digest}\`;
}

function localOpenId(role, email) {
  const prefix = role === "admin" ? "local:admin:" : "local:customer:";
  const direct = prefix + email;
  if (direct.length <= 64) return direct;
  return prefix + crypto.createHash("sha256").update(email).digest("hex").slice(0, 64 - prefix.length);
}

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
  fail("Could not connect to the configured database (code: " + (errorCode || "unavailable") + "). Check private database settings; details are not displayed.");
}

let transactionStarted = false;
try {
  await connection.beginTransaction();
  transactionStarted = true;

  const initialAccounts = [
    {
      email: accounts.adminEmail,
      password: accounts.adminPassword,
      name: "Administrator",
      role: "admin",
      packageName: "Institutional",
    },
    {
      email: accounts.customerEmail,
      password: accounts.customerPassword,
      name: "Customer Account",
      role: "user",
      packageName: "Starter",
    },
  ];

  for (const account of initialAccounts) {
    const openId = localOpenId(account.role, account.email);
    const [existing] = await connection.execute(
      "SELECT id FROM users WHERE LOWER(email)=? OR openId=? LIMIT 1",
      [account.email, openId],
    );
    if (existing.length) {
      throw new Error("An account already exists for one of the initial account identities.");
    }
  }

  for (const account of initialAccounts) {
    await connection.execute(
      "INSERT INTO users (openId,name,email,loginMethod,role,passwordHash,packageName) VALUES (?,?,?,'password',?,?,?)",
      [
        localOpenId(account.role, account.email),
        account.name,
        account.email,
        account.role,
        hashPassword(account.password),
        account.packageName,
      ],
    );
  }

  await connection.commit();
  transactionStarted = false;
  console.log("Initial administrator and customer accounts were created successfully.");
} catch (error) {
  if (transactionStarted) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original account-creation failure.
    }
  }
  const errorCode = String(error?.code || "INITIAL_ACCOUNT_CREATION_FAILED").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  console.error("Initial account creation failed (code: " + (errorCode || "unknown") + "). No partial account transaction was committed.");
  process.exitCode = 1;
} finally {
  try {
    await connection.end();
  } catch {
    if (process.exitCode === 0 || process.exitCode === undefined) {
      console.error("Initial account database connection could not be closed cleanly.");
      process.exitCode = 1;
    }
  }
}
