import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";

type Db = mysql.PoolConnection;
type StakeProduct = {
  id: number;
  name: string;
  category: "CORE_STAKING" | "LIQUIDITY" | "LENDING" | "RESTAKING" | "YIELD" | "RWA";
  asset: string;
  annualRateBps: number;
  durationDays: number;
  minMinor: number;
  maxMinor: number;
  rewardFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  lockDays: number;
  riskLevel: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  status: "AVAILABLE" | "PAUSED";
  supportsCompounding: boolean;
};

const productSeed = [
  ["Core Staking", "CORE_STAKING", "USD", 620, 30, 10000, 100000000, "DAILY", 30, "MODERATE", 1],
  ["Liquidity Provision", "LIQUIDITY", "USD", 940, 30, 25000, 100000000, "WEEKLY", 7, "ELEVATED", 0],
  ["Stablecoin Lending", "LENDING", "USD", 840, 90, 50000, 100000000, "MONTHLY", 30, "MODERATE", 1],
  ["Restaking Vault", "RESTAKING", "USD", 1120, 180, 100000, 100000000, "DAILY", 30, "ELEVATED", 1],
  ["Yield Strategy", "YIELD", "USD", 780, 60, 10000, 100000000, "WEEKLY", 14, "MODERATE", 1],
  ["Real-World Asset Yield", "RWA", "USD", 560, 90, 100000, 100000000, "MONTHLY", 30, "LOW", 0],
] as const;

async function withConnection<T>(fn: (conn: Db) => Promise<T>) {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), connectionLimit: 2 });
  const conn = await pool.getConnection();
  try { return await fn(conn); } finally { conn.release(); await pool.end(); }
}

async function ensureProducts(conn: Db) {
  for (const p of productSeed) {
    await conn.execute(`INSERT INTO stake_products (name, category, asset, annualRateBps, durationDays, minMinor, maxMinor, rewardFrequency, lockDays, riskLevel, status, supportsCompounding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)
      ON DUPLICATE KEY UPDATE annualRateBps=VALUES(annualRateBps), durationDays=VALUES(durationDays), minMinor=VALUES(minMinor), maxMinor=VALUES(maxMinor), rewardFrequency=VALUES(rewardFrequency), lockDays=VALUES(lockDays), riskLevel=VALUES(riskLevel), status='AVAILABLE', supportsCompounding=VALUES(supportsCompounding)`, p);
  }
}

function idempotencyKey(input: string | undefined, userId: number) {
  const value = String(input || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new Error("A valid idempotency key is required");
  return `stake:${userId}:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function rewardFor(principal: number, annualRateBps: number, durationDays: number) {
  return Math.floor(principal * annualRateBps * durationDays / (10000 * 365));
}

function nextRewardAt(from: Date, frequency: string) {
  const days = frequency === "DAILY" ? 1 : frequency === "WEEKLY" ? 7 : 30;
  return new Date(from.getTime() + days * 86400000);
}

const rewardIntervalMs = (frequency: string) =>
  frequency === "DAILY" ? 86400000 : frequency === "WEEKLY" ? 604800000 : 2592000000;

/**
 * Calculate the number of reward periods due and the first scheduled period
 * after `now`. Keeping these together prevents catch-up payouts from leaving
 * nextRewardAt behind the current time after a multi-period reward is posted.
 */
export function calculateDueRewardSchedule(nextAt: Date, frequency: string, now = new Date()) {
  const intervalMs = rewardIntervalMs(frequency);
  const periodsDue = Math.max(1, Math.floor((now.getTime() - nextAt.getTime()) / intervalMs) + 1);
  return {
    periodsDue,
    nextRewardAt: new Date(nextAt.getTime() + periodsDue * intervalMs),
  };
}

async function postDueRewards(conn: Db, userId: number) {
  const [positions] = await conn.query<any[]>(`SELECT p.*, sp.annualRateBps, sp.rewardFrequency, sp.name AS productName
    FROM stake_positions p JOIN stake_products sp ON sp.id=p.productId
    WHERE p.userId=? AND p.status IN ('ACTIVE','REWARD_ACCRUING') AND p.nextRewardAt IS NOT NULL AND p.nextRewardAt<=NOW() FOR UPDATE`, [userId]);
  for (const position of positions) {
    const schedule = calculateDueRewardSchedule(new Date(position.nextRewardAt), position.rewardFrequency);
    const periods = schedule.periodsDue;
    const reward = Math.max(0, Math.floor(Number(position.principalMinor) * Number(position.annualRateBps) * ((position.rewardFrequency === "DAILY" ? periods : periods * (position.rewardFrequency === "WEEKLY" ? 7 : 30))) / (10000 * 365)) - Number(position.rewardMinor));
    if (!reward) {
      // Advance the schedule even when rounding produces no payable minor unit;
      // otherwise the same overdue position is selected on every dashboard read.
      await conn.execute(`UPDATE stake_positions SET nextRewardAt=?, updatedAt=NOW() WHERE id=?`, [schedule.nextRewardAt, position.id]);
      continue;
    }
    const reference = `stake-reward:${position.id}:${position.rewardCount + 1}`;
    const [existing] = await conn.query<any[]>(`SELECT id FROM balance_ledger WHERE reference=? LIMIT 1`, [reference]);
    if (!existing.length) {
      await conn.execute(`INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,false)`, [userId, position.asset, reward, "stake_reward", reference]);
      await conn.execute(`UPDATE customer_balances SET availableMinor=availableMinor+?, earnedMinor=earnedMinor+?, updatedAt=NOW() WHERE userId=? AND currency=?`, [reward, reward, userId, position.asset]);
      await conn.execute(`INSERT INTO stake_rewards (positionId,userId,amountMinor,asset,status,calculatedAt,postedAt,ledgerReference) VALUES (?,?,?,?, 'POSTED', NOW(), NOW(), ?)`, [position.id, userId, reward, position.asset, reference]);
      await conn.execute(`INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)`, [userId, position.id, "reward.posted", "REWARD_ACCRUING", "REWARD_ACCRUING", reward, position.asset, JSON.stringify({ ledgerReference: reference })]);
      await conn.execute(`INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)`, [userId, "Reward credited", `A ${reward} minor-unit reward was posted to your ${position.asset} wallet.`]);
    }
    await conn.execute(`UPDATE stake_positions SET rewardMinor=rewardMinor+?, rewardCount=rewardCount+1, status='REWARD_ACCRUING', nextRewardAt=?, updatedAt=NOW() WHERE id=?`, [reward, schedule.nextRewardAt, position.id]);
  }
}

export async function settleDuePositions(conn: Db, userId: number) {
  const [positions] = await conn.query<any[]>(`SELECT * FROM stake_positions WHERE userId=? AND status IN ('ACTIVE','REWARD_ACCRUING','SETTLING') AND maturityAt<=NOW() FOR UPDATE`, [userId]);
  for (const p of positions) {
    const reference = `stake-settlement:${p.id}`;
    const [existing] = await conn.query<any[]>(`SELECT id FROM balance_ledger WHERE reference=? LIMIT 1`, [reference]);
    if (existing.length) {
      // A pending/matured position with a prior principal-release ledger entry
      // is an inconsistent historical state. Never silently leave it active or
      // credit the wallet again; roll back and require reconciliation.
      throw new Error("Stake settlement invariant violation for " + reference + ": principal-release ledger already exists while position is not completed.");
    }
    await conn.execute(`INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,false)`, [userId, p.asset, p.principalMinor, "stake_principal_release", reference]);
    const [walletUpdate] = await conn.execute<any>(`UPDATE customer_balances SET availableMinor=availableMinor+?, lockedMinor=GREATEST(lockedMinor-?,0), updatedAt=NOW() WHERE userId=? AND currency=?`, [p.principalMinor, p.principalMinor, userId, p.asset]);
    if (Number(walletUpdate.affectedRows) !== 1) throw new Error("Stake settlement " + reference + " must update exactly one wallet row; received " + (Number(walletUpdate.affectedRows) || 0) + ".");
    const [positionUpdate] = await conn.execute<any>(`UPDATE stake_positions SET status='COMPLETED', completedAt=NOW(), updatedAt=NOW() WHERE id=? AND status IN ('ACTIVE','REWARD_ACCRUING','SETTLING')`, [p.id]);
    if (Number(positionUpdate.affectedRows) !== 1) throw new Error("Stake settlement " + reference + " must complete exactly one eligible position; received " + (Number(positionUpdate.affectedRows) || 0) + ".");
    await conn.execute(`INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)`, [userId, p.id, "position.completed", p.status, "COMPLETED", p.principalMinor, p.asset, JSON.stringify({ ledgerReference: reference })]);
    await conn.execute(`INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)`, [userId, "Funds released", `Your Stake & Earn position ${p.positionCode} matured and principal was released to your wallet.`]);
  }
}

export async function getStakeDashboard(userId: number) {
  return withConnection(async conn => {
    await conn.beginTransaction();
    try {
      await ensureProducts(conn);
      await postDueRewards(conn, userId);
      await settleDuePositions(conn, userId);
      const [products] = await conn.query<any[]>(`SELECT * FROM stake_products WHERE status='AVAILABLE' ORDER BY FIELD(category,'CORE_STAKING','LIQUIDITY','LENDING','RESTAKING','YIELD','RWA'), id`);
      const [positions] = await conn.query<any[]>(`SELECT p.*, sp.name productName, sp.category, sp.rewardFrequency, sp.annualRateBps, sp.lockDays FROM stake_positions p JOIN stake_products sp ON sp.id=p.productId WHERE p.userId=? ORDER BY p.openedAt DESC`, [userId]);
      const [rewards] = await conn.query<any[]>(`SELECT r.*, p.positionCode FROM stake_rewards r JOIN stake_positions p ON p.id=r.positionId WHERE r.userId=? ORDER BY r.postedAt DESC LIMIT 50`, [userId]);
      const [events] = await conn.query<any[]>(`SELECT e.*, p.positionCode FROM stake_events e LEFT JOIN stake_positions p ON p.id=e.positionId WHERE e.userId=? ORDER BY e.createdAt DESC LIMIT 50`, [userId]);
      const [balances] = await conn.query<any[]>(`SELECT c.code currency, c.symbol, c.scale, c.name currencyName, COALESCE(b.availableMinor,0) availableMinor, COALESCE(b.lockedMinor,0) lockedMinor, COALESCE(b.promotionalMinor,0) promotionalMinor, COALESCE(b.earnedMinor,0) earnedMinor FROM currency_registry c LEFT JOIN customer_balances b ON b.currency=c.code AND b.userId=? WHERE c.enabled=true ORDER BY c.id`, [userId]);
      const [ledger] = await conn.query<any[]>(`SELECT COALESCE(SUM(CASE WHEN entryType='stake_reward' THEN amountMinor ELSE 0 END),0) rewards, COALESCE(SUM(CASE WHEN entryType IN ('stake_allocation','stake_principal_release') THEN -amountMinor ELSE 0 END),0) allocated FROM balance_ledger WHERE userId=?`, [userId]);
      await conn.commit();
      const allocatedMinor = positions.filter(p => p.status !== "COMPLETED" && p.status !== "CANCELLED").reduce((n,p)=>n+Number(p.principalMinor),0);
      return { products, positions, rewards, events, balances, summary: { allocatedMinor, rewardsMinor: Number(ledger[0]?.rewards || 0), activePositions: positions.filter(p=>["ACTIVE","REWARD_ACCRUING","PROCESSING","PENDING"].includes(p.status)).length, completedPositions: positions.filter(p=>p.status === "COMPLETED").length } };
    } catch (e) { await conn.rollback(); throw e; }
  });
}

export async function allocateStake(userId: number, input: { productId: number; amountMinor: number; idempotencyKey: string }) {
  return withConnection(async conn => {
    const key = idempotencyKey(input.idempotencyKey, userId);
    await conn.beginTransaction();
    try {
      const [prior] = await conn.query<any[]>(`SELECT resultJson FROM v5_idempotency_keys WHERE userId=? AND keyValue=? LIMIT 1 FOR UPDATE`, [userId, key]);
      if (prior.length) { await conn.commit(); return JSON.parse(prior[0].resultJson); }
      const [productRows] = await conn.query<any[]>(`SELECT * FROM stake_products WHERE id=? AND status='AVAILABLE' FOR UPDATE`, [input.productId]);
      const product = productRows[0] as StakeProduct | undefined;
      if (!product) throw new Error("Stake product is not available");
      if (!Number.isInteger(input.amountMinor) || input.amountMinor < product.minMinor || input.amountMinor > product.maxMinor) throw new Error("Allocation amount is outside this product's limits");
      const [balanceRows] = await conn.query<any[]>(`SELECT * FROM customer_balances WHERE userId=? AND currency=? FOR UPDATE`, [userId, product.asset]);
      const balance = balanceRows[0];
      if (!balance || Number(balance.availableMinor) < input.amountMinor) throw new Error("Insufficient available wallet balance");
      const now = new Date(); const maturity = new Date(now.getTime() + product.durationDays * 86400000); const positionCode = `STK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; const reference = `stake-allocation:${positionCode}`;
      await conn.execute(`INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,false)`, [userId, product.asset, -input.amountMinor, "stake_allocation", reference]);
      await conn.execute(`UPDATE customer_balances SET availableMinor=availableMinor-?, lockedMinor=lockedMinor+?, updatedAt=NOW() WHERE id=?`, [input.amountMinor, input.amountMinor, balance.id]);
      const [positionResult] = await conn.execute<any>(`INSERT INTO stake_positions (positionCode,userId,productId,asset,principalMinor,rewardMinor,status,openedAt,updatedAt,maturityAt,nextRewardAt,originalLedgerReference) VALUES (?,?,?,?,?,0,'ACTIVE',NOW(),NOW(),?,?,?)`, [positionCode, userId, product.id, product.asset, input.amountMinor, maturity, nextRewardAt(now, product.rewardFrequency), reference]);
      const positionId = Number(positionResult.insertId);
      await conn.execute(`INSERT INTO stake_transactions (transactionCode,userId,positionId,type,amountMinor,asset,status,ledgerReference,idempotencyKey) VALUES (?,?,?,?,?,?, 'COMPLETED', ?, ?)`, [`TX-${crypto.randomBytes(5).toString("hex").toUpperCase()}`, userId, positionId, "STAKE_ALLOCATION", input.amountMinor, product.asset, reference, key]);
      await conn.execute(`INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)`, [userId, positionId, "position.created", "PENDING", "ACTIVE", input.amountMinor, product.asset, JSON.stringify({ ledgerReference: reference, productId: product.id })]);
      await conn.execute(`INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)`, [userId, "Allocation confirmed", `Your ${product.name} allocation is active. Funds were reserved through the wallet ledger.`]);
      const result = { positionId, positionCode, status: "ACTIVE", asset: product.asset, principalMinor: input.amountMinor, maturityAt: maturity.toISOString(), ledgerReference: reference };
      await conn.execute(`INSERT INTO v5_idempotency_keys (userId,keyValue,command,resultJson) VALUES (?,?,?,?)`, [userId, key, "stake.allocate", JSON.stringify(result)]);
      await conn.commit(); return result;
    } catch (e) { await conn.rollback(); throw e; }
  });
}

export async function cancelStake(userId: number, positionId: number, requestKey: string) {
  return withConnection(async conn => {
    const key = idempotencyKey(requestKey, userId); await conn.beginTransaction();
    try {
      const [prior] = await conn.query<any[]>(`SELECT resultJson FROM v5_idempotency_keys WHERE userId=? AND keyValue=? LIMIT 1 FOR UPDATE`, [userId, key]);
      if (prior.length) { await conn.commit(); return JSON.parse(prior[0].resultJson); }
      const [rows] = await conn.query<any[]>(`SELECT * FROM stake_positions WHERE id=? AND userId=? FOR UPDATE`, [positionId, userId]); const p=rows[0];
      if (!p || !["ACTIVE","REWARD_ACCRUING"].includes(p.status)) throw new Error("This position cannot be cancelled");
      if (new Date(p.maturityAt).getTime() - Date.now() < 0) throw new Error("Matured positions must be settled");
      const reference=`stake-cancellation:${p.id}`; await conn.execute(`INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,false)`, [userId,p.asset,p.principalMinor,"stake_cancellation_release",reference]);
      await conn.execute(`UPDATE customer_balances SET availableMinor=availableMinor+?, lockedMinor=GREATEST(lockedMinor-?,0), updatedAt=NOW() WHERE userId=? AND currency=?`, [p.principalMinor,p.principalMinor,userId,p.asset]);
      await conn.execute(`UPDATE stake_positions SET status='CANCELLED', completedAt=NOW(), updatedAt=NOW() WHERE id=?`, [p.id]);
      await conn.execute(`INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)`, [userId,p.id,"position.cancelled",p.status,"CANCELLED",p.principalMinor,p.asset,JSON.stringify({ledgerReference:reference})]);
      const result={positionId:p.id,status:"CANCELLED",ledgerReference:reference}; await conn.execute(`INSERT INTO v5_idempotency_keys (userId,keyValue,command,resultJson) VALUES (?,?,?,?)`,[userId,key,"stake.cancel",JSON.stringify(result)]); await conn.commit(); return result;
    } catch(e){await conn.rollback();throw e;}
  });
}

export function projectStake(input: { amountMinor: number; annualRateBps: number; durationDays: number; compounding?: boolean }) {
  if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) throw new Error("Amount must be positive");
  const reward = rewardFor(Math.floor(input.amountMinor), Math.max(0, input.annualRateBps), Math.max(1, input.durationDays));
  return { projectedRewardMinor: reward, projectedEndingMinor: Math.floor(input.amountMinor) + reward, estimatedFeesMinor: 0, isProjection: true };
}

export function __testRewardFor(principal: number, rateBps: number, days: number) { return rewardFor(principal, rateBps, days); }
