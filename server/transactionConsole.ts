import crypto from "node:crypto";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";

export const TRANSACTION_CONSOLE_COOKIE = "arbitrade_transaction_console";
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const REAL_TRANSACTION_PAUSE_MS = 12_000;

type ProcessingOutcome = "COMPLETED" | "FAILED" | "STALLED" | "PROCESSING" | "DELAYED";

function outcomeFor(userId: number, sessionKey: string, sequence: number, previous: string | undefined): { status: ProcessingOutcome; probabilities: Record<string, number> } {
  const digest = crypto.createHash("sha256").update(`${userId}:${sessionKey}:${sequence}`).digest();
  const unit = digest.readUInt32BE(0) / 0xffffffff;
  const bounded = (offset: number, min: number, max: number) => min + (digest[offset] % (max - min + 1));
  const bounds = { FAILED: [1, 8], STALLED: [1, 12], COMPLETED: [1, 65], PROCESSING: [1, 10], DELAYED: [1, 10] } as const;
  const raw: Record<string, number> = { FAILED: bounded(4, 1, 8), STALLED: bounded(5, 1, 12), COMPLETED: bounded(6, 1, 65), PROCESSING: bounded(7, 1, 10), DELAYED: bounded(8, 1, 10) };
  if (previous === "FAILED") raw.FAILED = Math.min(raw.FAILED, 2);
  if (previous === "STALLED") raw.STALLED = Math.min(raw.STALLED, 4);
  let total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  const order = Object.keys(raw);
  const adjust = (direction: 1 | -1) => {
    let remaining = Math.abs(100 - total);
    const eligible = () => order.filter(key => direction === 1 ? raw[key] < bounds[key as keyof typeof bounds][1] : raw[key] > bounds[key as keyof typeof bounds][0]);
    let cursorIndex = direction === 1 ? digest[9] % order.length : digest[10] % order.length;
    while (remaining > 0) {
      const candidates = eligible();
      if (!candidates.length) break;
      const key = candidates[cursorIndex % candidates.length];
      raw[key] += direction; total += direction; remaining--; cursorIndex++;
    }
  };
  if (total < 100) adjust(1);
  if (total > 100) adjust(-1);
  const probabilities = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value]));
  let cursor = unit * 100;
  for (const [status, weight] of Object.entries(raw)) { cursor -= weight; if (cursor <= 0) return { status: status as ProcessingOutcome, probabilities }; }
  return { status: "DELAYED", probabilities };
}

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

function connectionOptions() {
  const url = new URL(process.env.DATABASE_URL || "");
  return { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), ssl: url.searchParams.get("ssl") === "true" ? {} : undefined };
}

async function withConnection<T>(fn: (connection: mysql.PoolConnection) => Promise<T>) {
  const pool = mysql.createPool({ ...connectionOptions(), connectionLimit: 3 });
  const connection = await pool.getConnection();
  try { return await fn(connection); } finally { connection.release(); await pool.end(); }
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

export async function recordTransactionConsoleEvent(userId: number, req: Request, input: ConsoleEventInput) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return;
  await withConnection(async connection => {
    if (input.transactionCode) {
      const [existing] = await connection.query<any[]>("SELECT id FROM transaction_console_events WHERE userId=? AND sessionKey=? AND transactionCode=? LIMIT 1", [userId, sessionKey, input.transactionCode]);
      if (existing.length) return;
    }
    await connection.execute("INSERT INTO transaction_console_events (sessionKey,userId,eventType,status,title,message,transactionCode,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?,?,?)", [sessionKey, userId, input.eventType, input.status || "COMPLETED", input.title, input.message, input.transactionCode || null, input.amountMinor ?? null, input.asset || null, JSON.stringify(input.metadata || {})]);
  });
}

/**
 * Writes one database-backed system-activity line when no real transaction is active.
 * These rows are deliberately marked SIMULATED and never represent a wallet mutation.
 * The recent-real-event gate prevents telemetry from masking a debit, credit, investment,
 * settlement, or fee event while that event is being displayed.
 */
export async function recordTransactionConsolePulse(userId: number, req: Request) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return { inserted: false, paused: false };
  return withConnection(async connection => {
    const [recent] = await connection.query<any[]>("SELECT createdAt FROM transaction_console_events WHERE userId=? AND sessionKey=? AND eventType NOT IN ('SESSION_OPENED','SYSTEM_ACTIVITY','MISSED_OPPORTUNITY') ORDER BY id DESC LIMIT 1", [userId, sessionKey]);
    if (recent.length && Date.now() - new Date(recent[0].createdAt).getTime() < REAL_TRANSACTION_PAUSE_MS) return { inserted: false, paused: true };
    const [phrases] = await connection.query<any[]>("SELECT id,category,phraseTemplate FROM console_activity_phrases WHERE enabled=TRUE ORDER BY RAND() LIMIT 1");
    if (!phrases.length) return { inserted: false, paused: false };
    const [offerRows] = await connection.query<any[]>("SELECT COUNT(*) AS count, MAX(symbol) AS asset, MAX(currency) AS currency, MAX(expectedRewardBps) AS rate FROM opportunity_offers WHERE status='open' AND closesAt>NOW()");
    const [investorRows] = await connection.query<any[]>("SELECT COUNT(*) AS count FROM users WHERE role='user'");
    const [enabledRows] = await connection.query<any[]>("SELECT COUNT(*) AS count FROM customer_controls WHERE autoTradeEnabled=TRUE AND tradingEnabled=TRUE AND accountStatus='active'");
    const [eventRows] = await connection.query<any[]>("SELECT COUNT(*) AS count FROM transaction_console_events WHERE userId=? AND sessionKey=?", [userId, sessionKey]);
    const context = { asset: offerRows[0]?.asset || "the active route", currency: offerRows[0]?.currency || "the configured wallet", rate: offerRows[0]?.rate || 0, offers: offerRows[0]?.count || 0, investors: enabledRows[0]?.count || investorRows[0]?.count || 0, count: investorRows[0]?.count || 0, time: new Date().toLocaleTimeString(), sequence: Number(eventRows[0]?.count || 0) + 1 };
    const [previousRows] = await connection.query<any[]>("SELECT status FROM transaction_console_events WHERE userId=? AND sessionKey=? AND eventType='SYSTEM_ACTIVITY' ORDER BY id DESC LIMIT 1", [userId, sessionKey]);
    const outcome = outcomeFor(userId, sessionKey, context.sequence, previousRows[0]?.status);
    const messageBase = String(phrases[0].phraseTemplate).replace(/{{(\w+)}}/g, (_match, key) => String((context as Record<string, unknown>)[key] ?? "the current ledger context"));
    const outcomeCopy: Record<ProcessingOutcome, { title: string; prefix: string }> = {
      COMPLETED: { title: "Transaction route confirmed", prefix: "Route check completed · " },
      FAILED: { title: "Transaction route interrupted", prefix: "Control check returned an exception · " },
      STALLED: { title: "Transaction route awaiting clearance", prefix: "Processing is holding for a required checkpoint · " },
      PROCESSING: { title: "Transaction route processing", prefix: "Allocation engine is advancing · " },
      DELAYED: { title: "Transaction route delayed", prefix: "Timing variance detected · " },
    };
    const selected = outcomeCopy[outcome.status];
    const message = selected.prefix + messageBase;
    await connection.execute("INSERT INTO transaction_console_events (sessionKey,userId,eventType,status,title,message,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)", [sessionKey, userId, "SYSTEM_ACTIVITY", outcome.status, selected.title, message, context.asset, JSON.stringify({ phraseId: phrases[0].id, category: phrases[0].category, generatedAt: new Date().toISOString(), sequence: context.sequence, source: "database_phrase_catalog", probabilityBands: outcome.probabilities })]);
    return { inserted: true, paused: false, eventType: "SYSTEM_ACTIVITY", status: outcome.status, probabilities: outcome.probabilities };
  });
}

export async function listTransactionConsoleEvents(userId: number, req: Request) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return [];
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>("SELECT id,eventType,status,title,message,transactionCode,amountMinor,asset,metadataJson,createdAt FROM transaction_console_events WHERE userId=? AND sessionKey=? ORDER BY id ASC LIMIT 500", [userId, sessionKey]);
    return rows;
  });
}
