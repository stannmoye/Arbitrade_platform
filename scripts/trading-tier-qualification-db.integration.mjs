import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseUrl = process.env.TRADING_QUALIFICATION_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TRADING_QUALIFICATION_TEST_DATABASE_URL is required for the isolated database test.");
const url = new URL(databaseUrl);
if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\\/+/, "")) {
  throw new Error("The test URL must target an isolated MySQL/MariaDB database.");
}
const connectionOptions = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\\/+/, "")),
  connectTimeout: 10000,
  multipleStatements: false,
  timezone: "Z",
};
const first = await mysql.createConnection(connectionOptions);
const second = await mysql.createConnection(connectionOptions);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await first.query("DROP TABLE IF EXISTS trading_tier_qualification_jobs");
  await first.query("DROP TABLE IF EXISTS balance_ledger");
  await first.query(`
    CREATE TABLE balance_ledger (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      entryType VARCHAR(64) NOT NULL,
      qualifyingDepositUsdMinor BIGINT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await first.query(
    "INSERT INTO balance_ledger (userId,entryType,qualifyingDepositUsdMinor) VALUES " +
    "(10,'admin_manual_deposit_credit',10000)," +
    "(10,'admin_manual_deposit_reversal',-10000)," +
    "(11,'admin_credit',NULL)," +
    "(12,'admin_manual_deposit_credit',NULL)"
  );

  const migration = await readFile(new URL("../drizzle/0082_trading_tier_qualification_jobs.sql", import.meta.url), "utf8");
  for (const chunk of migration.split(/-->\\s*statement-breakpoint\\s*/i).map((part) => part.trim()).filter(Boolean)) {
    await first.query(chunk);
  }

  const [backfilled] = await first.query(
    "SELECT sourceLedgerId,userId,status FROM trading_tier_qualification_jobs ORDER BY sourceLedgerId"
  );
  assert.equal(backfilled.length, 2, "Only qualifying attributed credits/reversals should be backfilled.");
  assert.deepEqual(backfilled.map((row) => Number(row.sourceLedgerId)), [1, 2]);
  assert.ok(backfilled.every((row) => row.status === "pending"));

  await first.query(
    "INSERT IGNORE INTO trading_tier_qualification_jobs (userId,sourceLedgerId,status) VALUES (10,1,'pending')"
  );
  const [[{ total }]] = await first.query("SELECT COUNT(*) AS total FROM trading_tier_qualification_jobs");
  assert.equal(Number(total), 2, "The unique source ledger key must prevent duplicate enqueue.");

  const [claimedRows] = await first.query(
    "SELECT id,sourceLedgerId FROM trading_tier_qualification_jobs WHERE status='pending' AND availableAt<=CURRENT_TIMESTAMP ORDER BY id LIMIT 1 FOR UPDATE"
  );
  assert.equal(claimedRows.length, 1);
  const claimed = claimedRows[0];
  await first.beginTransaction();
  const [lockedRows] = await first.query(
    "SELECT id,sourceLedgerId,attempts FROM trading_tier_qualification_jobs WHERE id=? FOR UPDATE",
    [claimed.id]
  );
  assert.equal(lockedRows.length, 1);
  const [claimUpdate] = await first.query(
    "UPDATE trading_tier_qualification_jobs SET status='processing',attempts=attempts+1,lockedAt=UTC_TIMESTAMP() WHERE id=? AND status='pending'",
    [claimed.id]
  );
  assert.equal(claimUpdate.affectedRows, 1);
  await second.beginTransaction();
  const concurrentClaim = second.query(
    "SELECT id FROM trading_tier_qualification_jobs WHERE (status='pending' AND availableAt<=UTC_TIMESTAMP()) OR (status='processing' AND lockedAt<UTC_TIMESTAMP()-INTERVAL 5 MINUTE) ORDER BY id LIMIT 1 FOR UPDATE"
  );
  await sleep(150);
  await first.commit();
  const [secondRows] = await concurrentClaim;
  assert.ok(secondRows.length <= 1);
  assert.ok(secondRows.every((row) => Number(row.id) !== Number(claimed.id)), "Concurrent workers must not claim the same unexpired lease.");
  if (secondRows.length) {
    await second.query(
      "UPDATE trading_tier_qualification_jobs SET status='processing',attempts=attempts+1,lockedAt=UTC_TIMESTAMP() WHERE id=? AND status='pending'",
      [secondRows[0].id]
    );
  }
  await second.commit();

  const oldLease = new Date(Date.now() - 6 * 60 * 1000);
  await first.query(
    "UPDATE trading_tier_qualification_jobs SET status='processing',lockedAt=? WHERE id=?",
    [oldLease, claimed.id]
  );
  const [recovered] = await first.query(
    "SELECT id,lockedAt FROM trading_tier_qualification_jobs WHERE id=? AND status='processing' AND lockedAt<UTC_TIMESTAMP()-INTERVAL 5 MINUTE FOR UPDATE",
    [claimed.id]
  );
  assert.equal(recovered.length, 1, "Expired processing leases must be reclaimable.");
  const persistedOldLease = recovered[0].lockedAt;
  const newLease = new Date(Math.floor(Date.now() / 1000) * 1000);
  await first.query(
    "UPDATE trading_tier_qualification_jobs SET lockedAt=?,attempts=attempts+1 WHERE id=? AND status='processing'",
    [newLease, claimed.id]
  );
  const [staleCompletion] = await first.query(
    "UPDATE trading_tier_qualification_jobs SET status='completed',lockedAt=NULL WHERE id=? AND status='processing' AND lockedAt=?",
    [claimed.id, persistedOldLease]
  );
  assert.equal(staleCompletion.affectedRows, 0, "A stale worker must not overwrite a newer lease.");

  await first.query(
    "UPDATE trading_tier_qualification_jobs SET status='dead',attempts=8,lastError='integration test' WHERE id=?",
    [claimed.id]
  );
  const [[deadJob]] = await first.query(
    "SELECT status,attempts,lastError FROM trading_tier_qualification_jobs WHERE id=?",
    [claimed.id]
  );
  assert.equal(deadJob.status, "dead");
  assert.equal(Number(deadJob.attempts), 8);

  console.log("Trading qualification DB integration passed: migration/backfill, duplicate prevention, concurrent claims, stale-lease recovery, lease fencing, and dead-letter persistence.");
} finally {
  await second.end();
  await first.end();
}
