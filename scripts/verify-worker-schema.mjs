import mysql from "mysql2/promise";
import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findMissingWorkerTables, getRequiredWorkerTables } from "./worker-schema-inventory.mjs";
import { assertWorkerSchemaContracts } from "./worker-schema-contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required; load the private application environment first.");

  const schema = await readFile(resolve(root, "drizzle/schema.ts"), "utf8");
  const migrationFiles = (await readdir(resolve(root, "drizzle"), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
    .map(entry => entry.name)
    .sort();
  const migrationSqlSources = await Promise.all(
    migrationFiles.map(file => readFile(resolve(root, "drizzle", file), "utf8")),
  );
  const required = getRequiredWorkerTables(schema, migrationSqlSources);
  const url = new URL(raw);
  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
  }
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  url.searchParams.set("timezone", "Z");

  const db = await mysql.createConnection(url.toString());
  try {
    const [rows] = await db.query(
      "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=DATABASE()",
    );
    const existing = new Set(rows.map((row) => String(row.tableName ?? row.TABLE_NAME)));
    const missing = findMissingWorkerTables(required, existing);
    if (missing.length > 0) {
      console.error("[worker-schema] FAIL: required application/worker tables are missing:");
      for (const table of missing) console.error("[worker-schema]   - " + table);
      console.error("[worker-schema] Run the main, portal and mining migrations before starting the application.");
      process.exitCode = 1;
      return;
    }

    const verified = await assertWorkerSchemaContracts(db);
    console.log(
      "[worker-schema] PASS: " + required.length +
      " application and worker tables exist; " + verified.checkedTables +
      " mining/notification worker-table contracts also match required columns, nullability, enum states and index layout. " +
      "Empty tables are valid and do not fail this check.",
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  const code = String(error?.code || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  const message = error instanceof Error
    ? error.message.replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]").slice(0, 400)
    : "Unknown error";
  console.error("[worker-schema] FAIL: schema verification could not complete (code: " + (code || "UNKNOWN") + "). " + message);
  process.exitCode = 1;
});
