import crypto from "node:crypto";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";

export const TRANSACTION_CONSOLE_COOKIE = "arbitrade_transaction_console";
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const MAX_CONSOLE_EVENTS = 25;

type ConsoleEventInput = {
  eventType: string;
  status?: string;
  title: string;
  message: string;
  transactionCode?: string;
  amountMinor?: number;
  asset?: string;
  metadata?: Record<string, unknown>;
};

async function withConnection<T>(fn: (connection: mysql.PoolConnection) => Promise<T>) {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), connectionLimit: 3 });
  const connection = await pool.getConnection();
  try { return await fn(connection); } finally { connection.release(); await pool.end(); }
}

async function pruneConsoleEvents(connection: mysql.PoolConnection, userId: number, sessionKey: string) {
  const [overflow] = await connection.query<any[]>("SELECT id FROM transaction_console_events WHERE userId=? AND sessionKey=? ORDER BY id DESC LIMIT 100000 OFFSET ?", [userId, sessionKey, MAX_CONSOLE_EVENTS]);
  if (overflow.length) {
    const placeholders = overflow.map(() => "?").join(",");
    await connection.query(`DELETE FROM transaction_console_events WHERE id IN (${placeholders})`, overflow.map(row => row.id));
  }
}

function readCookie(req: Request) {
  return req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${TRANSACTION_CONSOLE_COOKIE}=([^;]+)`))?.[1];
}

export function getTransactionConsoleSessionKey(req: Request) { return readCookie(req); }

export function openTransactionConsoleSession(req: Request, res: Response, userId: number) {
  const sessionKey = crypto.randomBytes(32).toString("base64url");
  res.cookie(TRANSACTION_CONSOLE_COOKIE, sessionKey, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS * 1000 });
  return withConnection(async connection => {
    await connection.execute("DELETE FROM transaction_console_events WHERE userId=?", [userId]);
    await connection.execute("INSERT INTO transaction_console_events (sessionKey,userId,eventType,status,title,message,metadataJson) VALUES (?,?,?,?,?,?,?)", [sessionKey, userId, "SESSION_OPENED", "CONNECTED", "Transaction process online", "Live transaction logs are now attached to this authenticated session.", JSON.stringify({ openedAt: new Date().toISOString(), ttlHours: 24 })]);
    return sessionKey;
  });
}

export async function closeTransactionConsoleSession(req: Request, res: Response, userId: number) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return;
  await withConnection(async connection => { await connection.execute("DELETE FROM transaction_console_events WHERE userId=? AND sessionKey=?", [userId, sessionKey]); });
  res.clearCookie(TRANSACTION_CONSOLE_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/** Build a MySQL advisory-lock name without exposing customer/session/transaction identifiers. */
export function transactionConsoleEventLockName(userId: number, sessionKey: string, transactionCode: string) {
  const digest = crypto.createHash("sha256")
    .update(JSON.stringify([userId, sessionKey, transactionCode]))
    .digest("hex")
    .slice(0, 56);
  // MySQL lock names are limited to 64 characters: 8-character prefix + 56 hex characters.
  return `arb_evt:${digest}`;
}

/** Fail closed when a deduplication lock cannot be acquired; always release after the work. */
export async function withTransactionConsoleEventLock<T>(
  connection: mysql.PoolConnection,
  lockName: string,
  work: () => Promise<T>,
): Promise<T> {
  const [lockRows] = await connection.query<any[]>("SELECT GET_LOCK(?, 5) AS acquired", [lockName]);
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error("Unable to acquire transaction-console event deduplication lock.");
  }
  try {
    return await work();
  } finally {
    await connection.query<any[]>("SELECT RELEASE_LOCK(?) AS released", [lockName]);
  }
}

async function insertTransactionConsoleEvent(
  connection: mysql.PoolConnection,
  userId: number,
  sessionKey: string,
  input: ConsoleEventInput,
) {
  await connection.execute("INSERT INTO transaction_console_events (sessionKey,userId,eventType,status,title,message,transactionCode,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?,?,?)", [sessionKey, userId, input.eventType, input.status || "COMPLETED", input.title, input.message, input.transactionCode || null, input.amountMinor ?? null, input.asset || null, JSON.stringify(input.metadata || {})]);
  await pruneConsoleEvents(connection, userId, sessionKey);
}

export async function recordTransactionConsoleEvent(userId: number, req: Request, input: ConsoleEventInput) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return;
  await withConnection(async connection => {
    if (!input.transactionCode) {
      await insertTransactionConsoleEvent(connection, userId, sessionKey, input);
      return;
    }

    // The lock makes the existence check + insert atomic across concurrent application requests,
    // without requiring a schema migration against installations that may contain legacy duplicates.
    const lockName = transactionConsoleEventLockName(userId, sessionKey, input.transactionCode);
    await withTransactionConsoleEventLock(connection, lockName, async () => {
      const [existing] = await connection.query<any[]>("SELECT id FROM transaction_console_events WHERE userId=? AND sessionKey=? AND transactionCode=? LIMIT 1", [userId, sessionKey, input.transactionCode]);
      if (existing.length) return;
      await insertTransactionConsoleEvent(connection, userId, sessionKey, input);
    });
  });
}

/**
 * Generated activity is intentionally disabled. Only events backed by a persisted
 * application operation may be written through recordTransactionConsoleEvent.
 */
export async function recordTransactionConsolePulse(_userId: number, _req: Request) {
  return { inserted: false, paused: false };
}

export async function listTransactionConsoleEvents(userId: number, req: Request) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return [];
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>("SELECT id,eventType,status,title,message,transactionCode,amountMinor,asset,metadataJson,createdAt FROM transaction_console_events WHERE userId=? AND sessionKey=? ORDER BY id DESC LIMIT ?", [userId, sessionKey, MAX_CONSOLE_EVENTS]);
    return rows;
  });
}
