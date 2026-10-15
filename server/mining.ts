import crypto from "node:crypto";
import Decimal from "decimal.js";
import { calculateMiningConversion, calculateMiningDifficultyIndex, calculatePackageDailyReward, canStartMiningAccrual, getBoostCooldownWindow } from "./mining-rules";
import {
  Db, MiningError, addUtcMonths, amountString, assertMiningAsset, assetScale, beginMiningIdempotency, createMiningLedgerTransaction,
  createMiningNotification, decimal, ensureMiningCheckpoint, finishMiningIdempotency, inMiningTransaction,
  loadMiningConfig, postMiningLedgerEntries, quoteRatesDetails, requestKey, requireActiveMiningAccount,
  withMiningConnection,
} from "./mining-store";

const tokenScale = 8;
const nowSql = () => new Date();
const ceilAmount = (value: Decimal.Value, scale: number) => new Decimal(value).toDecimalPlaces(scale, Decimal.ROUND_UP);
const floorAmount = (value: Decimal.Value, scale: number) => new Decimal(value).toDecimalPlaces(scale, Decimal.ROUND_DOWN);
const safeJson = (value: unknown) => JSON.stringify(value, (_key, item) => item instanceof Decimal ? item.toString() : item);
const MAIN_WALLET_ASSETS = new Set(["USD", "EUR", "GBP", "BTC", "ETH", "USDT"]);

function assertMainWalletAsset(value: string) {
  const asset = value.trim().toUpperCase();
  if (!MAIN_WALLET_ASSETS.has(asset)) throw new MiningError("Select an enabled main-wallet currency (USD, EUR, GBP, BTC, ETH, or USDT)");
  return asset;
}

async function getMainWalletScale(conn: Db, assetInput: string) {
  const asset = assertMainWalletAsset(assetInput);
  const [rows] = await conn.query<any[]>("SELECT scale FROM currency_registry WHERE code=? AND enabled=1 LIMIT 1", [asset]);
  if (!rows[0]) throw new MiningError(`${asset} is not enabled in the main-wallet currency registry`);
  const scale = Number(rows[0].scale);
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) throw new MiningError(`${asset} has an unsupported main-wallet precision`);
  return scale;
}

function walletMinor(value: Decimal.Value, scale: number) {
  const minor = decimal(value).times(new Decimal(10).pow(scale));
  if (!minor.isInteger() || minor.abs().gt(Number.MAX_SAFE_INTEGER)) throw new MiningError("The amount exceeds the supported main-wallet precision or JavaScript safe-integer range");
  return minor.toNumber();
}

async function readMainWalletBalance(conn: Db, userId: number, assetInput: string, lock = false) {
  const asset = assertMainWalletAsset(assetInput);
  const scale = await getMainWalletScale(conn, asset);
  const [rows] = await conn.query<any[]>(`SELECT id,availableMinor FROM customer_balances WHERE userId=? AND currency=? ORDER BY id LIMIT 1${lock ? " FOR UPDATE" : ""}`, [userId, asset]);
  const availableMinor = Number(rows[0]?.availableMinor || 0);
  const available = new Decimal(availableMinor).div(new Decimal(10).pow(scale));
  return { asset, scale, rowId: rows[0] ? Number(rows[0].id) : null, availableMinor, available: available.toFixed(scale) };
}

async function debitMainWallet(conn: Db, userId: number, assetInput: string, amountInput: Decimal.Value, reference: string, entryType: string) {
  const wallet = await readMainWalletBalance(conn, userId, assetInput, true);
  const amount = decimal(amountInput);
  const minor = walletMinor(amount, wallet.scale);
  if (minor <= 0) throw new MiningError("A positive main-wallet debit is required");
  if (!wallet.rowId || wallet.availableMinor < minor) throw new MiningError(`Insufficient available ${wallet.asset} main-wallet balance`);
  const [updated] = await conn.execute<any>("UPDATE customer_balances SET availableMinor=availableMinor-?,updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND availableMinor>=?", [minor, wallet.rowId, minor]);
  if (Number(updated.affectedRows) !== 1) throw new MiningError(`Insufficient available ${wallet.asset} main-wallet balance`);
  await conn.execute("INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable,createdAt) VALUES (?,?,?,?,?,0,UTC_TIMESTAMP(3))", [userId, wallet.asset, -minor, entryType, reference]);
  return { asset: wallet.asset, scale: wallet.scale, amount: amount.toFixed(wallet.scale), amountMinor: minor };
}

async function creditMainWallet(conn: Db, userId: number, assetInput: string, amountInput: Decimal.Value, reference: string, entryType: string, withdrawable: boolean) {
  const asset = assertMainWalletAsset(assetInput);
  const scale = await getMainWalletScale(conn, asset);
  const amount = decimal(amountInput);
  const minor = walletMinor(amount, scale);
  if (minor <= 0) throw new MiningError("A positive main-wallet credit is required");
  const [rows] = await conn.query<any[]>("SELECT id FROM customer_balances WHERE userId=? AND currency=? ORDER BY id LIMIT 1 FOR UPDATE", [userId, asset]);
  if (rows[0]) {
    await conn.execute("UPDATE customer_balances SET availableMinor=availableMinor+?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?", [minor, Number(rows[0].id)]);
  } else {
    await conn.execute("INSERT INTO customer_balances (userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor,updatedAt) VALUES (?,?,?,0,0,0,UTC_TIMESTAMP(3))", [userId, asset, minor]);
  }
  await conn.execute("INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable,createdAt) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))", [userId, asset, minor, entryType, reference, withdrawable ? 1 : 0]);
  return { asset, scale, amount: amount.toFixed(scale), amountMinor: minor };
}

async function getSavedPurchaseCurrency(conn: Db, userId: number) {
  let [rows] = await conn.query<any[]>("SELECT tradingCurrency FROM customer_wallet_preferences WHERE userId=? LIMIT 1", [userId]);
  if (!rows[0]) {
    await conn.execute("INSERT INTO customer_wallet_preferences (userId) VALUES (?) ON DUPLICATE KEY UPDATE userId=VALUES(userId)", [userId]);
    [rows] = await conn.query<any[]>("SELECT tradingCurrency FROM customer_wallet_preferences WHERE userId=? LIMIT 1", [userId]);
  }
  if (!rows[0]) throw new MiningError("Set a default purchase currency in wallet preferences before buying a package");
  return assertMainWalletAsset(String(rows[0].tradingCurrency));
}

async function getSavedSwapCurrency(conn: Db, userId: number) {
  let [rows] = await conn.query<any[]>("SELECT swapCurrency FROM customer_wallet_preferences WHERE userId=? LIMIT 1", [userId]);
  if (!rows[0]) {
    await conn.execute("INSERT INTO customer_wallet_preferences (userId) VALUES (?) ON DUPLICATE KEY UPDATE userId=VALUES(userId)", [userId]);
    [rows] = await conn.query<any[]>("SELECT swapCurrency FROM customer_wallet_preferences WHERE userId=? LIMIT 1", [userId]);
  }
  if (!rows[0]) throw new MiningError("Set a default swap currency in wallet preferences before enabling automatic conversion");
  return assertMainWalletAsset(String(rows[0].swapCurrency));
}

type MiningNetworkTelemetry = {
  activeMiners: number;
  hashPowerThs: string;
  difficultyIndex: string;
  difficultyBaselineThs: string;
  observedAt: string;
  simulationOnly: true;
};

const NETWORK_TELEMETRY_CACHE_MS = 15_000;
let networkTelemetryCache: { expiresAt: number; baselineThs: string; value: MiningNetworkTelemetry } | null = null;

async function getMiningNetworkTelemetry(conn: Db, at: Date, baselineThs: string): Promise<MiningNetworkTelemetry> {
  if (networkTelemetryCache && networkTelemetryCache.expiresAt > Date.now() && networkTelemetryCache.baselineThs === baselineThs) return networkTelemetryCache.value;

  const [rows] = await conn.query<any[]>(`SELECT COUNT(*) AS activeMiners,
      COALESCE(SUM(activeUsers.baseThs),0) AS baseThs, COALESCE(SUM(activeUsers.boostThs),0) AS boostThs
    FROM (
      SELECT packageTotals.userId,packageTotals.baseThs,COALESCE(boostTotals.boostThs,0) AS boostThs
      FROM (
        SELECT cp.userId,SUM(cp.baseThsSnapshot) AS baseThs
        FROM mining_customer_packages cp
        LEFT JOIN customer_controls cc ON cc.userId=cp.userId
        WHERE cp.status IN ('active','replaced') AND cp.startsAt<=?
          AND (cp.expiresAt IS NULL OR cp.expiresAt>?) AND (cp.endedAt IS NULL OR cp.endedAt>?)
          AND COALESCE(cc.accountStatus,'active')='active'
        GROUP BY cp.userId
      ) packageTotals
      LEFT JOIN (
        SELECT userId,SUM(bonusThs) AS boostThs FROM mining_boost_activations
        WHERE status='active' AND startedAt<=? AND endsAt>?
        GROUP BY userId
      ) boostTotals ON boostTotals.userId=packageTotals.userId
    ) activeUsers`, [at, at, at, at, at]);

  const row = rows[0] || {};
  const hashPower = decimal(row.baseThs || "0").plus(decimal(row.boostThs || "0"));
  const value: MiningNetworkTelemetry = {
    activeMiners: Number(row.activeMiners || 0),
    hashPowerThs: hashPower.toSignificantDigits(18).toString(),
    difficultyIndex: calculateMiningDifficultyIndex(hashPower.toString(), baselineThs),
    difficultyBaselineThs: baselineThs,
    observedAt: at.toISOString(),
    simulationOnly: true,
  };
  networkTelemetryCache = { expiresAt: Date.now() + NETWORK_TELEMETRY_CACHE_MS, baselineThs, value };
  return value;
}

async function readWallet(conn: Db, userId: number, asset: string) {
  const [rows] = await conn.query<any[]>(`SELECT id,availableAmount,lockedAmount,pendingAmount FROM v5_wallets WHERE userId=? AND assetCode=? ORDER BY id LIMIT 2`, [userId, asset]);
  if (rows.length > 1) throw new MiningError(`Multiple ${asset} wallet records exist; contact an administrator`);
  const row = rows[0];
  return { available: String(row?.availableAmount || "0"), locked: String(row?.lockedAmount || "0"), pending: String(row?.pendingAmount || "0") };
}

async function insertFxQuote(conn: Db, input: {
  userId: number; purpose: "manual_swap" | "package_purchase" | "auto_conversion";
  sourceAsset: string; targetAsset: string; sourceAmount: string; targetAmount: string; fee: string;
  sourceUsdRate: Decimal; targetUsdRate: Decimal; tokenUnitsPerUsd: string; marketProvider: string;
  marketObservedAt: Date; targetScale: number; feeBps: number; quoteTtlSeconds: number;
  packageVersionId?: number | null; configVersion: number; details?: Record<string, unknown>;
}) {
  const quotedAt = nowSql();
  const validUntil = new Date(quotedAt.getTime() + input.quoteTtlSeconds * 1000);
  const ratio = decimal(input.targetAmount).div(decimal(input.sourceAmount));
  const reference = `MINING:${input.purpose}:${input.userId}:${crypto.randomBytes(8).toString("hex")}`;
  const [result] = await conn.execute<any>(`INSERT INTO v5_fx_quotes
    (provider,fromAsset,toAsset,sourceAmount,destinationAmount,rate,fee,spread,quotedAt,validUntil,status,reference)
    VALUES (?,?,?,?,?,?,?,?,?,?,'QUOTED',?)`, [
    input.marketProvider.slice(0, 120), input.sourceAsset, input.targetAsset, input.sourceAmount, input.targetAmount,
    ratio.toSignificantDigits(24).toString(), input.fee, "0", quotedAt, validUntil, reference,
  ]);
  const quoteId = Number(result.insertId);
  await conn.execute(`INSERT INTO mining_quote_snapshots
    (quoteId,userId,purpose,packageVersionId,tokenUnitsPerUsd,sourceUsdRate,targetUsdRate,marketProvider,marketObservedAt,targetScale,feeBps,roundingMode,detailsJson)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'down',?)`, [
    quoteId, input.userId, input.purpose, input.packageVersionId ?? null, input.tokenUnitsPerUsd,
    input.sourceUsdRate.toSignificantDigits(24).toString(), input.targetUsdRate.toSignificantDigits(24).toString(),
    input.marketProvider.slice(0, 120), input.marketObservedAt, input.targetScale, input.feeBps,
    safeJson({ configVersion: input.configVersion, ...input.details }),
  ]);
  return { quoteId, reference, quotedAt, validUntil, rate: ratio.toSignificantDigits(24).toString() };
}

function ensureExactPrecision(value: string | number, asset: string, label: string) {
  const amount = decimal(value);
  if (!amount.gt(0)) throw new MiningError(`${label} must be greater than zero`);
  const quantized = floorAmount(amount, assetScale(asset));
  if (!quantized.eq(amount)) throw new MiningError(`${label} exceeds ${asset} precision (${assetScale(asset)} decimal places)`);
  return quantized;
}

async function getPublishedPackage(conn: Db, packageVersionId: number) {
  const [rows] = await conn.query<any[]>(`SELECT p.id packageId,p.code,p.name,p.displayOrder,p.status packageStatus,p.currentVersionId,
      v.id versionId,v.version,v.displayName,v.versionStatus,v.priceAmount,v.priceAsset,v.baseThs,v.boostBonusThs,v.boostDurationSeconds,v.expectedDailyRewardCki,
      v.maxPerCustomer,v.stackingPolicy,v.expirySeconds,v.durationMonths,v.termsText,v.simulationAcknowledgementRequired,v.effectiveAt
    FROM mining_packages p JOIN mining_package_versions v ON v.packageId=p.id
    WHERE v.id=? LIMIT 1`, [packageVersionId]);
  const row = rows[0];
  if (!row || row.packageStatus !== "published" || row.versionStatus !== "published" || Number(row.currentVersionId) !== Number(row.versionId) || !row.effectiveAt || new Date(row.effectiveAt).getTime() > Date.now()) {
    throw new MiningError("This Mining package is not currently available for purchase");
  }
  return row;
}

function pricePayment(packagePrice: string, targetUsdRate: Decimal, sourceUsdRate: Decimal, sourceAsset: string, feeBps: number, sourceScale = assetScale(sourceAsset)) {
  const priceUsd = decimal(packagePrice).times(targetUsdRate);
  const gross = ceilAmount(priceUsd.div(sourceUsdRate), sourceScale);
  const fee = ceilAmount(gross.times(feeBps).div(10_000), sourceScale);
  return { gross, fee, total: gross.plus(fee) };
}

export async function listCustomerMiningPackages(userId: number) {
  return withMiningConnection(async conn => {
    const [rows] = await conn.query<any[]>(`SELECT p.id packageId,p.code,p.name,p.displayOrder,p.status packageStatus,p.currentVersionId,
        v.id versionId,v.version,v.displayName,v.priceAmount,v.priceAsset,v.baseThs,v.boostBonusThs,v.boostDurationSeconds,v.expectedDailyRewardCki,
        v.maxPerCustomer,v.stackingPolicy,v.expirySeconds,v.durationMonths,v.termsText,v.simulationAcknowledgementRequired,v.effectiveAt,
        CASE WHEN c.userId IS NULL THEN 0 ELSE 1 END alreadyPurchased
      FROM mining_packages p JOIN mining_package_versions v ON v.id=p.currentVersionId
      LEFT JOIN mining_package_purchase_claims c ON c.userId=? AND c.packageId=p.id
      WHERE p.status IN ('published','paused') AND v.versionStatus='published' ORDER BY p.displayOrder,p.id`, [userId]);
    const config = await loadMiningConfig(conn);
    return rows.map(row => {
      const estimate = row.expectedDailyRewardCki === null ? null : decimal(row.expectedDailyRewardCki);
      const alreadyPurchased = Boolean(row.alreadyPurchased);
      const purchaseAvailable = row.packageStatus === "published" && config.packagePurchasesEnabled && !alreadyPurchased;
      return {
        packageId: Number(row.packageId), code: row.code, name: row.displayName || row.name, displayOrder:Number(row.displayOrder), status: row.packageStatus,
        alreadyPurchased,
        tokenName: config.tokenName, tokenSymbol: config.tokenSymbol,
        usdPerToken: decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(),
        versionId: Number(row.versionId), version: Number(row.version), priceAmount: String(row.priceAmount), priceAsset: assertMiningAsset(String(row.priceAsset)),
        baseThs: String(row.baseThs), boostBonusThs: String(row.boostBonusThs),
        expectedDailyRewardCki: estimate?.toDecimalPlaces(tokenScale, Decimal.ROUND_DOWN).toFixed(tokenScale) ?? null,
        estimatedHourlyTokens: estimate?.div(24).toDecimalPlaces(tokenScale, Decimal.ROUND_DOWN).toFixed(tokenScale) ?? null,
        estimatedDailyUsd: estimate?.div(config.tokenUnitsPerUsd).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2) ?? null,
        calculationModel: config.calculationModel,
        boostDurationSeconds: Number(row.boostDurationSeconds || config.boostDurationSeconds),
        maxPerCustomer: 1, stackingPolicy: row.stackingPolicy, expirySeconds: row.expirySeconds === null ? null : Number(row.expirySeconds), durationMonths:row.durationMonths===null?null:Number(row.durationMonths),
        termsText: row.termsText, simulationAcknowledgementRequired: Boolean(row.simulationAcknowledgementRequired),
        estimatedDailyTokens: estimate?.toDecimalPlaces(tokenScale, Decimal.ROUND_DOWN).toFixed(tokenScale) ?? null,
        miningEnabled: config.globalEnabled, purchaseAvailable,
        purchaseUnavailableReason: purchaseAvailable ? null : alreadyPurchased ? "This package is limited to one lifetime purchase per customer" : !config.packagePurchasesEnabled ? "Package purchases are paused by operations" : "This package is not currently published",
      };
    });
  });
}

export async function createCustomerMiningPurchaseQuote(userId: number, input: { packageVersionId: number; paymentAsset?: string }) {
  return withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    await requireActiveMiningAccount(conn, userId);
    const config = await loadMiningConfig(conn);
    if (!config.packagePurchasesEnabled) throw new MiningError("Package purchases are paused by operations");
    const preferredPaymentAsset = await getSavedPurchaseCurrency(conn, userId);
    const paymentAsset = input.paymentAsset ? assertMainWalletAsset(input.paymentAsset) : preferredPaymentAsset;
    const [claimRows] = await conn.query<any[]>("SELECT packageId FROM mining_package_purchase_claims WHERE userId=? AND packageId=(SELECT packageId FROM mining_package_versions WHERE id=?) LIMIT 1", [userId, input.packageVersionId]);
    if (claimRows.length) throw new MiningError("You can purchase each Mining package only once");
    const product = await getPublishedPackage(conn, input.packageVersionId);
    const priceAsset = assertMainWalletAsset(String(product.priceAsset));
    const priceScale = await getMainWalletScale(conn, priceAsset);
    const price = decimal(String(product.priceAmount));
    if (!price.gt(0) || !floorAmount(price, priceScale).eq(price)) throw new MiningError(`Package price must be positive and fit ${priceAsset} wallet precision`);
    const wallet = await readMainWalletBalance(conn, userId, paymentAsset);
    const rates = await quoteRatesDetails(conn, paymentAsset, priceAsset, config);
    const payment = pricePayment(price.toString(), rates.targetUsdRate, rates.sourceUsdRate, paymentAsset, config.purchaseFeeBps, wallet.scale);
    if (!payment.total.gt(0)) throw new MiningError("The calculated package price is not valid");
    const paymentAmount = ceilAmount(payment.total, wallet.scale).toFixed(wallet.scale);
    const paymentFee = ceilAmount(payment.fee, wallet.scale).toFixed(wallet.scale);
    const quote = await insertFxQuote(conn, {
      userId, purpose: "package_purchase", sourceAsset: paymentAsset, targetAsset: priceAsset,
      sourceAmount: paymentAmount, targetAmount: price.toFixed(priceScale), fee: paymentFee,
      sourceUsdRate: rates.sourceUsdRate, targetUsdRate: rates.targetUsdRate, tokenUnitsPerUsd: config.tokenUnitsPerUsd,
      marketProvider: rates.marketProvider, marketObservedAt: rates.marketObservedAt, targetScale: priceScale,
      feeBps: config.purchaseFeeBps, quoteTtlSeconds: config.quoteTtlSeconds, packageVersionId: input.packageVersionId,
      configVersion: config.version, details: { packageId: Number(product.packageId), packageName:String(product.displayName||product.name), durationMonths:product.durationMonths===null?null:Number(product.durationMonths), expectedDailyRewardCki:product.expectedDailyRewardCki===null?null:String(product.expectedDailyRewardCki), priceAmount: price.toString(), priceAsset, paymentAsset, preferredPaymentAsset, mainWalletScale:wallet.scale, grossPayment: ceilAmount(payment.gross,wallet.scale).toFixed(wallet.scale), feeAsset: paymentAsset },
    });
    const balance = wallet;
    return {
      ...quote, packageId: Number(product.packageId), packageVersionId: input.packageVersionId, packageName: product.displayName||product.name,
      sourceAsset: paymentAsset, sourceAmount: paymentAmount, packagePrice: price.toFixed(priceScale), packagePriceAsset: priceAsset,
      fee: paymentFee, feeAsset: paymentAsset, availableBalance: balance.available,
      preferredPaymentAsset, paymentAsset, sufficientBalance: decimal(balance.available).gte(paymentAmount), expiresAt: quote.validUntil.toISOString(),
      provider: rates.marketProvider, priceObservedAt: rates.marketObservedAt.toISOString(),
      disclaimer: "Indicative main-wallet package-purchase quote. The charge is subject to live price validation and the customer's saved wallet balance.",
    };
  }));
}

export async function confirmCustomerMiningPurchase(userId: number, input: { quoteId: number; idempotencyKey: string; acceptedTerms: boolean }) {
  if (!input.acceptedTerms) throw new MiningError("Accept the current package terms before purchasing");
  const key = requestKey("mining-purchase", userId, input.idempotencyKey);
  const purchase = await withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    const prior = await beginMiningIdempotency(conn, userId, key, "mining.package.purchase");
    if (prior) return prior;
    const checkpoint = await ensureMiningCheckpoint(conn, userId);
    await requireActiveMiningAccount(conn, userId);
    const config = await loadMiningConfig(conn);
    if (!config.packagePurchasesEnabled) throw new MiningError("Package purchases are paused by operations; no debit was made");
    const [quotes] = await conn.query<any[]>(`SELECT q.*,s.*,p.id packageId,p.code,p.name,p.status packageStatus,p.currentVersionId,
        v.version,v.displayName,v.durationMonths,v.expectedDailyRewardCki,v.versionStatus,v.effectiveAt packageEffectiveAt,v.baseThs,v.boostBonusThs,v.boostDurationSeconds,v.maxPerCustomer,v.stackingPolicy,v.expirySeconds,v.termsText,v.simulationAcknowledgementRequired
      FROM v5_fx_quotes q JOIN mining_quote_snapshots s ON s.quoteId=q.id
      JOIN mining_package_versions v ON v.id=s.packageVersionId JOIN mining_packages p ON p.id=v.packageId
      WHERE q.id=? AND s.userId=? AND s.purpose='package_purchase' FOR UPDATE`, [input.quoteId, userId]);
    const quote = quotes[0];
    if (!quote || quote.status !== "QUOTED" || new Date(quote.validUntil).getTime() <= Date.now()) throw new MiningError("This package quote has expired; request a fresh quote");
    if (quote.packageStatus !== "published" || quote.versionStatus !== "published" || Number(quote.currentVersionId) !== Number(quote.packageVersionId)) throw new MiningError("Package terms changed after this quote; review a fresh package quote");
    if (!quote.packageEffectiveAt || new Date(quote.packageEffectiveAt).getTime() > Date.now()) throw new MiningError("This package version is not effective yet");
    if (Boolean(quote.simulationAcknowledgementRequired) && !input.acceptedTerms) throw new MiningError("Package terms acceptance is required");
    let details: any = {};
    try { details = JSON.parse(String(quote.detailsJson || "{}")); } catch { throw new MiningError("The stored quote details are invalid; request a fresh quote"); }
    if (Number(details.configVersion) !== config.version) throw new MiningError("Mining pricing changed after this quote; request a fresh quote");
    const paymentAsset = assertMainWalletAsset(String(quote.fromAsset));
    const priceAsset = assertMainWalletAsset(String(quote.toAsset));
    const price = decimal(String(quote.destinationAmount));
    const paymentScale = await getMainWalletScale(conn, paymentAsset);
    const currentRates = await quoteRatesDetails(conn, paymentAsset, priceAsset, config);
    const recomputed = pricePayment(price.toString(), currentRates.targetUsdRate, currentRates.sourceUsdRate, paymentAsset, Number(quote.feeBps), paymentScale);
    const currentTotal = recomputed.total;
    const quotedTotal = decimal(String(quote.sourceAmount));
    const changeBps = currentTotal.minus(quotedTotal).abs().div(quotedTotal).times(10_000);
    if (changeBps.gt(config.maxRateDeviationBps)) throw new MiningError("The package quote moved outside the allowed price tolerance; request a fresh quote");
    const available = await readMainWalletBalance(conn, userId, paymentAsset, true);
    if (decimal(available.available).lt(quotedTotal)) throw new MiningError(`Insufficient available ${paymentAsset} main-wallet balance`);
    if (Number(quote.maxPerCustomer) > 0) {
      const [countRows] = await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_customer_packages WHERE userId=? AND packageId=? AND status<>'cancelled'`, [userId, quote.packageId]);
      if (Number(countRows[0]?.total || 0) >= Number(quote.maxPerCustomer)) throw new MiningError("This package has reached its per-customer purchase limit");
    }
    const now = new Date();
    try {
      await conn.execute(`INSERT INTO mining_package_purchase_claims (userId,packageId,firstQuoteId,claimedAt) VALUES (?,?,?,?)`, [userId, Number(quote.packageId), input.quoteId, now]);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && String((error as any).code) === "ER_DUP_ENTRY") throw new MiningError("You can purchase each Mining package only once");
      throw error;
    }
    if (quote.stackingPolicy === "replace") {
      await conn.execute(`UPDATE mining_customer_packages SET status='replaced',endedAt=? WHERE userId=? AND status='active' AND startsAt<=? AND (expiresAt IS NULL OR expiresAt>?)`, [now, userId, now, now]);
    }
    const canonicalReference = `mining-purchase:${input.quoteId}`;
    const canonicalDebit = await debitMainWallet(conn, userId, paymentAsset, quotedTotal, canonicalReference, "mining_package_debit");
    const ledgerKey = key;
    const ledger = await createMiningLedgerTransaction(conn, {
      userId, actorUserId: userId, transactionType: "package_purchase", idempotencyKey: ledgerKey,
      metadata: { quoteId: input.quoteId, packageId: Number(quote.packageId), packageVersionId: Number(quote.packageVersionId), paymentAsset, paymentAmount: quotedTotal.toString(), fee: String(quote.fee), canonicalMainWalletReference: canonicalReference, canonicalWalletScale: canonicalDebit.scale, packageTermsAccepted: true },
    });
    await postMiningLedgerEntries(conn, ledger, [
      { userId: 0, asset: paymentAsset, amount: quotedTotal, entryType: "main_wallet_purchase_in" },
      { userId: 0, asset: paymentAsset, amount: quotedTotal.negated(), entryType: "main_wallet_purchase_out" },
    ]);
    const durationMonthsSnapshot = quote.durationMonths === null ? null : Number(quote.durationMonths);
    const expiresAt = durationMonthsSnapshot !== null ? addUtcMonths(now,durationMonthsSnapshot) : quote.expirySeconds ? new Date(now.getTime() + Number(quote.expirySeconds) * 1000) : null;
    const packageNameSnapshot = String(quote.displayName||quote.name);
    const [purchaseResult] = await conn.execute<any>(`INSERT INTO mining_customer_packages
      (userId,packageId,packageNameSnapshot,packageVersionId,status,durationMonthsSnapshot,expectedDailyRewardCkiSnapshot,purchasedAt,startsAt,expiresAt,baseThsSnapshot,boostBonusThsSnapshot,priceAmount,priceAsset,paymentAmount,paymentAsset,quoteId,ledgerTransactionId,idempotencyKey,termsSnapshot)
      VALUES (?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      userId, Number(quote.packageId), packageNameSnapshot, Number(quote.packageVersionId), durationMonthsSnapshot, quote.expectedDailyRewardCki === null ? null : String(quote.expectedDailyRewardCki), now, now, expiresAt, String(quote.baseThs), String(quote.boostBonusThs),
      String(quote.destinationAmount), priceAsset, quotedTotal.toString(), paymentAsset, input.quoteId, ledger.id, key, String(quote.termsText),
    ]);
    const purchaseId = Number(purchaseResult.insertId);
    await conn.execute(`UPDATE mining_package_purchase_claims SET firstPurchaseId=? WHERE userId=? AND packageId=? AND firstQuoteId=?`, [purchaseId, userId, Number(quote.packageId), input.quoteId]);
    const starts = new Date(now); starts.setMilliseconds(0);
    const alignedStart = new Date(Math.floor(starts.getTime() / 60_000) * 60_000);
    if (!checkpoint.lastAccruedAt) await conn.execute(`UPDATE mining_checkpoints SET lastAccruedAt=? WHERE userId=?`, [alignedStart, userId]);
    await conn.execute(`UPDATE v5_fx_quotes SET status='EXECUTED' WHERE id=?`, [input.quoteId]);
    const expectedDailyRewardCki = quote.expectedDailyRewardCki === null ? null : String(quote.expectedDailyRewardCki);
    const rewardPostingReady = canStartMiningAccrual({ globalEnabled: config.globalEnabled, expectedDailyRewardCki });
    const result = { purchaseId, packageId: Number(quote.packageId), packageVersionId: Number(quote.packageVersionId), packageName: packageNameSnapshot, status: "active", startsAt: now.toISOString(), entitlementStartedAt: now.toISOString(), expiresAt: expiresAt?.toISOString() || null, rewardPostingEnabled: Boolean(config.globalEnabled), rewardPostingReady, paymentAsset, paymentAmount: quotedTotal.toString(), baseThs: String(quote.baseThs), expectedDailyRewardCki, boostBonusThs: String(quote.boostBonusThs), receiptReference: ledger.referenceCode, mainWalletReference: canonicalReference, disclaimer: "The package entitlement starts at purchase. Configured CKI rewards accrue automatically by eligible time when reward processing is enabled; rewards are internal estimates, not verified pool output or a cash payout." };
    await finishMiningIdempotency(conn, key, result);
    await createMiningNotification(conn, userId, "Mining package entitlement activated", `${quote.name} is active from purchase time. The main-wallet charge and entitlement were recorded. Configured CKI rewards accrue automatically when operations has enabled reward processing. Receipt ${ledger.referenceCode}.`);
    return result;
  }));
  let initialAccrualIntervals = 0;
  let immediateAccrualStatus: "triggered" | "worker_retry" | "blocked_pending_verified_settlement" | "estimate_not_configured";
  if (!purchase.rewardPostingEnabled) {
    immediateAccrualStatus = "blocked_pending_verified_settlement";
  } else if (!purchase.rewardPostingReady) {
    immediateAccrualStatus = "estimate_not_configured";
  } else {
    try {
      initialAccrualIntervals = await runMiningAccrualForCustomer(userId);
      immediateAccrualStatus = "triggered";
    } catch (error) {
      immediateAccrualStatus = "worker_retry";
      console.warn(`[Mining] Immediate post-purchase accrual deferred for user ${userId}; the periodic worker will retry.`, error);
    }
  }
  return { ...purchase, initialAccrualIntervals, immediateAccrualStatus };
}

export async function purchaseCustomerMiningPackage(userId: number, input: { packageVersionId: number; idempotencyKey: string }) {
  if (!Number.isInteger(input.packageVersionId) || input.packageVersionId < 1) throw new MiningError("Choose a valid Mining package");
  const key = requestKey("mining-purchase", userId, input.idempotencyKey);
  const priorResult = async () => withMiningConnection(async conn => {
    const [rows] = await conn.query<any[]>(`SELECT command,resultJson FROM v5_idempotency_keys WHERE userId=? AND keyValue=? LIMIT 1`, [userId,key]);
    const row = rows[0];
    if (row && row.command !== "mining.package.purchase") throw new MiningError("This idempotency key was already used for a different Mining action");
    return row?.resultJson ? JSON.parse(String(row.resultJson)) : null;
  });
  const prior = await priorResult();
  if (prior) return prior;
  try {
    const quote = await createCustomerMiningPurchaseQuote(userId, { packageVersionId: input.packageVersionId });
    return await confirmCustomerMiningPurchase(userId, { quoteId: Number(quote.quoteId), idempotencyKey: input.idempotencyKey, acceptedTerms: true });
  } catch (error) {
    const completed = await priorResult();
    if (completed) return completed;
    throw error;
  }
}

async function activePackageRows(conn: Db, userId: number, at: Date) {
  const [rows] = await conn.query<any[]>(`SELECT cp.id purchaseId,cp.packageId,cp.packageVersionId,cp.acquisitionType,cp.startsAt,cp.expiresAt,cp.endedAt,cp.status,
      cp.baseThsSnapshot,cp.boostBonusThsSnapshot,cp.expectedDailyRewardCkiSnapshot,COALESCE(cp.packageNameSnapshot,v.displayName,p.name) packageName,cp.durationMonthsSnapshot,p.code packageCode,v.version packageVersion,v.boostDurationSeconds
    FROM mining_customer_packages cp JOIN mining_packages p ON p.id=cp.packageId JOIN mining_package_versions v ON v.id=cp.packageVersionId
    WHERE cp.userId=? AND cp.status IN ('active','replaced') AND cp.startsAt<=?
      AND (cp.expiresAt IS NULL OR cp.expiresAt>?) AND (cp.endedAt IS NULL OR cp.endedAt>?) ORDER BY cp.startsAt,cp.id`, [userId, at, at, at]);
  return rows;
}

export async function getCustomerMiningBoostStatus(userId: number) {
  return withMiningConnection(async conn => {
    const now = new Date();
    const config = await loadMiningConfig(conn, now);
    const packages = await activePackageRows(conn, userId, now);
    const eligiblePackage = packages.filter(row => decimal(row.boostBonusThsSnapshot).gt(0)).sort((a,b)=>decimal(a.boostBonusThsSnapshot).cmp(decimal(b.boostBonusThsSnapshot))).at(-1);
    const [activeRows] = await conn.query<any[]>(`SELECT id,startedAt,endsAt,bonusThs,packageVersionId,customerPackageId FROM mining_boost_activations WHERE userId=? AND status='active' AND endsAt>? ORDER BY startedAt DESC LIMIT 1`, [userId, now]);
    const [lastRows] = await conn.query<any[]>(`SELECT id,startedAt,endsAt,status FROM mining_boost_activations WHERE userId=? ORDER BY startedAt DESC,id DESC LIMIT 1`, [userId]);
    const lastStartedAt = lastRows[0] ? new Date(lastRows[0].startedAt) : null;
    const cycle = getBoostCooldownWindow(now, lastStartedAt, config.boostCycleSeconds);
    const account = await conn.query<any[]>(`SELECT accountStatus FROM customer_controls WHERE userId=? LIMIT 1`, [userId]);
    const accountStatus = account[0][0]?.accountStatus || "active";
    const active = activeRows[0];
    const coolingDown = !cycle.ready;
    const ready = config.boostsEnabled && accountStatus === "active" && Boolean(eligiblePackage) && !active && !coolingDown;
    return {
      serverTime: now.toISOString(), cycleStart: cycle.start.toISOString(), eligibleAt: cycle.eligibleAt.toISOString(),
      cycleExpiresAt: cycle.expiresAt.toISOString(), nextEligibleAt: cycle.nextEligibleAt.toISOString(),
      ready, active: Boolean(active), activeBoost: active ? { startedAt: new Date(active.startedAt).toISOString(), endsAt: new Date(active.endsAt).toISOString(), bonusThs: String(active.bonusThs), purchaseId: Number(active.customerPackageId) } : null,
      bonusThsAvailable: eligiblePackage ? String(eligiblePackage.boostBonusThsSnapshot) : "0", packageVersionId: eligiblePackage ? Number(eligiblePackage.packageVersionId) : null,
      durationSeconds: config.boostDurationSeconds,
      cooldownSeconds: config.boostCycleSeconds,
      reason: !config.boostsEnabled ? "Boosts are paused by an administrator" : accountStatus !== "active" ? "Account is restricted" : !eligiblePackage ? "An active package with configured boost capacity is required" : active ? "A boost is currently active" : coolingDown ? `Boost recharges until ${cycle.nextEligibleAt.toISOString()}` : null,
      policy: `A boost lasts ${config.boostDurationSeconds} seconds; each customer's cooldown begins at activation and lasts ${config.boostCycleSeconds} seconds.`,
    };
  });
}

export async function activateCustomerMiningBoost(userId: number, input: { idempotencyKey: string }) {
  const key = requestKey("mining-boost", userId, input.idempotencyKey);
  return withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    const prior = await beginMiningIdempotency(conn, userId, key, "mining.boost.activate");
    if (prior) return prior;
    await ensureMiningCheckpoint(conn, userId);
    await requireActiveMiningAccount(conn, userId);
    const now = new Date();
    const config = await loadMiningConfig(conn, now);
    if (!config.boostsEnabled) throw new MiningError("Boost activation is paused by an administrator");
    const packages = await activePackageRows(conn, userId, now);
    const candidate = packages.filter(row => decimal(row.boostBonusThsSnapshot).gt(0)).sort((a,b)=>decimal(a.boostBonusThsSnapshot).cmp(decimal(b.boostBonusThsSnapshot))).at(-1);
    if (!candidate) throw new MiningError("An active package with boost capacity is required");
    const [activeRows] = await conn.query<any[]>(`SELECT id FROM mining_boost_activations WHERE userId=? AND status='active' AND endsAt>? FOR UPDATE`, [userId, now]);
    if (activeRows.length) throw new MiningError("A boost is already active");
    const [lastRows] = await conn.query<any[]>(`SELECT id,startedAt FROM mining_boost_activations WHERE userId=? ORDER BY startedAt DESC,id DESC LIMIT 1 FOR UPDATE`, [userId]);
    const cycle = getBoostCooldownWindow(now, lastRows[0] ? new Date(lastRows[0].startedAt) : null, config.boostCycleSeconds);
    if (!cycle.ready) throw new MiningError(`Boost is cooling down until ${cycle.nextEligibleAt.toISOString()}`);
    const durationSeconds = config.boostDurationSeconds;
    const endsAt = new Date(now.getTime() + durationSeconds * 1000);
    const cooldownEndsAt = new Date(now.getTime() + config.boostCycleSeconds * 1000);
    const [result] = await conn.execute<any>(`INSERT INTO mining_boost_activations
      (userId,cycleStart,eligibleAt,cycleExpiresAt,startedAt,endsAt,bonusThs,packageVersionId,customerPackageId,status,idempotencyKey)
      VALUES (?,?,?,?,?,?,?,?,?,'active',?)`, [userId, now, now, cooldownEndsAt, now, endsAt, String(candidate.boostBonusThsSnapshot), Number(candidate.packageVersionId), Number(candidate.purchaseId), key]);
    const response = { activationId: Number(result.insertId), status: "active", bonusThs: String(candidate.boostBonusThsSnapshot), startedAt: now.toISOString(), endsAt: endsAt.toISOString(), cycleExpiresAt: cooldownEndsAt.toISOString(), nextEligibleAt: cooldownEndsAt.toISOString(), packageVersionId: Number(candidate.packageVersionId), policy: `The boost runs for ${durationSeconds} seconds; the four-hour customer cooldown starts at activation.` };
    await finishMiningIdempotency(conn, key, response);
    await createMiningNotification(conn, userId, "Mining boost activated", `A ${candidate.boostBonusThsSnapshot} TH/s package boost is active until ${endsAt.toISOString()}. Next availability: ${cooldownEndsAt.toISOString()}.`);
    return response;
  }));
}

export async function getCustomerMiningDashboard(userId: number) {
  return withMiningConnection(async conn => {
    const now = new Date();
    const config = await loadMiningConfig(conn, now);
    const packages = await activePackageRows(conn, userId, now);
    const networkTelemetry = await getMiningNetworkTelemetry(conn, now, config.difficultyBaselineThs);
    const baseThs = packages.reduce((sum, row) => sum.plus(decimal(row.baseThsSnapshot)), new Decimal(0));
    const [boostRows] = await conn.query<any[]>(`SELECT bonusThs,startedAt,endsAt,customerPackageId FROM mining_boost_activations WHERE userId=? AND status='active' AND startedAt<=? AND endsAt>? ORDER BY startedAt DESC LIMIT 1`, [userId, now, now]);
    const activeBoost = boostRows[0];
    const boostThs = activeBoost ? decimal(activeBoost.bonusThs) : new Decimal(0);
    const balances: Record<string,string> = {};
    for (const asset of ["CKI","USD","EUR","GBP","BTC","ETH","USDT"]) {
      const balance = await readWallet(conn, userId, asset);
      balances[asset] = amountString(decimal(balance.available), asset);
    }
    const [earnedRows] = await conn.query<any[]>(`SELECT COALESCE(SUM(tokenAmount),0) todayTokens FROM mining_reward_events WHERE userId=? AND intervalStart>=UTC_DATE()`, [userId]);
    const [accountRows] = await conn.query<any[]>(`SELECT accountStatus FROM customer_controls WHERE userId=? LIMIT 1`, [userId]);
    const accountStatus = accountRows[0]?.accountStatus || "active";
    const intervalStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const intervalSeconds = Math.max(0, Math.min(60, Math.floor((now.getTime() - intervalStart.getTime()) / 1000)));
    const boostIntervalSeconds = activeBoost && intervalSeconds > 0
      ? Math.max(0, Math.min(intervalSeconds, Math.floor((now.getTime() - Math.max(intervalStart.getTime(), new Date(activeBoost.startedAt).getTime())) / 1000), Math.floor((new Date(activeBoost.endsAt).getTime() - intervalStart.getTime()) / 1000)))
      : 0;
    let pendingTokens = new Decimal(0);
    if (config.globalEnabled && accountStatus === "active" && packages.length && intervalSeconds > 0) {
      const segments = packages.flatMap(row => {
        const ownsActiveBoost = Boolean(activeBoost) && Number(activeBoost.customerPackageId) === Number(row.purchaseId);
        const boostedSeconds = ownsActiveBoost ? boostIntervalSeconds : 0;
        return [
          { expectedDailyRewardCki: row.expectedDailyRewardCkiSnapshot, baseThs: String(row.baseThsSnapshot), boostThs: "0", eligibleSeconds: intervalSeconds - boostedSeconds },
          { expectedDailyRewardCki: row.expectedDailyRewardCkiSnapshot, baseThs: String(row.baseThsSnapshot), boostThs: ownsActiveBoost ? String(activeBoost.bonusThs) : "0", eligibleSeconds: boostedSeconds },
        ];
      });
      pendingTokens = decimal(calculatePackageDailyReward(segments));
      const dailyCap = decimal(config.dailyRewardCapTokens);
      if (dailyCap.gt(0)) {
        const accruedToday = decimal(String(earnedRows[0]?.todayTokens || "0"));
        pendingTokens = Decimal.min(pendingTokens, Decimal.max(dailyCap.minus(accruedToday), 0));
      }
    }
    const nextRewardAt = new Date(intervalStart.getTime() + 60_000);
    const [preferenceRows] = await conn.query<any[]>(`SELECT enabled,targetDenomination,minimumThreshold,version,updatedAt FROM mining_conversion_preferences WHERE userId=? LIMIT 1`, [userId]);
    const [latestConversionRows] = await conn.query<any[]>(`SELECT c.id,c.destinationAsset,c.destinationAmount,c.fee,c.createdAt,q.provider,qs.marketObservedAt
      FROM v5_conversions c JOIN v5_fx_quotes q ON q.id=c.quoteId JOIN mining_quote_snapshots qs ON qs.quoteId=q.id
      WHERE c.userId=? AND qs.purpose IN ('manual_swap','auto_conversion') AND c.status='COMPLETED' ORDER BY c.createdAt DESC LIMIT 1`, [userId]);
    const [latestEventRows] = await conn.query<any[]>(`SELECT transactionType,referenceCode,createdAt FROM mining_ledger_transactions WHERE userId=? ORDER BY createdAt DESC LIMIT 6`, [userId]);
    const [pendingRows] = await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_conversion_jobs WHERE userId=? AND status IN ('queued','waiting','retrying')`, [userId]);
    const [activityRows] = await conn.query<any[]>(`SELECT COUNT(*) intervalCount,COALESCE(SUM(eligibleSeconds),0) eligibleSeconds,MAX(intervalEnd) lastRecordedAt
      FROM mining_engine_activity WHERE userId=? AND intervalStart>=UTC_DATE()`, [userId]);
    let packageDailyReward = packages.reduce((sum,row) => row.expectedDailyRewardCkiSnapshot === null ? sum : sum.plus(decimal(row.expectedDailyRewardCkiSnapshot)), new Decimal(0));
    if (decimal(config.dailyRewardCapTokens).gt(0)) packageDailyReward = Decimal.min(packageDailyReward, decimal(config.dailyRewardCapTokens));
    const estimatedDailyTokens = config.globalEnabled && accountStatus === "active" && packageDailyReward.gt(0) ? packageDailyReward : null;
    const pref = preferenceRows[0] ? {
      enabled: Boolean(preferenceRows[0].enabled), targetDenomination: String(preferenceRows[0].targetDenomination),
      minimumThreshold: String(preferenceRows[0].minimumThreshold), version: Number(preferenceRows[0].version), updatedAt: new Date(preferenceRows[0].updatedAt).toISOString(),
    } : { enabled: false, targetDenomination: "USD", minimumThreshold: config.defaultAutoConversionThreshold, version: 0, updatedAt: null };
    const engineRunning = accountStatus === "active" && packages.length > 0;
    const status = accountStatus !== "active" ? "Account restricted" : engineRunning
      ? !config.globalEnabled ? "Mining active — reward processing paused by operations" : estimatedDailyTokens ? "Mining active — reward processing enabled" : "Mining active — reward configuration pending"
      : "No active hash-power package";
    return {
      serverTime: now.toISOString(), miningStatus: status, simulationOnly: true, networkTelemetry, payoutStatus: "Disabled — simulated balances are not withdrawable",
      engineRunning, rewardPostingEnabled: config.globalEnabled,
      engineActivity: { intervalCount: Number(activityRows[0]?.intervalCount || 0), eligibleSeconds: String(activityRows[0]?.eligibleSeconds || "0"), lastRecordedAt: activityRows[0]?.lastRecordedAt ? new Date(activityRows[0].lastRecordedAt).toISOString() : null },
      baseThs: baseThs.toString(), boostThs: boostThs.toString(), activeThs: baseThs.plus(boostThs).toString(),
      calculationModel: config.calculationModel,
      tokenName: config.tokenName, tokenSymbol: config.tokenSymbol,
      usdPerToken: decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(),
      tokenBalance: balances.CKI, balances, todayTokens: String(earnedRows[0]?.todayTokens || "0"),
      minSwapTokens: config.minSwapTokens, maxSwapTokens: config.maxSwapTokens,
      pendingTokens: pendingTokens.toDecimalPlaces(tokenScale, Decimal.ROUND_DOWN).toFixed(tokenScale), nextRewardAt: nextRewardAt.toISOString(),
      rewardTokensPerThsHour: config.rewardTokensPerThsHour,
      estimatedDailyTokens: estimatedDailyTokens ? estimatedDailyTokens.toDecimalPlaces(tokenScale, Decimal.ROUND_DOWN).toFixed(tokenScale) : null,
      estimateAssumption: estimatedDailyTokens ? "Sum of each active purchased package's stored 24-hour CKI estimate, capped by the versioned daily limit; simulated estimate only, not pool-verified output or a guaranteed return." : "A positive package-specific daily CKI estimate and enabled simulated processing are required before a daily estimate is available.",
      economicsVersion: config.version, tokenUnitsPerUsd: config.tokenUnitsPerUsd,
      tokenConversionReference: `1 ${config.tokenSymbol} = $${decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(12).toString()} USD (admin-configured internal reference; not a market price or redemption promise)`,
      boost: { active: Boolean(activeBoost), startedAt: activeBoost ? new Date(activeBoost.startedAt).toISOString() : null, endsAt: activeBoost ? new Date(activeBoost.endsAt).toISOString() : null, bonusThs: boostThs.toString() },
      packages: packages.map(row => ({ purchaseId: Number(row.purchaseId), packageName: row.packageName, code: row.packageCode, packageVersion: Number(row.packageVersion), durationMonths:row.durationMonthsSnapshot===null?null:Number(row.durationMonthsSnapshot), acquisitionType: String(row.acquisitionType || "purchase"), baseThs: String(row.baseThsSnapshot), expectedDailyRewardCki: row.expectedDailyRewardCkiSnapshot===null?null:String(row.expectedDailyRewardCkiSnapshot), boostBonusThs: String(row.boostBonusThsSnapshot), startsAt: new Date(row.startsAt).toISOString(), expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null, status: row.status })),
      conversionPreference: pref, pendingConversionJobs: Number(pendingRows[0]?.total || 0), lastConversion: latestConversionRows[0] ? { id: Number(latestConversionRows[0].id), destinationAsset: latestConversionRows[0].destinationAsset, destinationAmount: latestConversionRows[0].destinationAmount, fee: latestConversionRows[0].fee, provider: latestConversionRows[0].provider, marketObservedAt: new Date(latestConversionRows[0].marketObservedAt).toISOString(), createdAt: new Date(latestConversionRows[0].createdAt).toISOString() } : null,
      recentEvents: latestEventRows.map(row => ({ type: row.transactionType, reference: row.referenceCode, createdAt: new Date(row.createdAt).toISOString() })),
    };
  });
}

export async function updateCustomerMiningConversionPreference(userId: number, input: { enabled: boolean; targetDenomination: string; minimumThreshold: string }) {
  const target = assertMainWalletAsset(input.targetDenomination);
  const threshold = decimal(input.minimumThreshold);
  if (threshold.isNegative() || threshold.gt("1000000000000")) throw new MiningError("Minimum conversion threshold is outside the supported range");
  if (!floorAmount(threshold, tokenScale).eq(threshold)) throw new MiningError("The token threshold supports up to eight decimal places");
  return withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    const checkpoint = await ensureMiningCheckpoint(conn, userId);
    void checkpoint;
    const [rows] = await conn.query<any[]>(`SELECT version FROM mining_conversion_preferences WHERE userId=? FOR UPDATE`, [userId]);
    const version = Number(rows[0]?.version || 0) + 1;
    const now = new Date();
    await conn.execute(`INSERT INTO mining_conversion_preferences (userId,enabled,targetDenomination,minimumThreshold,version,updatedAt)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),targetDenomination=VALUES(targetDenomination),minimumThreshold=VALUES(minimumThreshold),version=VALUES(version),updatedAt=VALUES(updatedAt)`, [userId, input.enabled ? 1 : 0, target, threshold.toString(), version, now]);
    await conn.execute(`INSERT INTO mining_conversion_preference_versions (userId,version,enabled,targetDenomination,minimumThreshold,effectiveAt) VALUES (?,?,?,?,?,?)`, [userId, version, input.enabled ? 1 : 0, target, threshold.toString(), now]);
    return { enabled: input.enabled, targetDenomination: target, minimumThreshold: threshold.toString(), version, effectiveAt: now.toISOString(), note: "This preference applies to reward events from its effective time forward. Existing token balances require a separately confirmed manual swap." };
  }));
}

export async function createCustomerMiningSwapQuote(userId: number, input: { tokenAmount: string; targetAsset: string }) {
  const targetAsset = assertMainWalletAsset(input.targetAsset);
  const tokenAmount = ensureExactPrecision(input.tokenAmount, "CKI", "Token amount");
  if (!tokenAmount.gt(0)) throw new MiningError("Swap the full available CKI balance; a positive amount is required");
  return withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    await requireActiveMiningAccount(conn, userId);
    const config = await loadMiningConfig(conn);
    const targetScale = await getMainWalletScale(conn, targetAsset);
    const rates = await quoteRatesDetails(conn, "CKI", targetAsset, config);
    const converted = calculateMiningConversion({ tokenAmount: tokenAmount.toString(), tokenUnitsPerUsd: config.tokenUnitsPerUsd, usdPerTargetUnit: rates.targetUsdRate.toString(), feeBps: config.swapFeeBps, targetScale });
    const balance = await readWallet(conn, userId, "CKI");
    if (decimal(balance.available).lt(tokenAmount)) throw new MiningError("Insufficient available CKI balance");
    const quote = await insertFxQuote(conn, {
      userId, purpose: "manual_swap", sourceAsset: "CKI", targetAsset, sourceAmount: amountString(tokenAmount, "CKI"),
      targetAmount: converted.netAmount, fee: converted.feeAmount, sourceUsdRate: rates.sourceUsdRate, targetUsdRate: rates.targetUsdRate,
      tokenUnitsPerUsd: config.tokenUnitsPerUsd, marketProvider: rates.marketProvider, marketObservedAt: rates.marketObservedAt,
      targetScale, feeBps: config.swapFeeBps, quoteTtlSeconds: config.quoteTtlSeconds, configVersion: config.version,
      details: { grossAmount: converted.grossAmount, netAmount: converted.netAmount, feeAsset: targetAsset, rounding: "down" },
    });
    return { ...quote, sourceAsset: "CKI", tokenName: config.tokenName, tokenSymbol: config.tokenSymbol, usdPerToken: decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(), sourceAmount: amountString(tokenAmount, "CKI"), targetAsset, grossAmount: converted.grossAmount, fee: converted.feeAmount, feeAsset: targetAsset, destinationAmount: converted.netAmount, provider: rates.marketProvider, marketObservedAt: rates.marketObservedAt.toISOString(), expiresAt: quote.validUntil.toISOString(), rate: converted.rate, roundingMode: "down", configVersion: config.version, disclaimer: "Indicative conversion quote. On confirmation, the net converted amount is credited to the selected main-wallet balance; external payouts remain manual." };
  }));
}

async function executeTokenConversion(conn: Db, userId: number, input: {
  sourceAmount: Decimal; targetAsset: string; grossAmount: string; netAmount: string; feeAmount: string; feeBps: number;
  quoteId: number; provider: string; marketObservedAt: Date; idempotencyKey: string; transactionType: "manual_swap" | "auto_conversion";
  configVersion: number; preferenceVersion?: number; tokenName: string; tokenSymbol: string; tokenUnitsPerUsd: string;
}) {
  const targetAsset = assertMainWalletAsset(input.targetAsset);
  const sourceAmount = input.sourceAmount;
  const gross = decimal(input.grossAmount); const net = decimal(input.netAmount); const fee = decimal(input.feeAmount);
  if (!sourceAmount.gt(0) || !net.gt(0) || gross.minus(net).minus(fee).abs().gt("0.000000000000000001")) throw new MiningError("The conversion journal does not balance");
  const canonicalScale = await getMainWalletScale(conn, targetAsset);
  if (!floorAmount(net, canonicalScale).eq(net)) throw new MiningError(`The converted ${targetAsset} amount exceeds the main-wallet precision`);
  const canonicalReference = `mining-conversion:${input.quoteId}`;
  const canonicalCredit = await creditMainWallet(conn, userId, targetAsset, net, canonicalReference, "mining_conversion_credit", true);
  const transaction = await createMiningLedgerTransaction(conn, {
    userId, actorUserId: userId, transactionType: input.transactionType, idempotencyKey: input.idempotencyKey,
    metadata: { quoteId: input.quoteId, sourceAsset: "CKI", tokenName: input.tokenName, tokenSymbol: input.tokenSymbol, tokenUnitsPerUsd: input.tokenUnitsPerUsd, usdPerToken: decimal(1).div(input.tokenUnitsPerUsd).toSignificantDigits(18).toString(), sourceAmount: sourceAmount.toString(), targetAsset, grossAmount: gross.toString(), destinationAmount: net.toString(), fee: fee.toString(), feeAsset: targetAsset, provider: input.provider, marketObservedAt: input.marketObservedAt.toISOString(), configVersion: input.configVersion, preferenceVersion: input.preferenceVersion, canonicalMainWalletReference: canonicalReference, canonicalWalletScale: canonicalCredit.scale, withdrawableMainWalletCredit: true },
  });
  const entries = [
    { userId, asset: "CKI", amount: sourceAmount.negated(), entryType: "mining_swap_token_debit" },
    { userId: 0, asset: "CKI", amount: sourceAmount, entryType: "mining_swap_token_clearing" },
    { userId, asset: targetAsset, amount: net, entryType: "mining_swap_credit" },
    { userId: 0, asset: targetAsset, amount: gross.negated(), entryType: "mining_swap_clearing" },
  ];
  if (fee.gt(0)) entries.push({ userId: 0, asset: targetAsset, amount: fee, entryType: "mining_swap_fee" });
  await postMiningLedgerEntries(conn, transaction, entries);
  const [plan] = await conn.execute<any>(`INSERT INTO v5_funding_plans (userId,destinationAsset,destinationAmount,sourcesJson,status) VALUES (?,?,?,?, 'EXECUTED')`, [userId, targetAsset, net.toString(), safeJson([{ asset: "CKI", amount: sourceAmount.toString() }, { asset: targetAsset, amount: net.toString(), mainWalletReference: canonicalReference, mainWalletScale: canonicalCredit.scale }])]);
  const [conversion] = await conn.execute<any>(`INSERT INTO v5_conversions (userId,quoteId,fundingPlanId,sourceAsset,destinationAsset,sourceAmount,destinationAmount,executionRate,fee,status)
    VALUES (?,?,?,?,?,?,?,?,?,'COMPLETED')`, [userId, input.quoteId, Number(plan.insertId), "CKI", targetAsset, sourceAmount.toString(), net.toString(), net.div(sourceAmount).toSignificantDigits(24).toString(), fee.toString()]);
  await conn.execute(`UPDATE v5_fx_quotes SET status='EXECUTED' WHERE id=?`, [input.quoteId]);
  return { conversionId: Number(conversion.insertId), transactionId: transaction.id, receiptReference: transaction.referenceCode, mainWalletReference: canonicalReference, sourceAsset: "CKI", sourceAmount: sourceAmount.toString(), destinationAsset: targetAsset, destinationAmount: canonicalCredit.amount, fee: fee.toFixed(canonicalCredit.scale), feeAsset: targetAsset };
}

export async function confirmCustomerMiningSwap(userId: number, input: { quoteId: number; idempotencyKey: string }) {
  const key = requestKey("mining-swap", userId, input.idempotencyKey);
  return withMiningConnection(async conn => inMiningTransaction(conn, async () => {
    const prior = await beginMiningIdempotency(conn, userId, key, "mining.swap.confirm");
    if (prior) return prior;
    await ensureMiningCheckpoint(conn, userId);
    await requireActiveMiningAccount(conn, userId);
    const config = await loadMiningConfig(conn);
    const [rows] = await conn.query<any[]>(`SELECT q.*,s.* FROM v5_fx_quotes q JOIN mining_quote_snapshots s ON s.quoteId=q.id
      WHERE q.id=? AND s.userId=? AND s.purpose='manual_swap' FOR UPDATE`, [input.quoteId, userId]);
    const quote = rows[0];
    if (!quote || quote.status !== "QUOTED" || new Date(quote.validUntil).getTime() <= Date.now()) throw new MiningError("This swap quote has expired; request a fresh quote");
    let details: any = {};
    try { details = JSON.parse(String(quote.detailsJson || "{}")); } catch { throw new MiningError("The stored quote details are invalid; request a fresh quote"); }
    if (Number(details.configVersion) !== config.version) throw new MiningError("Mining settings changed after this quote; request a fresh quote");
    const sourceAmount = ensureExactPrecision(String(quote.sourceAmount), "CKI", "Token amount");
    const targetAsset = assertMainWalletAsset(String(quote.toAsset));
    const targetScale = await getMainWalletScale(conn, targetAsset);
    const latest = await quoteRatesDetails(conn, "CKI", targetAsset, config);
    const refreshed = calculateMiningConversion({ tokenAmount: sourceAmount.toString(), tokenUnitsPerUsd: config.tokenUnitsPerUsd, usdPerTargetUnit: latest.targetUsdRate.toString(), feeBps: Number(quote.feeBps), targetScale });
    const quotedAmount = decimal(String(quote.destinationAmount));
    const moveBps = decimal(refreshed.netAmount).minus(quotedAmount).abs().div(quotedAmount).times(10_000);
    if (moveBps.gt(config.maxRateDeviationBps)) throw new MiningError("The market quote moved outside the allowed tolerance; request a fresh quote");
    const balance = await readWallet(conn, userId, "CKI");
    if (decimal(balance.available).lt(sourceAmount)) throw new MiningError("Insufficient available CKI balance");
    const result = await executeTokenConversion(conn, userId, {
      sourceAmount, targetAsset, grossAmount: String(details.grossAmount), netAmount: String(quote.destinationAmount), feeAmount: String(quote.fee),
      feeBps: Number(quote.feeBps), quoteId: input.quoteId, provider: String(quote.marketProvider), marketObservedAt: new Date(quote.marketObservedAt),
      idempotencyKey: key, transactionType: "manual_swap", configVersion: config.version,
      tokenName: config.tokenName, tokenSymbol: config.tokenSymbol, tokenUnitsPerUsd: config.tokenUnitsPerUsd,
    });
    await finishMiningIdempotency(conn, key, result);
    await createMiningNotification(conn, userId, "Mining swap completed", `${result.sourceAmount} CKI was converted to ${result.destinationAmount} ${targetAsset} and credited to the main wallet. Reference ${result.receiptReference}.`);
    return result;
  }));
}

function normalizeMiningHistoryDetails(value: any): any {
  if (value === "TOKEN") return "CKI";
  if (value === "NextGen Token") return "CoinKi";
  if (Array.isArray(value)) return value.map(normalizeMiningHistoryDetails);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeMiningHistoryDetails(item)]));
  return value;
}

export async function listCustomerMiningTransactions(userId: number) {
  return withMiningConnection(async conn => {
    const [ledgerRows] = await conn.query<any[]>(`SELECT id,transactionType,status,referenceCode,reversalOfId,reason,metadataJson,createdAt FROM mining_ledger_transactions WHERE userId=? ORDER BY createdAt DESC LIMIT 30`, [userId]);
    const [boostRows] = await conn.query<any[]>(`SELECT id,bonusThs,startedAt,endsAt,status,cycleStart FROM mining_boost_activations WHERE userId=? ORDER BY createdAt DESC LIMIT 30`, [userId]);
    const events = [
      ...ledgerRows.map(row => ({ id: `ledger-${row.id}`, type: row.transactionType, status: row.status, reference: row.referenceCode, reversalOfId: row.reversalOfId ? Number(row.reversalOfId) : null, reason: row.reason || null, details: (() => { try { return normalizeMiningHistoryDetails(JSON.parse(String(row.metadataJson || "{}"))); } catch { return {}; } })(), createdAt: new Date(row.createdAt).toISOString() })),
      ...boostRows.map(row => ({ id: `boost-${row.id}`, type: "boost_activation", status: row.status === "active" && new Date(row.endsAt).getTime() <= Date.now() ? "expired" : row.status, reference: `BOOST-${row.id}`, details: { bonusThs: String(row.bonusThs), startedAt: new Date(row.startedAt).toISOString(), endsAt: new Date(row.endsAt).toISOString(), cycleStart: new Date(row.cycleStart).toISOString() }, createdAt: new Date(row.startedAt).toISOString() })),
    ];
    return events.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,30);
  });
}

function minuteFloor(date: Date) { return new Date(Math.floor(date.getTime() / 60_000) * 60_000); }
function asDate(value: unknown) { return value instanceof Date ? value : new Date(String(value)); }
function within(point: Date, start: Date, end: Date) { return point.getTime() > start.getTime() && point.getTime() < end.getTime(); }

async function preferenceAt(conn: Db, userId: number, at: Date, fallbackThreshold: string) {
  const [rows] = await conn.query<any[]>(`SELECT version,enabled,targetDenomination,minimumThreshold,effectiveAt FROM mining_conversion_preference_versions WHERE userId=? AND effectiveAt<=? ORDER BY version DESC LIMIT 1`, [userId, at]);
  if (!rows[0]) return { version: 0, enabled: false, targetDenomination: await getSavedSwapCurrency(conn,userId), minimumThreshold: fallbackThreshold };
  return { version: Number(rows[0].version), enabled: Boolean(rows[0].enabled), targetDenomination: String(rows[0].targetDenomination), minimumThreshold: String(rows[0].minimumThreshold) };
}

async function calculateInterval(conn: Db, userId: number, start: Date, end: Date, accountActive: boolean) {
  const [packages] = await conn.query<any[]>(`SELECT cp.id,cp.packageId,cp.packageVersionId,cp.packageNameSnapshot,cp.durationMonthsSnapshot,cp.priceAmount,cp.priceAsset,
      cp.expectedDailyRewardCkiSnapshot,cp.startsAt,cp.expiresAt,cp.endedAt,cp.status,cp.baseThsSnapshot,cp.boostBonusThsSnapshot,p.code,v.version
    FROM mining_customer_packages cp JOIN mining_packages p ON p.id=cp.packageId JOIN mining_package_versions v ON v.id=cp.packageVersionId
    WHERE cp.userId=? AND cp.status IN ('active','replaced') AND cp.startsAt<? AND (cp.expiresAt IS NULL OR cp.expiresAt>?) AND (cp.endedAt IS NULL OR cp.endedAt>?)`, [userId, end, start, start]);
  const [boosts] = await conn.query<any[]>(`SELECT id,startedAt,endsAt,bonusThs,packageVersionId,customerPackageId,status FROM mining_boost_activations WHERE userId=? AND status='active' AND startedAt<? AND endsAt>?`, [userId, end, start]);
  const [configRows] = await conn.query<any[]>(`SELECT effectiveAt FROM mining_economics_versions WHERE effectiveAt>? AND effectiveAt<? ORDER BY effectiveAt`, [start, end]);
  const boundaries = [start.getTime(), end.getTime()];
  for (const row of packages) for (const value of [row.startsAt,row.expiresAt,row.endedAt]) if (value && within(asDate(value),start,end)) boundaries.push(asDate(value).getTime());
  for (const row of boosts) for (const value of [row.startedAt,row.endsAt]) if (value && within(asDate(value),start,end)) boundaries.push(asDate(value).getTime());
  for (const row of configRows) boundaries.push(asDate(row.effectiveAt).getTime());
  const sorted = [...new Set(boundaries)].sort((a,b)=>a-b);
  const rewardSegments: any[] = [];
  const engineActivities: any[] = [];
  let weightedBase = new Decimal(0); let weightedBoost = new Decimal(0); let weightedDailyReward = new Decimal(0); let creditedSeconds = 0;
  let rawTokenAmount = new Decimal(0); let rawUsdAmount = new Decimal(0);
  const allocationTotals = new Map<number,any>();
  for (let i=0;i<sorted.length-1;i++) {
    const from = new Date(sorted[i]); const to = new Date(sorted[i+1]);
    const seconds = Math.max(0, (to.getTime()-from.getTime())/1000);
    if (!seconds) continue;
    const middle = new Date(from.getTime() + Math.floor((to.getTime()-from.getTime())/2));
    const config = await loadMiningConfig(conn, middle);
    if (!accountActive) continue;
    const activePackages = packages.filter(row => row.status === "active" || row.status === "replaced").filter(row => asDate(row.startsAt).getTime() <= middle.getTime() && (!row.expiresAt || asDate(row.expiresAt).getTime() > middle.getTime()) && (!row.endedAt || asDate(row.endedAt).getTime() > middle.getTime()));
    const base = activePackages.reduce((sum,row)=>sum.plus(decimal(row.baseThsSnapshot)),new Decimal(0));
    const activeBoost = boosts.filter(row=>Number(row.customerPackageId)>0&&asDate(row.startedAt).getTime()<=middle.getTime()&&asDate(row.endsAt).getTime()>middle.getTime()).sort((a,b)=>decimal(a.bonusThs).cmp(decimal(b.bonusThs))).at(-1);
    const boost = activeBoost ? decimal(activeBoost.bonusThs) : new Decimal(0);
    const eligibleSeconds = decimal(seconds).toDecimalPlaces(3, Decimal.ROUND_DOWN);
    if (eligibleSeconds.gt(0)) {
      for (const row of activePackages) {
        const packageBoost = activeBoost && Number(activeBoost.customerPackageId) === Number(row.id) ? decimal(activeBoost.bonusThs) : new Decimal(0);
        engineActivities.push({
          customerPackageId: Number(row.id), packageId: Number(row.packageId), packageVersionId: Number(row.packageVersionId),
          intervalStart: from, intervalEnd: to, baseThsSnapshot: String(row.baseThsSnapshot), boostThsSnapshot: packageBoost.toString(),
          eligibleSeconds: eligibleSeconds.toFixed(3), economicsVersion: config.version,
        });
      }
    }
    if (!config.globalEnabled) continue;
    const packageRewards = activePackages.map(row=>{
      const packageBase=decimal(row.baseThsSnapshot);
      const packageBoost=activeBoost&&Number(activeBoost.customerPackageId)===Number(row.id)?decimal(activeBoost.bonusThs):new Decimal(0);
      const daily=row.expectedDailyRewardCkiSnapshot===null?null:String(row.expectedDailyRewardCkiSnapshot);
      const amount=decimal(calculatePackageDailyReward([{expectedDailyRewardCki:daily,baseThs:packageBase.toString(),boostThs:packageBoost.toString(),eligibleSeconds:seconds}]));
      const effectiveDaily=daily===null?new Decimal(0):decimal(daily).times(packageBase.plus(packageBoost).div(packageBase));
      return {purchaseId:Number(row.id),packageId:Number(row.packageId),packageVersionId:Number(row.packageVersionId),packageVersion:Number(row.version),packageCode:String(row.code),packageName:String(row.packageNameSnapshot||row.code),priceAmount:String(row.priceAmount),priceAsset:String(row.priceAsset),durationMonthsSnapshot:row.durationMonthsSnapshot===null?null:Number(row.durationMonthsSnapshot),baseThs:packageBase.toString(),expectedDailyRewardCkiSnapshot:daily,boostThs:packageBoost.toString(),eligibleSeconds:seconds,estimatedRewardCki:amount.toString(),effectiveDailyRewardCki:effectiveDaily.toString()};
    });
    const segmentTokens=packageRewards.reduce((sum,row)=>sum.plus(decimal(row.estimatedRewardCki)),new Decimal(0));
    const segmentDaily=packageRewards.reduce((sum,row)=>sum.plus(decimal(row.effectiveDailyRewardCki)),new Decimal(0));
    const segmentUsd=segmentTokens.div(config.tokenUnitsPerUsd);
    rewardSegments.push({start:from.toISOString(),end:to.toISOString(),configVersion:config.version,calculationModel:config.calculationModel,tokenUnitsPerUsd:config.tokenUnitsPerUsd,usdPerToken:decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(),baseThs:base.toString(),boostThs:boost.toString(),expectedDailyRewardCki:segmentDaily.toString(),tokenAmount:segmentTokens.toString(),rewardAmountUsd:segmentUsd.toString(),packages:packageRewards});
    for(const item of packageRewards){
      const prior=allocationTotals.get(item.purchaseId)||{purchaseId:item.purchaseId,packageId:item.packageId,packageVersionId:item.packageVersionId,expectedDailyRewardCkiSnapshot:item.expectedDailyRewardCkiSnapshot,tokenAmount:new Decimal(0),usdAmount:new Decimal(0),segments:[]};
      prior.tokenAmount=prior.tokenAmount.plus(decimal(item.estimatedRewardCki));
      prior.usdAmount=prior.usdAmount.plus(decimal(item.estimatedRewardCki).div(config.tokenUnitsPerUsd));
      prior.segments.push({start:from.toISOString(),end:to.toISOString(),eligibleSeconds:seconds,expectedDailyRewardCkiSnapshot:item.expectedDailyRewardCkiSnapshot,baseThs:item.baseThs,boostThs:item.boostThs,estimatedRewardCki:item.estimatedRewardCki,configVersion:config.version,calculationModel:config.calculationModel,tokenUnitsPerUsd:config.tokenUnitsPerUsd,usdPerToken:decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString()});
      allocationTotals.set(item.purchaseId,prior);
    }
    weightedBase = weightedBase.plus(base.times(seconds)); weightedBoost = weightedBoost.plus(boost.times(seconds)); creditedSeconds += seconds;
    weightedDailyReward = weightedDailyReward.plus(segmentDaily.times(seconds)); rawTokenAmount=rawTokenAmount.plus(segmentTokens); rawUsdAmount=rawUsdAmount.plus(segmentUsd);
  }
  let tokenAmount = rawTokenAmount;
  const config = await loadMiningConfig(conn, end);
  if (accountActive && config.globalEnabled && decimal(config.dailyRewardCapTokens).gt(0)) {
    const [dailyRows] = await conn.query<any[]>(`SELECT COALESCE(SUM(tokenAmount),0) total FROM mining_reward_events WHERE userId=? AND intervalStart>=UTC_DATE()`, [userId]);
    const remaining = decimal(config.dailyRewardCapTokens).minus(decimal(dailyRows[0]?.total || 0));
    tokenAmount = Decimal.min(tokenAmount, Decimal.max(new Decimal(0), remaining));
  }
  const postedTokenAmount=tokenAmount.toDecimalPlaces(tokenScale,Decimal.ROUND_DOWN);
  const rewardAmountUsd=rawTokenAmount.gt(0)?rawUsdAmount.times(postedTokenAmount.div(rawTokenAmount)).toDecimalPlaces(18,Decimal.ROUND_DOWN):new Decimal(0);
  let allocationRemaining=postedTokenAmount;
  const allocationRows=[...allocationTotals.values()].filter(row=>row.tokenAmount.gt(0)).sort((a,b)=>a.purchaseId-b.purchaseId);
  const allocations=allocationRows.map((row,index)=>{
    const scaled=index===allocationRows.length-1?allocationRemaining:row.tokenAmount.times(postedTokenAmount).div(rawTokenAmount).toDecimalPlaces(tokenScale,Decimal.ROUND_DOWN);
    allocationRemaining=allocationRemaining.minus(scaled);
    const usd=row.usdAmount.times(postedTokenAmount).div(rawTokenAmount).toDecimalPlaces(18,Decimal.ROUND_DOWN);
    return {purchaseId:row.purchaseId,packageId:row.packageId,packageVersionId:row.packageVersionId,expectedDailyRewardCkiSnapshot:row.expectedDailyRewardCkiSnapshot,rewardAmountCki:scaled.toFixed(tokenScale),tokenUnitsPerUsdSnapshot:row.usdAmount.gt(0)?row.tokenAmount.div(row.usdAmount).toDecimalPlaces(18,Decimal.ROUND_DOWN).toString():config.tokenUnitsPerUsd,rewardAmountUsdSnapshot:usd.toFixed(18),calculationSegments:row.segments};
  });
  return {
    tokenAmount: postedTokenAmount,
    rewardAmountUsd,
    engineActivities,
    baseThs: creditedSeconds ? weightedBase.div(creditedSeconds) : new Decimal(0),
    boostThs: creditedSeconds ? weightedBoost.div(creditedSeconds) : new Decimal(0),
    expectedDailyRewardCki: creditedSeconds ? weightedDailyReward.div(creditedSeconds) : new Decimal(0),
    segments: rewardSegments,
    allocations,
    configVersion: config.version,
    calculationModel: config.calculationModel,
  };
}

async function accrueOneUser(conn: Db, userId: number, limit = 30) {
  let processed = 0;
  const [controlRows] = await conn.query<any[]>(`SELECT accountStatus FROM customer_controls WHERE userId=? LIMIT 1`, [userId]);
  const accountActive = (controlRows[0]?.accountStatus || "active") === "active";
  for (let i=0;i<limit;i++) {
    await conn.beginTransaction();
    try {
      const checkpoint = await ensureMiningCheckpoint(conn, userId);
      const start = asDate(checkpoint.lastAccruedAt);
      const cutoff = minuteFloor(new Date());
      if (start.getTime() >= cutoff.getTime()) { await conn.commit(); break; }
      const end = new Date(Math.min(start.getTime()+60_000,cutoff.getTime()));
      if (end.getTime() <= start.getTime()) { await conn.commit(); break; }
      const result = await calculateInterval(conn,userId,start,end,accountActive);
      for (const activity of result.engineActivities) {
        await conn.execute(`INSERT IGNORE INTO mining_engine_activity
          (userId,customerPackageId,packageId,packageVersionId,intervalStart,intervalEnd,baseThsSnapshot,boostThsSnapshot,eligibleSeconds,economicsVersion)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [userId,activity.customerPackageId,activity.packageId,activity.packageVersionId,activity.intervalStart,activity.intervalEnd,
            activity.baseThsSnapshot,activity.boostThsSnapshot,activity.eligibleSeconds,activity.economicsVersion]);
      }
      if (result.tokenAmount.gt(0)) {
        const intervalConfig = await loadMiningConfig(conn,end);
        const rewardKey = requestKey("mining-reward",userId,`${start.toISOString()}:${end.toISOString()}`);
        const transaction = await createMiningLedgerTransaction(conn, {
          userId, actorUserId: null, transactionType: "reward", idempotencyKey: rewardKey,
          metadata: { intervalStart:start.toISOString(),intervalEnd:end.toISOString(),baseThs:result.baseThs.toString(),boostThs:result.boostThs.toString(),expectedDailyRewardCki:result.expectedDailyRewardCki.toString(),rewardAmountUsd:result.rewardAmountUsd.toFixed(18),legacyRewardTokensPerThsHour:intervalConfig.rewardTokensPerThsHour,calculationModel:result.calculationModel,configVersion:result.configVersion,tokenName:intervalConfig.tokenName,tokenSymbol:intervalConfig.tokenSymbol,tokenUnitsPerUsd:intervalConfig.tokenUnitsPerUsd,usdPerToken:decimal(1).div(intervalConfig.tokenUnitsPerUsd).toSignificantDigits(18).toString(),segments:result.segments,allocations:result.allocations,tokenAmount:result.tokenAmount.toFixed(tokenScale),model:"simulated package-daily reward estimate; no external pool" },
        });
        await postMiningLedgerEntries(conn,transaction,[
          { userId,asset:"CKI",amount:result.tokenAmount,entryType:"mining_reward_credit" },
          { userId:0,asset:"CKI",amount:result.tokenAmount.negated(),entryType:"mining_reward_issuance" },
        ]);
        const [eventResult] = await conn.execute<any>(`INSERT INTO mining_reward_events
          (userId,intervalStart,intervalEnd,baseThs,boostThs,rewardTokensPerThsHour,tokenAmount,rewardAmountUsd,expectedDailyRewardCki,configVersion,calculationModel,packageSnapshotJson,idempotencyKey,ledgerTransactionId)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [userId,start,end,result.baseThs.toString(),result.boostThs.toString(),intervalConfig.rewardTokensPerThsHour,result.tokenAmount.toFixed(tokenScale),result.rewardAmountUsd.toFixed(18),result.expectedDailyRewardCki.toDecimalPlaces(18,Decimal.ROUND_DOWN).toFixed(18),result.configVersion,result.calculationModel,safeJson(result.segments),rewardKey,transaction.id]);
        const rewardEventId = Number(eventResult.insertId);
        for(const allocation of result.allocations){
          await conn.execute(`INSERT INTO mining_reward_package_allocations
            (rewardEventId,userId,customerPackageId,packageId,packageVersionId,intervalStart,intervalEnd,expectedDailyRewardCkiSnapshot,rewardAmountCki,tokenUnitsPerUsdSnapshot,rewardAmountUsdSnapshot,calculationModel,calculationSegmentsJson)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[rewardEventId,userId,allocation.purchaseId,allocation.packageId,allocation.packageVersionId,start,end,allocation.expectedDailyRewardCkiSnapshot,allocation.rewardAmountCki,allocation.tokenUnitsPerUsdSnapshot,allocation.rewardAmountUsdSnapshot,result.calculationModel,safeJson(allocation.calculationSegments)]);
        }
        const preference = await preferenceAt(conn,userId,end,intervalConfig.defaultAutoConversionThreshold);
        if (preference.enabled) {
          const balanceAfterCredit = decimal((await readWallet(conn,userId,"CKI")).available);
          const effectiveThreshold = Decimal.max(decimal(preference.minimumThreshold),decimal(intervalConfig.minSwapTokens));
          const status = balanceAfterCredit.gte(effectiveThreshold) ? "queued" : "waiting";
          await conn.execute(`INSERT INTO mining_conversion_jobs (rewardEventId,userId,targetDenomination,tokenAmount,minimumThreshold,preferenceVersion,status,availableAt)
            VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [rewardEventId,userId,preference.targetDenomination,result.tokenAmount.toFixed(tokenScale),preference.minimumThreshold,preference.version,status]);
          if (status === "queued") await conn.execute(`UPDATE mining_conversion_jobs SET status='queued',availableAt=UTC_TIMESTAMP(3) WHERE userId=? AND status='waiting'`, [userId]);
        }
      }
      await conn.execute(`UPDATE mining_checkpoints SET lastAccruedAt=?,workerVersion='1',updatedAt=UTC_TIMESTAMP(3) WHERE userId=?`,[end,userId]);
      await conn.commit(); processed++;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  }
  return processed;
}

async function processConversionJob(conn: Db, jobId: number) {
  await conn.beginTransaction();
  try {
    const [jobs] = await conn.query<any[]>(`SELECT * FROM mining_conversion_jobs WHERE id=? AND status IN ('queued','retrying') AND availableAt<=UTC_TIMESTAMP(3) FOR UPDATE`, [jobId]);
    const job = jobs[0];
    if (!job) { await conn.commit(); return "skipped"; }
    const userId = Number(job.userId);
    await ensureMiningCheckpoint(conn,userId);
    const config = await loadMiningConfig(conn);
    if (!config.globalEnabled) {
      await conn.execute(`UPDATE mining_conversion_jobs SET status='retrying',attempts=attempts+1,lastError='Mining is paused',availableAt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) WHERE id=?`,[jobId]);
      await conn.commit(); return "retrying";
    }
    const balance = await readWallet(conn,userId,"CKI");
    const available = decimal(balance.available);
    const threshold = decimal(job.minimumThreshold);
    if (available.lt(threshold) || available.lt(config.minSwapTokens)) {
      await conn.execute(`UPDATE mining_conversion_jobs SET status='waiting',lastError=NULL WHERE id=?`,[jobId]);
      await conn.commit(); return "waiting";
    }
    const amount = Decimal.min(available,decimal(config.maxSwapTokens)).toDecimalPlaces(tokenScale,Decimal.ROUND_DOWN);
    const targetAsset = assertMiningAsset(String(job.targetDenomination),false);
    const rates = await quoteRatesDetails(conn,"CKI",targetAsset,config);
    const converted = calculateMiningConversion({tokenAmount:amount.toString(),tokenUnitsPerUsd:config.tokenUnitsPerUsd,usdPerTargetUnit:rates.targetUsdRate.toString(),feeBps:config.swapFeeBps,targetScale:assetScale(targetAsset)});
    const quote = await insertFxQuote(conn,{
      userId,purpose:"auto_conversion",sourceAsset:"CKI",targetAsset,sourceAmount:amountString(amount,"CKI"),targetAmount:converted.netAmount,
      fee:converted.feeAmount,sourceUsdRate:rates.sourceUsdRate,targetUsdRate:rates.targetUsdRate,tokenUnitsPerUsd:config.tokenUnitsPerUsd,
      marketProvider:rates.marketProvider,marketObservedAt:rates.marketObservedAt,targetScale:assetScale(targetAsset),feeBps:config.swapFeeBps,
      quoteTtlSeconds:config.quoteTtlSeconds,configVersion:config.version,details:{grossAmount:converted.grossAmount,netAmount:converted.netAmount,feeAsset:targetAsset,jobId,preferenceVersion:Number(job.preferenceVersion)},
    });
    const conversion = await executeTokenConversion(conn,userId,{
      sourceAmount:amount,targetAsset,grossAmount:converted.grossAmount,netAmount:converted.netAmount,feeAmount:converted.feeAmount,
      feeBps:config.swapFeeBps,quoteId:quote.quoteId,provider:rates.marketProvider,marketObservedAt:rates.marketObservedAt,
      idempotencyKey:requestKey("mining-auto-convert",userId,`reward-event-${job.rewardEventId}`),transactionType:"auto_conversion",configVersion:config.version,preferenceVersion:Number(job.preferenceVersion),
      tokenName:config.tokenName,tokenSymbol:config.tokenSymbol,tokenUnitsPerUsd:config.tokenUnitsPerUsd,
    });
    await conn.execute(`UPDATE mining_conversion_jobs SET status='completed',conversionId=?,lastError=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[conversion.conversionId,jobId]);
    await createMiningNotification(conn,userId,"Automatic Mining conversion completed",`${conversion.sourceAmount} CKI was converted to ${conversion.destinationAmount} simulated ${targetAsset}. Reference ${conversion.receiptReference}.`);
    await conn.commit(); return "completed";
  } catch (error) {
    await conn.rollback();
    const message = error instanceof MiningError ? error.message : "Conversion could not be completed; the CKI balance was left unchanged";
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query<any[]>(`SELECT * FROM mining_conversion_jobs WHERE id=? AND status IN ('queued','retrying') FOR UPDATE`,[jobId]);
      const job = rows[0];
      if (job) {
        const attempts = Number(job.attempts||0)+1;
        const terminal = attempts>=20;
        const notify = attempts>=5 && !job.lastNotifiedAt;
        await conn.execute(`UPDATE mining_conversion_jobs SET status=?,attempts=?,lastError=?,availableAt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND),lastNotifiedAt=IF(?,UTC_TIMESTAMP(3),lastNotifiedAt),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[terminal?"failed":"retrying",attempts,message.slice(0,500),notify?1:0,jobId]);
        if(notify) await createMiningNotification(conn,Number(job.userId),"Mining conversion pending",`An automatic conversion quote was unavailable. Your simulated CKI remains in the CKI balance and will be retried. ${message}`);
      }
      await conn.commit();
    } catch (updateError) { await conn.rollback(); throw updateError; }
    return "retrying";
  }
}

let miningWorkerUserCursor = 0;

export async function runMiningWorkerCycle() {
  return withMiningConnection(async conn => {
    let [users] = await conn.query<any[]>(`SELECT DISTINCT cp.userId FROM mining_customer_packages cp
      WHERE cp.status='active' AND cp.startsAt<UTC_TIMESTAMP(3) AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3)) AND cp.userId>? ORDER BY cp.userId LIMIT 100`,[miningWorkerUserCursor]);
    if (!users.length && miningWorkerUserCursor) {
      miningWorkerUserCursor=0;
      [users] = await conn.query<any[]>(`SELECT DISTINCT cp.userId FROM mining_customer_packages cp
        WHERE cp.status='active' AND cp.startsAt<UTC_TIMESTAMP(3) AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3)) ORDER BY cp.userId LIMIT 100`);
    }
    if (users.length) miningWorkerUserCursor=Number(users[users.length-1].userId);
    let intervals = 0;
    for (const row of users) intervals += await accrueOneUser(conn,Number(row.userId),30);
    const [jobs] = await conn.query<any[]>(`SELECT id FROM mining_conversion_jobs WHERE status IN ('queued','retrying') AND availableAt<=UTC_TIMESTAMP(3) ORDER BY id LIMIT 50`);
    const outcomes = { completed:0, waiting:0, retrying:0, skipped:0 };
    for (const row of jobs) {
      const status = await processConversionJob(conn,Number(row.id));
      if (status in outcomes) outcomes[status as keyof typeof outcomes]++;
    }
    return { usersProcessed:users.length, intervalsProcessed:intervals, conversionJobs:outcomes };
  });
}

export async function runMiningAccrualForCustomer(userId: number) {
  return withMiningConnection(async conn => accrueOneUser(conn,userId,120));
}
