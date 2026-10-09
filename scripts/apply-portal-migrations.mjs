import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Load the private application environment before running this script.");
}

const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.set("multipleStatements", "true");
connectionUrl.searchParams.set("timezone", "Z");
const connection = await mysql.createConnection(connectionUrl.toString());

try {
  for (const migration of ["0033_kyc_v2.sql", "0034_email_notifications.sql"]) {
    const sql = await readFile(resolve("drizzle", migration), "utf8");
    await connection.query(sql);
    console.log(`Applied ${migration}`);
  }
} finally {
  await connection.end();
}
