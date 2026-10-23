import { and, desc, eq, gte, sql } from "drizzle-orm";
import { customerApiKeys, customerApiUsageDaily } from "../drizzle/schema";
import { getDb } from "./db";

export async function recordCustomerApiUsage(userId: number, keyId: number, statusCode: number, durationMs: number) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const usageDate = now.toISOString().slice(0, 10);
  const latency = Number.isFinite(durationMs) ? Math.max(0, Math.min(300_000, Math.round(durationMs))) : 0;
  const success = statusCode >= 200 && statusCode < 400;
  try {
    await db.insert(customerApiUsageDaily).values({
      userId, keyId, usageDate, requestCount: 1, successCount: success ? 1 : 0,
      errorCount: success ? 0 : 1, totalLatencyMs: latency, lastRequestAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        requestCount: sql`${customerApiUsageDaily.requestCount} + 1`,
        successCount: sql`${customerApiUsageDaily.successCount} + ${success ? 1 : 0}`,
        errorCount: sql`${customerApiUsageDaily.errorCount} + ${success ? 0 : 1}`,
        totalLatencyMs: sql`${customerApiUsageDaily.totalLatencyMs} + ${latency}`,
        lastRequestAt: now,
        updatedAt: now,
      },
    });
  } catch {
    // Telemetry must never prevent an otherwise valid API response.
  }
}

export async function listCustomerApiUsage(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const since = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const rows = await db.select({
    id: customerApiUsageDaily.id,
    keyId: customerApiUsageDaily.keyId,
    keyName: customerApiKeys.name,
    keyPrefix: customerApiKeys.keyPrefix,
    usageDate: customerApiUsageDaily.usageDate,
    requestCount: customerApiUsageDaily.requestCount,
    successCount: customerApiUsageDaily.successCount,
    errorCount: customerApiUsageDaily.errorCount,
    totalLatencyMs: customerApiUsageDaily.totalLatencyMs,
    lastRequestAt: customerApiUsageDaily.lastRequestAt,
  }).from(customerApiUsageDaily)
    .innerJoin(customerApiKeys, eq(customerApiKeys.id, customerApiUsageDaily.keyId))
    .where(and(eq(customerApiUsageDaily.userId, userId), gte(customerApiUsageDaily.usageDate, since)))
    .orderBy(desc(customerApiUsageDaily.usageDate), desc(customerApiUsageDaily.id))
    .limit(500);
  return rows.filter((row) => Number(row.keyId) > 0 && row.keyName !== undefined)
    .map((row) => ({
      ...row,
      averageLatencyMs: Number(row.requestCount) > 0 ? Math.round(Number(row.totalLatencyMs) / Number(row.requestCount)) : 0,
    }));
}
