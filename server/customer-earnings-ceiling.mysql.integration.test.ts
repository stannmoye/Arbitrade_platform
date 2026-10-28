import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.CEILING_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("customer-wide earnings ceiling concurrency against disposable MySQL/MariaDB", () => {
  const pool = databaseUrl ? mysql.createPool(databaseUrl) : null;
  let userId = 0;

  beforeAll(async () => {
    if (!pool) throw new Error("CEILING_TEST_DATABASE_URL is required for this integration suite");
    const token = crypto.randomUUID();
    const [result] = await pool.execute<any>("INSERT INTO users (openId,name,email,role,lastSignedIn) VALUES (?,?,?,?,NOW())", [`ceiling-ci-${token}`, "Ceiling CI Fixture", `${token}@example.test`, "user"]);
    userId = Number(result.insertId);
  });

  afterAll(async () => {
    if (!pool) return;
    if (userId) await pool.execute("DELETE FROM users WHERE id=?", [userId]);
    await pool.end();
  });

  it("serializes a second allocation before it can read stale cross-currency capacity", async () => {
    if (!pool) throw new Error("Missing database pool");
    const first = await pool.getConnection();
    const second = await pool.getConnection();
    let secondStarted = false;
    let secondFinished = false;
    try {
      await first.beginTransaction();
      await first.execute("SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
      const waiting = (async () => {
        await second.beginTransaction();
        secondStarted = true;
        await second.execute("SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
        secondFinished = true;
        await second.commit();
      })();
      while (!secondStarted) await new Promise((resolve) => setTimeout(resolve, 5));
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(secondFinished).toBe(false);
      await first.commit();
      await expect(waiting).resolves.toBeUndefined();
      expect(secondFinished).toBe(true);
    } finally {
      try { await first.rollback(); } catch { /* no open transaction is valid */ }
      try { await second.rollback(); } catch { /* no open transaction is valid */ }
      first.release();
      second.release();
    }
  });
});
