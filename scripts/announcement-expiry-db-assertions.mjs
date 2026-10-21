import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

// Run only against a disposable MySQL/MariaDB database after portal migrations.
// Exercises the database transaction contract used by announcement expiry.
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required for announcement expiry DB assertions.");

const url = new URL(rawUrl);
if (!["mysql:", "mariadb:"].includes(url.protocol)) {
  throw new Error("DATABASE_URL must use MySQL or MariaDB.");
}

const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  connectTimeout: 10000,
});
const eventKey = "ci-expiry-" + randomUUID();
const creatorId = 2147483000;
const recipientIds = [2147483000, 2147483001, 2147483002, 2147483003];
let campaignId;

try {
  const [campaignResult] = await connection.execute(
    `INSERT INTO notification_campaigns
      (createdBy,eventKey,title,body,category,priority,status,expiresAt,totalRecipientCount)
     VALUES (?,?,?,?,?,?,'published',DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR),4)`,
    [creatorId, eventKey, "Disposable expiry assertion", "CI-only test row", "account", "normal"],
  );
  campaignId = Number(campaignResult.insertId);

  for (const [index, userId] of recipientIds.entries()) {
    const status = ["pending", "failed", "delivered", "read"][index];
    await connection.execute(
      "INSERT INTO notification_campaign_deliveries (campaignId,userId,status,deliveredAt,readAt) VALUES (?,?,?,CASE WHEN ? IN ('delivered','read') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ?='read' THEN CURRENT_TIMESTAMP ELSE NULL END)",
      [campaignId, userId, status, status, status],
    );
  }

  // Cause a real uniqueness failure after the campaign transition. Both writes
  // must roll back together, leaving the campaign published and deliveries intact.
  let expectedFailure = false;
  await connection.beginTransaction();
  try {
    await connection.execute(
      "UPDATE notification_campaigns SET status='expired' WHERE id=? AND status='published' AND expiresAt<=CURRENT_TIMESTAMP",
      [campaignId],
    );
    await connection.execute(
      "INSERT INTO notification_campaign_deliveries (campaignId,userId,status) VALUES (?,?,'pending')",
      [campaignId, recipientIds[0]],
    );
  } catch (error) {
    expectedFailure = error?.code === "ER_DUP_ENTRY";
    await connection.rollback();
    if (!expectedFailure) throw error;
  }
  if (!expectedFailure) {
    await connection.rollback();
    throw new Error("Failure injection did not trigger the expected duplicate-delivery constraint.");
  }

  const [afterRollbackCampaign] = await connection.execute(
    "SELECT status FROM notification_campaigns WHERE id=?",
    [campaignId],
  );
  const [afterRollbackDeliveries] = await connection.execute(
    "SELECT status,COUNT(*) AS count FROM notification_campaign_deliveries WHERE campaignId=? GROUP BY status",
    [campaignId],
  );
  if (afterRollbackCampaign.length !== 1 || afterRollbackCampaign[0].status !== "published") {
    throw new Error("Campaign state did not roll back after the delivery write failed.");
  }
  const rollbackCounts = Object.fromEntries(afterRollbackDeliveries.map(row => [row.status, Number(row.count)]));
  if (rollbackCounts.pending !== 1 || rollbackCounts.failed !== 1 ||
      rollbackCounts.delivered !== 1 || rollbackCounts.read !== 1) {
    throw new Error("Delivery rows did not remain unchanged after the failed transaction.");
  }

  // Retry after the induced failure: expire the campaign and only pending/failed
  // deliveries atomically, retaining delivered/read states and their receipts.
  await connection.beginTransaction();
  try {
    const [transition] = await connection.execute(
      "UPDATE notification_campaigns SET status='expired' WHERE id=? AND status='published' AND expiresAt<=CURRENT_TIMESTAMP",
      [campaignId],
    );
    if (Number(transition.affectedRows) !== 1) throw new Error("Retry did not transition exactly one eligible campaign.");
    await connection.execute(
      "UPDATE notification_campaign_deliveries SET status='expired' WHERE campaignId=? AND status IN ('pending','failed')",
      [campaignId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  const [finalCampaignRows] = await connection.execute(
    "SELECT status,totalRecipientCount FROM notification_campaigns WHERE id=?",
    [campaignId],
  );
  const [finalDeliveryRows] = await connection.execute(
    "SELECT status,COUNT(*) AS count,SUM(deliveredAt IS NOT NULL) AS deliveredTimestamps,SUM(readAt IS NOT NULL) AS readTimestamps FROM notification_campaign_deliveries WHERE campaignId=? GROUP BY status",
    [campaignId],
  );
  if (finalCampaignRows.length !== 1 || finalCampaignRows[0].status !== "expired" ||
      Number(finalCampaignRows[0].totalRecipientCount) !== 4) {
    throw new Error("Successful retry produced an unexpected campaign status or recipient total.");
  }
  const finalCounts = Object.fromEntries(finalDeliveryRows.map(row => [row.status, Number(row.count)]));
  const readRow = finalDeliveryRows.find(row => row.status === "read");
  const deliveredRow = finalDeliveryRows.find(row => row.status === "delivered");
  if (finalCounts.expired !== 2 || finalCounts.delivered !== 1 || finalCounts.read !== 1 ||
      finalDeliveryRows.reduce((sum, row) => sum + Number(row.count), 0) !== 4 ||
      Number(readRow?.readTimestamps) !== 1 || Number(readRow?.deliveredTimestamps) !== 1 ||
      Number(deliveredRow?.deliveredTimestamps) !== 1 || Number(deliveredRow?.readTimestamps) !== 0) {
    throw new Error("Successful retry produced unexpected delivery states or failed to preserve delivered/read timestamps.");
  }

  console.log("PASS: announcement expiry transaction rollback, retry, recipient totals, and read/delivery history.");
} finally {
  if (campaignId) {
    await connection.execute("DELETE FROM notification_campaign_deliveries WHERE campaignId=?", [campaignId]);
    await connection.execute("DELETE FROM notification_campaigns WHERE id=?", [campaignId]);
  }
  await connection.end();
}
