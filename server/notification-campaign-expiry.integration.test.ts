import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { broadcastCustomerNotification, getDb } from "./db";

const databaseUrl = process.env.DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
let pool: mysql.Pool | undefined;
const fixtureCampaignIds: number[] = [];
const fixtureUserIds: number[] = [];

databaseDescribe("announcement expiry lifecycle through the application service", () => {
  beforeAll(async () => {
    pool = mysql.createPool(databaseUrl!);
  }, 30_000);

  afterEach(async () => {
    if (!pool) return;
    const connection = await pool.getConnection();
    try {
      for (const campaignId of fixtureCampaignIds.splice(0)) {
        await connection.execute("DELETE FROM notification_campaign_deliveries WHERE campaignId=?", [campaignId]);
        await connection.execute("DELETE FROM notification_campaigns WHERE id=?", [campaignId]);
      }
      for (const userId of fixtureUserIds.splice(0)) {
        await connection.execute("DELETE FROM users WHERE id=?", [userId]);
      }
    } finally {
      connection.release();
    }
  }, 30_000);

  afterAll(async () => {
    const drizzleDb = await getDb();
    await (drizzleDb as any)?.$client?.end?.();
    await pool?.end();
  }, 30_000);

  it("expires overdue campaigns and repairs stale terminal deliveries without losing receipts", async () => {
    const suffix = randomUUID().replace(/-/g, "");
    const openId = `expiry-integration-admin-${suffix}`;
    const eventKey = `expiry-integration-${suffix}`;
    const connection = await pool!.getConnection();
    let adminId = 0;
    let campaignId = 0;
    const recipientIds = [2147483001, 2147483002, 2147483003, 2147483004];
    try {
      const [userInsert] = await connection.execute<mysql.ResultSetHeader>(
        "INSERT INTO users (openId,name,email,role) VALUES (?,'Expiry integration admin',?,'admin')",
        [openId, `${openId}@example.test`],
      );
      adminId = Number(userInsert.insertId);
      fixtureUserIds.push(adminId);
      const [campaignInsert] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO notification_campaigns
          (createdBy,eventKey,title,body,category,priority,status,expiresAt,totalRecipientCount)
         VALUES (?,?,?,?,?,?,'published',DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR),4)`,
        [adminId, eventKey, "Expiry integration campaign", "Disposable application-service test", "account", "normal"],
      );
      campaignId = Number(campaignInsert.insertId);
      fixtureCampaignIds.push(campaignId);
      const [storedCampaignRows] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT expiresAt FROM notification_campaigns WHERE id=?",
        [campaignId],
      );
      if (!storedCampaignRows[0]?.expiresAt) throw new Error("Expiry fixture did not persist its deadline");
      var persistedExpiresAt = new Date(storedCampaignRows[0].expiresAt).toISOString();
      for (const [index, userId] of recipientIds.entries()) {
        const status = ["pending", "failed", "delivered", "read"][index];
        await connection.execute(
          "INSERT INTO notification_campaign_deliveries (campaignId,userId,status,deliveredAt,readAt) VALUES (?,?,?,CASE WHEN ? IN ('delivered','read') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ?='read' THEN CURRENT_TIMESTAMP ELSE NULL END)",
          [campaignId, userId, status, status, status],
        );
      }
    } finally {
      connection.release();
    }

    const input = {
      title: "Expiry integration campaign",
      body: "Disposable application-service test",
      eventKey,
      category: "account" as const,
      priority: "normal" as const,
      expiresAt: persistedExpiresAt,
    };
    const first = await broadcastCustomerNotification(adminId, input);
    expect(first.status).toBe("expired");

    const verify = await pool!.getConnection();
    try {
      const [campaigns] = await verify.execute<mysql.RowDataPacket[]>(
        "SELECT status,totalRecipientCount FROM notification_campaigns WHERE id=?",
        [campaignId],
      );
      const [deliveries] = await verify.execute<mysql.RowDataPacket[]>(
        "SELECT status,COUNT(*) AS count,SUM(deliveredAt IS NOT NULL) AS deliveredTimestamps,SUM(readAt IS NOT NULL) AS readTimestamps FROM notification_campaign_deliveries WHERE campaignId=? GROUP BY status",
        [campaignId],
      );
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].status).toBe("expired");
      expect(Number(campaigns[0].totalRecipientCount)).toBe(4);
      const counts = Object.fromEntries(deliveries.map(row => [row.status, Number(row.count)]));
      expect(counts).toEqual({ delivered: 1, expired: 2, read: 1 });
      const readRow = deliveries.find(row => row.status === "read");
      const deliveredRow = deliveries.find(row => row.status === "delivered");
      expect(Number(readRow?.deliveredTimestamps)).toBe(1);
      expect(Number(readRow?.readTimestamps)).toBe(1);
      expect(Number(deliveredRow?.deliveredTimestamps)).toBe(1);
      expect(Number(deliveredRow?.readTimestamps)).toBe(0);

      // Simulate legacy rows left retryable by an older non-atomic expiry attempt.
      await verify.execute(
        "UPDATE notification_campaign_deliveries SET status=CASE WHEN userId=? THEN 'pending' ELSE 'failed' END WHERE campaignId=? AND status='expired'",
        [recipientIds[0], campaignId],
      );
    } finally {
      verify.release();
    }

    const retry = await broadcastCustomerNotification(adminId, input);
    expect(retry.status).toBe("expired");
    const verifyRetry = await pool!.getConnection();
    try {
      const [deliveries] = await verifyRetry.execute<mysql.RowDataPacket[]>(
        "SELECT status,COUNT(*) AS count,SUM(deliveredAt IS NOT NULL) AS deliveredTimestamps,SUM(readAt IS NOT NULL) AS readTimestamps FROM notification_campaign_deliveries WHERE campaignId=? GROUP BY status",
        [campaignId],
      );
      const counts = Object.fromEntries(deliveries.map(row => [row.status, Number(row.count)]));
      expect(counts).toEqual({ delivered: 1, expired: 2, read: 1 });
      const readRow = deliveries.find(row => row.status === "read");
      const deliveredRow = deliveries.find(row => row.status === "delivered");
      expect(Number(readRow?.readTimestamps)).toBe(1);
      expect(Number(readRow?.deliveredTimestamps)).toBe(1);
      expect(Number(deliveredRow?.deliveredTimestamps)).toBe(1);
    } finally {
      verifyRetry.release();
    }
  }, 60_000);
});
