import crypto from "node:crypto";
import Decimal from "decimal.js";
import mysql, { type PoolConnection } from "mysql2/promise";
import { isQuoteFresh, isRateWithinDeviation } from "./mining-rules";

export class MiningError extends Error {
  constructor(message: string) { super(message); this.name = "MiningError"; }
}

export type MiningConfig = {
  id: number; version: number; effectiveAt: Date; globalEnabled: boolean; boostsEnabled: boolean;
  tokenName: string; tokenSymbol: string; tokenUnitsPerUsd: string; rewardTokensPerThsHour: string; swapFeeBps: number; purchaseFeeBps: number;
  minSwapTokens: string; maxSwapTokens: string; defaultAutoConversionThreshold: string;
  boostCycleSeconds: number; boostDurationSeconds: number; quoteTtlSeconds: number;
  fiatMaxAgeSeconds: number; cryptoMaxAgeSeconds: number; maxRateDeviationBps: number;
  dailyRewardCapTokens: string; dualApprovalThresholdUsd: string;
};

export type AssetRate = { asset: string; usdPerUnit: Decimal; scale: number; provider: string; observedAt: Date };
export type LedgerDelta = { userId: number; asset: string; amount: Decimal.Value; entryType: string; reversalOfId?: number | null };
export type Db = PoolConnection;

export const MINING_TOKEN_ASSET = "CKI" as const;
export const SUPPORTED_MINING_ASSETS = [MINING_TOKEN_ASSET, "USD", "EUR", "GBP", "BTC", "ETH", "USDT"] as const;
const assetScales: Record<string, number> = { CKI: 8, USD: 2, EUR: 2, GBP: 2, BTC: 8, ETH: 8, USDT: 6 };

export function decimal(value: unknown) {
  const result = new Decimal(String(value ?? "0"));
  if (!result.isFinite()) throw new MiningError("Invalid decimal amount");
  return result;
}

export function amountString(value: Decimal.Value, asset: string, rounding: Decimal.Rounding = Decimal.ROUND_DOWN) {
  const scale = assetScales[asset];
  if (scale === undefined) throw new MiningError("This denomination is not supported by Mining");
  return new Decimal(value).toDecimalPlaces(scale, rounding).toFixed(scale);
}

export function assetScale(asset: string) {
  const scale = assetScales[asset];
  if (scale === undefined) throw new MiningError("This denomination is not supported by Mining");
  return scale;
}

export function assertMiningAsset(asset: string, allowToken = true) {
  const requested = String(asset || "").trim().toUpperCase();
  const normalized = requested === "TOKEN" ? MINING_TOKEN_ASSET : requested;
  if (!SUPPORTED_MINING_ASSETS.includes(normalized as typeof SUPPORTED_MINING_ASSETS[number]) || (!allowToken && normalized === MINING_TOKEN_ASSET)) {
    throw new MiningError("Choose a supported Mining denomination");
  }
  return normalized;
}

export function requestKey(prefix: string, userId: number, input: string) {
  const value = String(input || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new MiningError("A valid idempotency key is required");
  const digest = crypto.createHash("sha256").update(value).digest("hex");
  return `${prefix}:${userId}:${digest}`;
}

function connectionOptions() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new MiningError("Mining database is not configured");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    timezone: "Z" as const,
    connectionLimit: 2,
  };
}

export async function withMiningConnection<T>(fn: (conn: Db) => Promise<T>): Promise<T> {
  const pool = mysql.createPool(connectionOptions());
  const conn = await pool.getConnection();
  try { return await fn(conn); }
  finally { conn.release(); await pool.end(); }
}

export async function inMiningTransaction<T>(conn: Db, fn: () => Promise<T>) {
  await conn.beginTransaction();
  try { const result = await fn(); await conn.commit(); return result; }
  catch (error) { await conn.rollback(); throw error; }
}

export async function loadMiningConfig(conn: Db, at: Date = new Date()): Promise<MiningConfig> {
  const [rows] = await conn.query<any[]>(`SELECT * FROM mining_economics_versions WHERE effectiveAt<=? ORDER BY version DESC LIMIT 1`, [at]);
  const row = rows[0];
  if (!row) throw new MiningError("Mining economics are not initialized; apply the mining database migration");
  return {
    id: Number(row.id), version: Number(row.version), effectiveAt: new Date(row.effectiveAt),
    globalEnabled: Boolean(row.globalEnabled), boostsEnabled: Boolean(row.boostsEnabled),
    tokenName: String(row.tokenName || "CoinKi"), tokenSymbol: String(row.tokenSymbol || "CKI"),
    tokenUnitsPerUsd: String(row.tokenUnitsPerUsd), rewardTokensPerThsHour: String(row.rewardTokensPerThsHour),
    swapFeeBps: Number(row.swapFeeBps), purchaseFeeBps: Number(row.purchaseFeeBps),
    minSwapTokens: String(row.minSwapTokens), maxSwapTokens: String(row.maxSwapTokens),
    defaultAutoConversionThreshold: String(row.defaultAutoConversionThreshold),
    boostCycleSeconds: Number(row.boostCycleSeconds), boostDurationSeconds: Number(row.boostDurationSeconds),
    quoteTtlSeconds: Number(row.quoteTtlSeconds), fiatMaxAgeSeconds: Number(row.fiatMaxAgeSeconds),
    cryptoMaxAgeSeconds: Number(row.cryptoMaxAgeSeconds), maxRateDeviationBps: Number(row.maxRateDeviationBps),
    dailyRewardCapTokens: String(row.dailyRewardCapTokens), dualApprovalThresholdUsd: String(row.dualApprovalThresholdUsd),
  };
}

export async function ensureMiningCheckpoint(conn: Db, userId: number, initialAt = new Date()) {
  await conn.execute(`INSERT IGNORE INTO mining_checkpoints (userId,lastAccruedAt) VALUES (?,?)`, [userId, initialAt]);
  const [rows] = await conn.query<any[]>(`SELECT * FROM mining_checkpoints WHERE userId=? FOR UPDATE`, [userId]);
  if (!rows[0]) throw new MiningError("Unable to lock the Mining account state");
  return rows[0];
}

export async function requireActiveMiningAccount(conn: Db, userId: number) {
  const [rows] = await conn.query<any[]>(`SELECT accountStatus FROM customer_controls WHERE userId=? LIMIT 1`, [userId]);
  const status = rows[0]?.accountStatus || "active";
  if (status !== "active") throw new MiningError("Mining actions are unavailable while this account is suspended or restricted");
  return status;
}

export async function beginMiningIdempotency(conn: Db, userId: number, key: string, command: string) {
  await conn.execute(`INSERT IGNORE INTO v5_idempotency_keys (userId,keyValue,command,resultJson) VALUES (?,?,?,NULL)`, [userId, key, command]);
  const [rows] = await conn.query<any[]>(`SELECT command,resultJson FROM v5_idempotency_keys WHERE keyValue=? FOR UPDATE`, [key]);
  const row = rows[0];
  if (!row) throw new MiningError("Unable to reserve this operation; please retry once");
  if (row.command !== command) throw new MiningError("This idempotency key was already used for a different Mining action");
  return row.resultJson ? JSON.parse(String(row.resultJson)) : null;
}

export async function finishMiningIdempotency(conn: Db, key: string, result: unknown) {
  await conn.execute(`UPDATE v5_idempotency_keys SET resultJson=? WHERE keyValue=?`, [JSON.stringify(result), key]);
}

export async function getMiningAssetRate(conn: Db, assetInput: string, config: MiningConfig, now = new Date()): Promise<AssetRate> {
  const asset = assertMiningAsset(assetInput);
  const scale = assetScale(asset);
  if (asset === "USD") return { asset, usdPerUnit: new Decimal(1), scale, provider: "USD reference unit", observedAt: now };
  if (asset === MINING_TOKEN_ASSET) {
    const tokenUnitsPerUsd = decimal(config.tokenUnitsPerUsd);
    if (!tokenUnitsPerUsd.gt(0)) throw new MiningError("The internal CoinKi/CKI conversion rate is not configured");
    return { asset, usdPerUnit: new Decimal(1).div(tokenUnitsPerUsd), scale, provider: "Admin-configured internal CoinKi reference (not a market price)", observedAt: now };
  }

  const expectedProvider = asset === "EUR" || asset === "GBP" ? "frankfurter-ecb" : "coingecko";
  const [registryRows] = await conn.query<any[]>(`SELECT code,scale,usdRate,rateProvider,updatedAt,enabled FROM currency_registry WHERE code=? LIMIT 1`, [asset]);
  const registry = registryRows[0];
  if (!registry || !Boolean(registry.enabled) || String(registry.rateProvider) !== expectedProvider) {
    throw new MiningError(`A verified ${asset}/USD feed is not available; conversions are paused until the feed refreshes`);
  }
  const base = asset === "EUR" || asset === "GBP" ? "USD" : asset;
  const quote = asset === "EUR" || asset === "GBP" ? asset : "USD";
  const [snapshots] = await conn.query<any[]>(`SELECT rate,sourceDate,provider FROM fx_rate_snapshots WHERE baseAsset=? AND quoteAsset=? ORDER BY id DESC LIMIT 2`, [base, quote]);
  const snapshot = snapshots[0];
  if (!snapshot || String(snapshot.provider) !== expectedProvider) throw new MiningError(`A recent ${asset}/USD snapshot is unavailable`);
  const rawRate = decimal(snapshot.rate);
  if (!rawRate.gt(0)) throw new MiningError(`The ${asset}/USD feed returned an invalid price`);
  const usdPerUnit = asset === "EUR" || asset === "GBP" ? new Decimal(1).div(rawRate) : rawRate;
  const observedAt = snapshot.sourceDate ? new Date(snapshot.sourceDate) : new Date(registry.updatedAt);
  const maxAge = ["BTC", "ETH", "USDT"].includes(asset) ? config.cryptoMaxAgeSeconds : config.fiatMaxAgeSeconds;
  if (!isQuoteFresh(observedAt, now, maxAge)) throw new MiningError(`The ${asset}/USD price is stale; no conversion or purchase quote was created`);
  if (snapshots.length > 1) {
    const previousRaw = decimal(snapshots[1].rate);
    if (previousRaw.gt(0) && !isRateWithinDeviation(rawRate.toString(), previousRaw.toString(), config.maxRateDeviationBps)) {
      throw new MiningError(`The latest ${asset}/USD price is outside the configured sanity bound; conversion is paused`);
    }
  }
  return { asset, usdPerUnit, scale, provider: expectedProvider, observedAt };
}

export async function getMiningRates(conn: Db, sourceAsset: string, targetAsset: string, config: MiningConfig, now = new Date()) {
  const source = await getMiningAssetRate(conn, sourceAsset, config, now);
  const target = await getMiningAssetRate(conn, targetAsset, config, now);
  return { source, target, observedAt: new Date(Math.min(source.observedAt.getTime(), target.observedAt.getTime())) };
}

export async function writeMiningAudit(conn: Db, input: { actorUserId: number | null; action: string; entityType: string; entityId: string; reason?: string | null; reference?: string | null; metadata?: unknown }) {
  await conn.execute(`INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson) VALUES (?,?,?,?,?,?,?)`, [
    input.actorUserId, input.action.slice(0, 160), input.entityType.slice(0, 80), input.entityId.slice(0, 128),
    input.reason || null, input.reference || null, input.metadata === undefined ? null : JSON.stringify(input.metadata),
  ]);
}

export async function createMiningLedgerTransaction(conn: Db, input: {
  userId: number | null; actorUserId: number | null; transactionType: string; idempotencyKey: string;
  reason?: string | null; metadata?: unknown; reversalOfId?: number | null; status?: "posted" | "reversed" | "pending";
}) {
  const referenceCode = `MIN-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const [result] = await conn.execute<any>(`INSERT INTO mining_ledger_transactions
    (userId,actorUserId,transactionType,status,idempotencyKey,referenceCode,reversalOfId,reason,metadataJson)
    VALUES (?,?,?,?,?,?,?,?,?)`, [input.userId, input.actorUserId, input.transactionType, input.status || "posted", input.idempotencyKey, referenceCode, input.reversalOfId ?? null, input.reason || null, input.metadata === undefined ? null : JSON.stringify(input.metadata)]);
  return { id: Number(result.insertId), referenceCode };
}

async function findOrCreateMiningWallet(conn: Db, userId: number, asset: string) {
  const [rows] = await conn.query<any[]>(`SELECT * FROM v5_wallets WHERE userId=? AND assetCode=? ORDER BY id LIMIT 2`, [userId, asset]);
  if (rows.length > 1) throw new MiningError(`Multiple ${asset} wallet records exist; the ledger was not changed`);
  if (rows[0]) return rows[0];
  if (userId === 0) throw new MiningError(`The Mining platform ${asset} clearing wallet is missing; apply the Mining migration`);
  const [result] = await conn.execute<any>(`INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?, '0','0','0')`, [userId, asset]);
  const [created] = await conn.query<any[]>(`SELECT * FROM v5_wallets WHERE id=? LIMIT 1`, [result.insertId]);
  if (!created[0]) throw new MiningError("Unable to open a Mining wallet");
  return created[0];
}

/** Posts balanced per-asset deltas to the shared high-precision wallet journal in the caller's transaction. */
export async function postMiningLedgerEntries(conn: Db, transaction: { id: number; referenceCode: string }, entries: LedgerDelta[]) {
  const normalizedEntries = entries.map(entry => {
    const asset = assertMiningAsset(entry.asset);
    const original = decimal(entry.amount);
    const normalized = original.toDecimalPlaces(assetScale(asset), Decimal.ROUND_DOWN);
    if (!normalized.eq(original)) throw new MiningError(`The ${asset} amount exceeds its supported precision`);
    return { ...entry, asset, amount: normalized };
  });
  const assetTotals = new Map<string, Decimal>();
  for (const entry of normalizedEntries) {
    const current = assetTotals.get(entry.asset) || new Decimal(0);
    assetTotals.set(entry.asset, current.plus(entry.amount));
  }
  for (const [asset, total] of assetTotals) if (!total.isZero()) throw new MiningError(`The ${asset} journal entries do not balance; no ledger entries were posted`);

  const accounts = new Map<string, any>();
  for (const entry of normalizedEntries) {
    const key = `${entry.userId}:${entry.asset}`;
    if (!accounts.has(key)) accounts.set(key, await findOrCreateMiningWallet(conn, entry.userId, entry.asset));
  }
  const walletIds = [...accounts.values()].map(row => Number(row.id)).sort((a,b)=>a-b);
  if (!walletIds.length) return [];
  const placeholders = walletIds.map(() => "?").join(",");
  const [lockedRows] = await conn.query<any[]>(`SELECT * FROM v5_wallets WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`, walletIds);
  const lockedById = new Map(lockedRows.map(row => [Number(row.id), row]));
  const newBalances = new Map<number, Decimal>();
  for (const row of lockedRows) {
    await conn.execute(`INSERT IGNORE INTO mining_wallet_baselines (walletId,assetCode,openingAmount) VALUES (?,?,?)`, [Number(row.id), String(row.assetCode), String(row.availableAmount)]);
    newBalances.set(Number(row.id), decimal(row.availableAmount));
  }

  for (const entry of normalizedEntries) {
    const wallet = accounts.get(`${entry.userId}:${entry.asset}`);
    const currentRow = lockedById.get(Number(wallet.id));
    if (!currentRow) throw new MiningError("Unable to lock a Mining wallet; retry the operation");
    const next = (newBalances.get(Number(wallet.id)) || decimal(currentRow.availableAmount)).plus(entry.amount);
    if (entry.userId > 0 && next.isNegative()) throw new MiningError(`Insufficient simulated ${entry.asset} balance`);
    newBalances.set(Number(wallet.id), next);
  }

  const inserted: number[] = [];
  let entryIndex = 0;
  for (const entry of normalizedEntries) {
    const wallet = accounts.get(`${entry.userId}:${entry.asset}`);
    const scale = assetScale(entry.asset);
    const amount = new Decimal(entry.amount).toFixed(scale, Decimal.ROUND_DOWN);
    const [result] = await conn.execute<any>(`INSERT INTO v5_wallet_ledger
      (walletId,entryType,amount,assetCode,referenceType,referenceId,idempotencyKey,reversalOfId,precisionSnapshotJson)
      VALUES (?,?,?,?,?,?,?,?,?)`, [Number(wallet.id), entry.entryType.slice(0,40), amount, entry.asset, "mining_transaction", String(transaction.id), `mining-ledger:${transaction.id}:${entryIndex++}`, entry.reversalOfId ?? null, JSON.stringify({ asset: entry.asset, scale, roundingMode: "down", transactionReference: transaction.referenceCode })]);
    inserted.push(Number(result.insertId));
  }
  for (const [walletId, balance] of newBalances) {
    const row = lockedById.get(walletId)!;
    await conn.execute(`UPDATE v5_wallets SET availableAmount=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`, [balance.toFixed(assetScale(String(row.assetCode)), Decimal.ROUND_DOWN), walletId]);
  }
  return inserted;
}

export async function createMiningNotification(conn: Db, userId: number, title: string, body: string) {
  await conn.execute(`INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)`, [userId, title.slice(0, 200), body.slice(0, 4000)]);
}

export async function quoteRatesDetails(conn: Db, sourceAsset: string, targetAsset: string, config: MiningConfig, now = new Date()) {
  const rates = await getMiningRates(conn, sourceAsset, targetAsset, config, now);
  return {
    sourceUsdRate: rates.source.usdPerUnit,
    targetUsdRate: rates.target.usdPerUnit,
    sourceProvider: rates.source.provider,
    targetProvider: rates.target.provider,
    marketProvider: [...new Set([rates.source.provider, rates.target.provider])].join(" + ").slice(0, 120),
    marketObservedAt: rates.observedAt,
    sourceScale: rates.source.scale,
    targetScale: rates.target.scale,
  };
}
