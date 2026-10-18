import crypto from "node:crypto";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";

export const TRANSACTION_CONSOLE_COOKIE = "arbitrade_transaction_console";
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const REAL_TRANSACTION_PAUSE_MS = 12_000;
const MAX_CONSOLE_EVENTS = 25;

type ProcessingOutcome = "COMPLETED" | "FAILED" | "STALLED" | "PROCESSING" | "DELAYED";

/** Present generated telemetry as simulation, never as a ledger-confirmed transaction. */
export function presentSimulatedActivity(outcome: ProcessingOutcome, messageBase: string) {
  const prefixes: Record<ProcessingOutcome, string> = {
    COMPLETED: "Simulated route check completed · ",
    FAILED: "Simulated control check returned an exception · ",
    STALLED: "Simulated processing is awaiting a checkpoint · ",
    PROCESSING: "Simulated allocation activity is advancing · ",
    DELAYED: "Simulated timing variance detected · ",
  };
  return {
    status: "SIMULATED" as const,
    title: "Simulated system activity",
    message: `SIMULATION ONLY — no wallet movement was performed. ${prefixes[outcome]}${messageBase}`,
    simulatedOutcome: outcome,
  };
}

function outcomeFor(userId: number, sessionKey: string, sequence: number, previous: string | undefined, context: { offers: number; investors: number; rate: number }): { status: ProcessingOutcome; probabilities: Record<string, number>; method: string } {
  const digest = crypto.createHash("sha256").update(`${userId}:${sessionKey}:${sequence}:${context.offers}:${context.investors}:${context.rate}`).digest();
  const bounds = { FAILED: [1, 8], STALLED: [1, 12], COMPLETED: [1, 65], PROCESSING: [1, 10], DELAYED: [1, 10] } as const;
  const outcomeKeys = Object.keys(bounds);
  const bounded = (value: number, key: string) => { const [min, max] = bounds[key as keyof typeof bounds]; return min + (Math.abs(value) % (max - min + 1)); };
  // Method 1: session fingerprint — stable for this login, different for every customer/session.
  const fingerprint = Array.from({ length: 5 }, (_, i) => digest.readUInt16BE(i * 2));
  // Method 2: xorshift mixer — rotates the entropy source on every console sequence.
  let x = digest.readUInt32BE(0) ^ sequence ^ (userId * 2654435761); const mixed: number[] = [];
  for (let i = 0; i < 5; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; mixed.push(x >>> 0); }
  // Method 3: route volatility — active opportunities, investor pool and quoted rate affect the blend.
  const volatility = Math.abs((context.offers * 17 + context.investors * 7 + context.rate * 13 + digest[11]) % 101);
  // Method 4: state-transition memory — avoid implausible repeated failures/stalls without eliminating them.
  const transitionPenalty = previous === "FAILED" ? { FAILED: 1, STALLED: 3, COMPLETED: 7, PROCESSING: 5, DELAYED: 4 } : previous === "STALLED" ? { FAILED: 2, STALLED: 2, COMPLETED: 6, PROCESSING: 5, DELAYED: 3 } : { FAILED: 0, STALLED: 0, COMPLETED: 0, PROCESSING: 0, DELAYED: 0 };
  // Method 5: rotating ensemble — changes the dominant method every five activity lines.
  const rotation = sequence % 5;
  const methodNames = ["session fingerprint", "xorshift entropy", "route volatility", "state transition", "rotating ensemble"];
  const raw: Record<string, number> = {};
  outcomeKeys.forEach((key, i) => { const ensemble = (fingerprint[(i + rotation) % 5] + (mixed[(i * 3 + rotation) % 5] % 257) + volatility * (i + 1)) % 1000; raw[key] = bounded(ensemble - transitionPenalty[key as keyof typeof transitionPenalty] * 31, key); });
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
  const cursor = (mixed[rotation] % 100) + ((digest[(rotation + 12) % digest.length] / 255) * 0.99);
  let threshold = cursor;
  for (const [status, weight] of Object.entries(raw)) { threshold -= weight; if (threshold <= 0) return { status: status as ProcessingOutcome, probabilities, method: methodNames[rotation] }; }
  return { status: "DELAYED", probabilities, method: methodNames[rotation] };
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
 * Writes one database-backed system-activity line when no real transaction is active.
 * These rows are explicitly labeled SIMULATED and never represent a wallet mutation.
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
    const outcome = outcomeFor(userId, sessionKey, context.sequence, previousRows[0]?.status, { offers: Number(context.offers), investors: Number(context.investors), rate: Number(context.rate) });
    const messageBase = String(phrases[0].phraseTemplate).replace(/{{(\w+)}}/g, (_match, key) => String((context as Record<string, unknown>)[key] ?? "the current ledger context"));
    const presentation = presentSimulatedActivity(outcome.status, messageBase);
    await connection.execute("INSERT INTO transaction_console_events (sessionKey,userId,eventType,status,title,message,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)", [sessionKey, userId, "SYSTEM_ACTIVITY", presentation.status, presentation.title, presentation.message, context.asset, JSON.stringify({ simulationOnly: true, simulatedOutcome: presentation.simulatedOutcome, phraseId: phrases[0].id, category: phrases[0].category, generatedAt: new Date().toISOString(), sequence: context.sequence, source: "database_phrase_catalog", probabilityBands: outcome.probabilities, calculationMethod: outcome.method, calculationInputs: { offers: context.offers, investors: context.investors, rate: context.rate, previousStatus: previousRows[0]?.status || null } })]);
    await pruneConsoleEvents(connection, userId, sessionKey);
    return { inserted: true, paused: false, eventType: "SYSTEM_ACTIVITY", status: presentation.status, simulatedOutcome: presentation.simulatedOutcome, probabilities: outcome.probabilities };
  });
}

export async function listTransactionConsoleEvents(userId: number, req: Request) {
  const sessionKey = readCookie(req);
  if (!sessionKey) return [];
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>("SELECT id,eventType,status,title,message,transactionCode,amountMinor,asset,metadataJson,createdAt FROM transaction_console_events WHERE userId=? AND sessionKey=? ORDER BY id DESC LIMIT ?", [userId, sessionKey, MAX_CONSOLE_EVENTS]);
    return rows;
  });
}
