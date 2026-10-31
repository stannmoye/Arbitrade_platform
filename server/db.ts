import crypto from "node:crypto";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { ENV } from "./_core/env";
import { InsertUser, appSettings, authEmailTokens, customerBalances, customerEmailPreferences, customerNotifications, customerPackageSubscriptions, packages, customerSessions, customerTotpAuthenticators, customerWalletPreferences, currencyRegistry, fxRateSnapshots, customerControls, emailOutbox, kycProfiles, payoutRequests, notificationCampaigns, notificationCampaignDeliveries, customerOpportunityRules, opportunityDeliveryEvents, opportunityOffers, opportunityPackagePolicies, opportunityPopupEvents, balanceLedger, tradingTierQualificationJobs, adminWalletAdjustmentIdempotency, stakePositions, tradePositions, tradeRewardReservations, tradeSettlementReferenceClaims, tradeLifecycleEvents, users, v5AuditEvents, v5Wallets, missedOpportunities } from "../drizzle/schema";
import { consumeTotpRecoveryCode, decryptTotpSecret, encryptTotpSecret, generateTotpRecoveryCodes, generateTotpSecret, hashTotpRecoveryCode, totpProvisioningUri, verifyTotpCode } from "./modules/totp";
import { calculateTradeSettlement } from "./modules/trade-settlement";
import { calculateRealizedProfitSettlement, type FeeRoundingMode } from "./modules/realized-profit-accounting";
import { buildSettlementLedgerCandidateReferences, inspectSettlementLedgerPostings, inspectWalletLedgerSnapshot } from "./modules/wallet-ledger-reconciliation";
import { addCalendarMonths } from "./modules/calendar-months";
import { ensurePopupDeliveries, updatePopupLifecycleForOffer } from "./opportunityLifecycle";
import { assertTradeAmountWithinBounds, chooseSecureTradeAmount } from "./modules/package-trade-allocation";
import { calculateConfiguredProfitMinor, chooseInclusiveInteger } from "./modules/trading-popup-policy";
import { planCrossWalletFunding, type FxRateSnapshot } from "./modules/trading-wallet-fx";
import { fetchCryptoRates, fetchFiatRates, fetchMostActiveStocks, fetchCurrencyUsdRate } from "./marketProviders";
import { nativeMinorToUsd, nativeMinorToUsdMinorExact, proportionalMinorAmount, usdUnitsToNativeMinor } from "../shared/money";
import { normalizeCompanyRotationCountryNames, buildCompanySpotlightPool, nextCompanySpotlight, parseCompanyCatalogueAdminState, type CompanySpotlightState } from "./modules/company-spotlight-rotation";
import { isPopupExecutionEligible } from "./modules/popup-execution-policy";
import { validatePackageAutomationPolicy, remainingRewardAllowance } from "./modules/advanced-auto-trading";
import { calculateTierDeliveryCaps, calculateTradingDeliveryCapacity, countConsumedDeliveryOffers, resolveTradingQuotaWindow, resolveTradingDeliverySchedule } from "./modules/trading-delivery-quota";
import { isWithinDailyAllocationLimit } from "./modules/daily-allocation";
import { decideTradeExecutionRetry, MAX_TRANSIENT_ATTEMPTS_PER_OPPORTUNITY } from "./modules/trade-execution-retry";
import { normalizeTicketUploadPolicy } from "./modules/ticket-upload-policy";
import { isAllowedAttachmentRequest, isSupportAttachmentStorageKeyForTicket, isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy";
import { assertNotificationPayloadMatches, buildNotificationEventKey, buildTradeSettlementNotices, filterNotificationCategories, filterVisibleNotificationEventCursor, normalizeBroadcastTargetUserId, normalizeNotificationHref, normalizeNotificationText, partitionNotificationRecipients, NOTIFICATION_CATEGORIES, type AdminBroadcastCategory, type NotificationCategory, type NotificationPriority } from "./modules/notification-events";
import { isCustomerOpportunityAllowed, isWithinQuietHours } from "./opportunityEligibility";
import { assertExactlyOneAffectedRow } from "./db-mutation-guards";
let _db: MySql2Database<Record<string, unknown>> | null = null;
let _pool: Pool | null = null;

type TradingFxConfig = { code: string; scale: number; assetType: "fiat" | "crypto" | "token"; externalCode: string | null };
type TradingFxCacheEntry = { expiresAt: number; value?: FxRateSnapshot; pending?: Promise<FxRateSnapshot> };
const tradingFxRateCache = new Map<string, TradingFxCacheEntry>();

async function getFreshTradingFxRate(config: TradingFxConfig): Promise<FxRateSnapshot> {
  const code = config.code.trim().toUpperCase();
  const key = code + ":" + config.assetType + ":" + (config.externalCode || "");
  const now = Date.now();
  const cached = tradingFxRateCache.get(key);
  if (cached && cached.expiresAt > now) {
    if (cached.value) return cached.value;
    if (cached.pending) return cached.pending;
  }
  const pending = fetchCurrencyUsdRate({ code, assetType: config.assetType, externalCode: config.externalCode })
    .then(result => ({
      currency: code,
      scale: config.scale,
      rateUsdPerUnit: result.rate,
      provider: result.provider,
      sourceDate: result.sourceDate,
      fetchedAt: result.fetchedAt,
    }));
  tradingFxRateCache.set(key, { expiresAt: now + 30_000, pending });
  try {
    const value = await pending;
    tradingFxRateCache.set(key, { expiresAt: Date.now() + 30_000, value });
    while (tradingFxRateCache.size > 256) {
      const oldest = tradingFxRateCache.keys().next().value;
      if (oldest === undefined) break;
      tradingFxRateCache.delete(oldest);
    }
    return value;
  } catch (error) {
    tradingFxRateCache.delete(key);
    throw error;
  }
}



// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const connectionUrl = new URL(process.env.DATABASE_URL);
      const sslParam = connectionUrl.searchParams.get("ssl");
      let ssl: Record<string, unknown> | undefined;
      if (sslParam) {
        try {
          const parsed = JSON.parse(sslParam);
          ssl = parsed === true ? {} : parsed && typeof parsed === "object" ? parsed : undefined;
        } catch {
          ssl = undefined;
        }
      }
      const pool = createPool({
        host: connectionUrl.hostname,
        port: Number(connectionUrl.port || 3306),
        user: decodeURIComponent(connectionUrl.username),
        password: decodeURIComponent(connectionUrl.password),
        database: decodeURIComponent(connectionUrl.pathname.slice(1)),
        ssl,
      });
      _pool = pool;
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Close the shared MySQL pool after server requests and worker cycles have drained. */
export async function closeDbPool(): Promise<void> {
  const pool = _pool;
  _pool = null;
  _db = null;
  if (pool) await pool.end();
}

export async function getAppSetting(key: string, fallback?: string) {
  const db = await getDb(); if (!db) return fallback;
  const row = (await db.select().from(appSettings).where(eq(appSettings.settingKey, key)).limit(1))[0];
  return row?.settingValue ?? fallback;
}
export async function setAppSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const existing = (await db.select().from(appSettings).where(eq(appSettings.settingKey, key)).limit(1))[0];
  if (existing) await db.update(appSettings).set({ settingValue: value, updatedBy: updatedBy ?? null }).where(eq(appSettings.settingKey, key));
  else await db.insert(appSettings).values({ settingKey: key, settingValue: value, updatedBy: updatedBy ?? null });
}

export async function updateCompanyCatalogueAdminState(input: {
  ids: string[];
  status: "verified" | "unverified" | "archived";
  reason: string;
  updatedBy: number;
}) {
  const ids = [...new Set(input.ids)];
  if (!ids.length || ids.length > 1811 || ids.some(id => !/^logo-brand-\d{4}$/.test(id))) {
    throw new Error("Select between 1 and 1,811 valid company catalogue IDs.");
  }
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new Error("A valid reason is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const settingKey = "trade.companyCatalogue.adminState";
    await tx.insert(appSettings).values({ settingKey, settingValue: "{}", updatedBy: input.updatedBy })
      .onDuplicateKeyUpdate({ set: { settingKey } });
    const row = (await tx.select().from(appSettings).where(eq(appSettings.settingKey, settingKey)).limit(1).for("update"))[0];
    let verifiedIds: string[] = [];
    let archivedIds: string[] = [];
    try {
      const parsed = JSON.parse(row?.settingValue ?? "{}") as { verifiedIds?: string[]; archivedIds?: string[] };
      verifiedIds = (parsed.verifiedIds ?? []).filter(id => /^logo-brand-\d{4}$/.test(id));
      archivedIds = (parsed.archivedIds ?? []).filter(id => /^logo-brand-\d{4}$/.test(id));
    } catch {
      verifiedIds = [];
      archivedIds = [];
    }
    const verified = new Set(verifiedIds);
    const archived = new Set(archivedIds);
    const updatedAt = new Date().toISOString();
    for (const id of ids) {
      verified.delete(id);
      archived.delete(id);
      if (input.status === "verified") verified.add(id);
      if (input.status === "archived") archived.add(id);
    }
    const nextValue = JSON.stringify({
      verifiedIds: [...verified].sort(),
      archivedIds: [...archived].sort(),
      lastAction: { status: input.status, count: ids.length, reason: input.reason.trim(), updatedAt, updatedBy: input.updatedBy },
    });
    await tx.update(appSettings).set({ settingValue: nextValue, updatedBy: input.updatedBy, updatedAt: new Date() }).where(eq(appSettings.settingKey, settingKey));
    await tx.insert(v5AuditEvents).values({
      actorUserId: input.updatedBy,
      action: "company_catalogue.bulk_status_updated",
      entityType: "company_catalogue",
      entityId: "bulk",
      reason: input.reason.trim(),
      reference: `company-catalogue:${input.status}:${updatedAt}`,
      metadataJson: JSON.stringify({ status: input.status, count: ids.length, ids, updatedAt }),
    });
    return { success: true, updated: ids.length, status: input.status, updatedAt };
  });
}

export async function listAdminAuditEvents(){ const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(v5AuditEvents).orderBy(desc(v5AuditEvents.createdAt)).limit(200); }
const TRADE_FEE_SETTING_KEYS = ["trade.platformFeeBps", "trade.feeRoundingMode", "trade.feePolicyVersion"] as const;
const DEFAULT_TRADE_FEE_POLICY = { feeRateBps: 1500, roundingMode: "half_up" as FeeRoundingMode, policyVersion: 1 };
function normalizeTradeFeePolicy(values: { feeRateBps: unknown; roundingMode: unknown; policyVersion: unknown }) {
  const feeRateBps=Number(values.feeRateBps);
  const policyVersion=Number(values.policyVersion);
  const roundingMode=String(values.roundingMode) as FeeRoundingMode;
  if(!Number.isInteger(feeRateBps)||feeRateBps<0||feeRateBps>10000) throw new Error("Trading fee rate setting is invalid");
  if(!["half_up","down","up","half_even"].includes(roundingMode)) throw new Error("Trading fee rounding setting is invalid");
  if(!Number.isSafeInteger(policyVersion)||policyVersion<1) throw new Error("Trading fee policy version is invalid");
  return {feeRateBps,roundingMode,policyVersion};
}
export async function getTradeFeePolicy() {
  const [feeRateBps,roundingMode,policyVersion]=await Promise.all([
    getAppSetting("trade.platformFeeBps",String(DEFAULT_TRADE_FEE_POLICY.feeRateBps)),
    getAppSetting("trade.feeRoundingMode",DEFAULT_TRADE_FEE_POLICY.roundingMode),
    getAppSetting("trade.feePolicyVersion",String(DEFAULT_TRADE_FEE_POLICY.policyVersion)),
  ]);
  const policy=normalizeTradeFeePolicy({feeRateBps,roundingMode,policyVersion});
  return {...policy,feePercent:policy.feeRateBps/100};
}
export async function setTradeFeePolicy(input:{feeRateBps:number;roundingMode:FeeRoundingMode},updatedBy:number) {
  if(!Number.isInteger(input.feeRateBps)||input.feeRateBps<0||input.feeRateBps>10000) throw new Error("Trading fee rate must be between 0% and 100%");
  if(!["half_up","down","up","half_even"].includes(input.roundingMode)) throw new Error("Unsupported trading fee rounding mode");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.transaction(async tx=>{
    const rows=await tx.select().from(appSettings).where(inArray(appSettings.settingKey,[...TRADE_FEE_SETTING_KEYS])).for("update");
    const byKey=new Map<string,string>();
    for(const row of rows) byKey.set(row.settingKey,row.settingValue);
    const current=normalizeTradeFeePolicy({
      feeRateBps:byKey.get("trade.platformFeeBps")??String(DEFAULT_TRADE_FEE_POLICY.feeRateBps),
      roundingMode:byKey.get("trade.feeRoundingMode")??DEFAULT_TRADE_FEE_POLICY.roundingMode,
      policyVersion:byKey.get("trade.feePolicyVersion")??String(DEFAULT_TRADE_FEE_POLICY.policyVersion),
    });
    const next={feeRateBps:input.feeRateBps,roundingMode:input.roundingMode,policyVersion:current.policyVersion+1};
    if(!Number.isSafeInteger(next.policyVersion)) throw new Error("Trading fee policy version has reached its limit");
    const updateSetting=async(settingKey:string,settingValue:string)=>{
      if(byKey.has(settingKey)) {
        await tx.update(appSettings).set({settingValue,updatedBy,updatedAt:new Date()}).where(eq(appSettings.settingKey,settingKey));
      } else {
        await tx.insert(appSettings).values({settingKey,settingValue,updatedBy});
      }
    };
    await updateSetting("trade.platformFeeBps",String(next.feeRateBps));
    await updateSetting("trade.feeRoundingMode",next.roundingMode);
    await updateSetting("trade.feePolicyVersion",String(next.policyVersion));
    await tx.insert(v5AuditEvents).values({
      actorUserId:updatedBy,
      action:"trade_fee_policy_updated",
      entityType:"trade_fee_policy",
      entityId:String(next.policyVersion),
      reason:"Administrator updated realized-profit fee settings.",
      reference:`trade-fee-policy:${next.policyVersion}`,
      metadataJson:JSON.stringify({old:{...current,feePercent:current.feeRateBps/100},new:{...next,feePercent:next.feeRateBps/100}}),
    });
    return {...next,feePercent:next.feeRateBps/100};
  });
}

export async function getTradeSettlementPolicy() {
  const delaySeconds = Number(await getAppSetting("trade.settlementDelaySeconds", "900"));
  const creditDelaySeconds = Number(await getAppSetting("trade.creditDelaySeconds", "0"));
  const cooldownSeconds = Number(await getAppSetting("trade.interTradeCooldownSeconds", "30"));
  const nextPopupFormulaDelaySeconds = Number(await getAppSetting("opportunity.nextPopupFormulaDelaySeconds", "30"));
  const popupCooldownSeconds = Number(await getAppSetting("opportunity.popup.minGapSeconds", "45"));
  const popupDisplaySeconds = Number(await getAppSetting("opportunity.popup.displaySeconds", "8"));
  const popupPreAlertSeconds = Number(await getAppSetting("opportunity.popup.preAlertSeconds", "4"));
  const popupJitterSeconds = Number(await getAppSetting("opportunity.popup.jitterSeconds", "90"));
  const popupMaxPerHour = Number(await getAppSetting("opportunity.popup.maxPerHour", "12"));
  const marketRefreshIntervalMinutes = Number(await getAppSetting("market.refreshIntervalMinutes", "120"));
  const blockUntilSettled = (await getAppSetting("trade.blockOpportunitiesUntilSettled", "true")) === "true";
  const values = { delaySeconds, creditDelaySeconds, cooldownSeconds, nextPopupFormulaDelaySeconds, popupCooldownSeconds, popupDisplaySeconds, popupPreAlertSeconds, popupJitterSeconds, popupMaxPerHour, marketRefreshIntervalMinutes };
  if (!Number.isInteger(delaySeconds) || delaySeconds < 1) throw new Error("Settlement time must be a positive integer");
  if (!Number.isInteger(creditDelaySeconds) || creditDelaySeconds < 0) throw new Error("Credit delay must be a non-negative integer");
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0) throw new Error("Inter-trade cooldown must be a non-negative integer");
  const invalid = Object.entries(values).find(([, value]) => !Number.isInteger(value) || value < 0);
  if (invalid) throw new Error(`Invalid timing setting: ${invalid[0]}`);
  return { ...values, settlementDelaySeconds: delaySeconds, blockUntilSettled };
}
export async function setTradeSettlementPolicy(input:{delaySeconds:number;creditDelaySeconds:number;cooldownSeconds:number;nextPopupFormulaDelaySeconds:number;popupCooldownSeconds:number;popupDisplaySeconds:number;popupPreAlertSeconds:number;popupJitterSeconds:number;popupMaxPerHour:number;marketRefreshIntervalMinutes:number;blockUntilSettled:boolean}, updatedBy:number) {
  const bounded = [["settlement",input.delaySeconds,1,604800],["credit",input.creditDelaySeconds,0,604800],["cooldown",input.cooldownSeconds,0,604800],["formula",input.nextPopupFormulaDelaySeconds,0,604800],["popup cooldown",input.popupCooldownSeconds,0,604800],["popup display",input.popupDisplaySeconds,1,3600],["popup pre-alert",input.popupPreAlertSeconds,0,3600],["popup jitter",input.popupJitterSeconds,0,604800],["popup hourly cap",input.popupMaxPerHour,1,10000],["market refresh",input.marketRefreshIntervalMinutes,1,10080]] as const;
  for (const [label,value,min,max] of bounded) if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} timing is outside its allowed range`);
  await setAppSetting("trade.settlementDelaySeconds", String(input.delaySeconds), updatedBy);
  await setAppSetting("trade.creditDelaySeconds", String(input.creditDelaySeconds), updatedBy);
  await setAppSetting("trade.interTradeCooldownSeconds", String(input.cooldownSeconds), updatedBy);
  await setAppSetting("trade.blockOpportunitiesUntilSettled", String(input.blockUntilSettled), updatedBy);
  await setAppSetting("opportunity.nextPopupFormulaDelaySeconds", String(input.nextPopupFormulaDelaySeconds), updatedBy);
  await setAppSetting("opportunity.popup.minGapSeconds", String(input.popupCooldownSeconds), updatedBy);
  await setAppSetting("opportunity.popup.displaySeconds", String(input.popupDisplaySeconds), updatedBy);
  await setAppSetting("opportunity.popup.preAlertSeconds", String(input.popupPreAlertSeconds), updatedBy);
  await setAppSetting("opportunity.popup.jitterSeconds", String(input.popupJitterSeconds), updatedBy);
  await setAppSetting("opportunity.popup.maxPerHour", String(input.popupMaxPerHour), updatedBy);
  await setAppSetting("market.refreshIntervalMinutes", String(input.marketRefreshIntervalMinutes), updatedBy);
  return getTradeSettlementPolicy();
}
export async function countOutstandingTrades(userId?: number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const rows=await db.select({id:tradePositions.id}).from(tradePositions).where(userId===undefined?eq(tradePositions.status,"confirmed"):and(eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed"))); return rows.length; }
export async function getTicketUploadPolicy() {
  return normalizeTicketUploadPolicy(
    await getAppSetting("ticket.maxAttachmentMb", "25"),
    await getAppSetting(
      "ticket.allowedMimeTypes",
      "image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx",
    ),
  );
}

/** Stable, non-reversible account tombstone key. It stores no external OAuth identifier. */
function closedAccountIdentityKey(openId: string): string | null {
  const secret = ENV.cookieSecret;
  if (!secret) return null;
  const digest = crypto.createHmac("sha256", secret).update(openId).digest("hex").slice(0, 57);
  return `closed:${digest}`;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    const tombstoneKey = closedAccountIdentityKey(user.openId);
    await db.transaction(async (tx) => {
      // Serialize OAuth upserts against account closure and block recreation after closure.
      if (tombstoneKey) {
        const closedIdentity = (await tx.select({ id: users.id, loginMethod: users.loginMethod })
          .from(users).where(eq(users.openId, tombstoneKey)).limit(1).for("update"))[0];
        if (closedIdentity?.loginMethod === "closed") {
          throw new Error("This account has been permanently closed and cannot be recreated.");
        }
      }
      const existing = (await tx.select({ id: users.id, loginMethod: users.loginMethod })
        .from(users).where(eq(users.openId, user.openId)).limit(1).for("update"))[0];
      if (existing?.loginMethod === "closed") {
        throw new Error("This account has been permanently closed and cannot be recreated.");
      }
      await tx.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  return (await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1))[0] ?? null;
}
export async function getUserById(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
}
export async function createLocalCustomer(input: { email: string; passwordHash: string; name: string }) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const email = input.email.toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("An account with this email already exists");
  const openId = `local:customer:${email}`;
  const result = await db.insert(users).values({ openId, email, name: input.name, loginMethod: "email", role: "user", passwordHash: input.passwordHash });
  await provisionSignupCredit(Number(result[0].insertId));
  return (await db.select().from(users).where(eq(users.id, Number(result[0].insertId))).limit(1))[0];
}

/**
 * Resolve a signed session identity for logout without performing OAuth auto-provisioning.
 * Unlike getUserByOpenId, this helper fails closed when the database is unavailable.
 */
export async function getUserForSessionRevocation(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("Authentication storage is unavailable");
  const direct = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  if (direct) return direct;

  const tombstoneKey = closedAccountIdentityKey(openId);
  if (tombstoneKey) {
    const tombstone = (await db.select().from(users).where(eq(users.openId, tombstoneKey)).limit(1))[0];
    if (tombstone?.loginMethod === "closed") return tombstone;
  }
  return null;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (result.length > 0) return result[0];

  // Resolve a closed identity to its anonymized tombstone so OAuth cannot auto-provision it again.
  const tombstoneKey = closedAccountIdentityKey(openId);
  if (!tombstoneKey) return undefined;
  const tombstone = await db.select().from(users).where(eq(users.openId, tombstoneKey)).limit(1);
  return tombstone[0]?.loginMethod === "closed" ? tombstone[0] : undefined;
}

// TODO: add feature queries here as your schema grows.


import { riskReports, supportAttachments, supportMessages, supportTickets } from "../drizzle/schema";

export async function createRiskReport(userId: number, title: string, requestedFor?: string) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const result = await db.insert(riskReports).values({ userId, title, requestedFor: requestedFor || null });
  return { id: Number(result[0].insertId), status: "requested" as const };
}
export async function listRiskReports(userId: number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(riskReports).where(eq(riskReports.userId,userId)).orderBy(desc(riskReports.createdAt)); }
export async function upsertCustomerSession(userId:number, data:{deviceLabel:string;ipAddress?:string;countryCode?:string;userAgent?:string}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const existing=await db.select().from(customerSessions).where(and(eq(customerSessions.userId,userId),eq(customerSessions.deviceLabel,data.deviceLabel))).limit(1); if(existing[0]) { await db.update(customerSessions).set({ ...data, lastSeenAt:new Date(), isCurrent:true }).where(eq(customerSessions.id,existing[0].id)); return existing[0].id; } const result=await db.insert(customerSessions).values({userId,...data}); return Number(result[0].insertId); }
export async function listCustomerSessions(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(customerSessions).where(eq(customerSessions.userId,userId)).orderBy(desc(customerSessions.lastSeenAt)); }
export async function revokeCustomerSession(userId:number,id:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await db.update(customerSessions).set({isCurrent:false}).where(and(eq(customerSessions.id,id),eq(customerSessions.userId,userId))); }
export async function createTicket(userId:number,input:{subject:string;body:string;priority:"low"|"normal"|"high"|"urgent";category?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const subject=normalizeNotificationText(input.subject,200,"ticket subject");
  const body=normalizeNotificationText(input.body,20000,"ticket message");
  if(subject.length<3) throw new Error("Ticket subject must contain at least 3 characters");
  const ticketNumber=`ARB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  // A ticket without its opening message is not a usable support case. Persist
  // both records together, then send best-effort notifications after commit.
  const ticketId=await db.transaction(async tx=>{
    const result=await tx.insert(supportTickets).values({ticketNumber,customerId:userId,subject,category:input.category||"account",priority:input.priority});
    const id=Number(result[0].insertId);
    await tx.insert(supportMessages).values({ticketId:id,authorId:userId,body});
    return id;
  });
  try {
    const admins=await db.select({id:users.id}).from(users).where(eq(users.role,"admin"));
    const notificationResults=await Promise.allSettled([
      ...admins.map(admin=>createNotification(admin.id,"New customer support ticket",`${ticketNumber}: ${subject}`,{eventKey:`support-ticket-created:${ticketId}:admin:${admin.id}`,category:"support",priority:input.priority==="urgent"?"urgent":input.priority==="high"?"high":"normal"})),
      createNotification(userId,subject,`${ticketNumber}: Your support ticket was created and is now in the support centre.`,{eventKey:`support-ticket-created-customer:${ticketId}`,category:"support",priority:input.priority==="urgent"?"urgent":input.priority==="high"?"high":"normal"}),
    ]);
    if(notificationResults.some(result=>result.status==="rejected")) console.error("[Notifications] One or more ticket-created notices failed after ticket persistence.");
  } catch(error) {
    console.error("[Notifications] Ticket-created notices failed after ticket persistence:",error instanceof Error?error.name:"UnknownError");
  }
  return {ticketId,ticketNumber};
 }
export async function listCustomerTickets(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(supportTickets).where(eq(supportTickets.customerId,userId)).orderBy(desc(supportTickets.updatedAt)); }
export const ACCOUNT_CLOSURE_TICKET_SUBJECT = "Account closure request — administrator review required";
export type AccountClosureReason = "not-using" | "experience" | "fees" | "privacy" | "support";

export async function createAccountClosureTicket(userId: number, reasons: AccountClosureReason[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const labels: Record<AccountClosureReason, string> = {
    "not-using": "I no longer use the platform",
    experience: "The platform experience did not meet my expectations",
    fees: "Costs, fees, or available features",
    privacy: "Privacy or account-security concerns",
    support: "Customer support or another reason",
  };
  const body = [
    "ACCOUNT CLOSURE REQUEST — CUSTOMER SUBMISSION", "",
    "The customer is requesting account closure. This ticket requests administrator review only and does not close or delete the account.", "",
    "Selected reasons:",
    ...reasons.map((reason) => `- ${labels[reason]}`), "",
    "Customer acknowledgments:",
    "- I understand that my account remains active until an authorized administrator reviews and approves this request.",
    "- I understand that personal information eligible for deletion may be deleted or anonymized, while records may be retained where required for legal, regulatory, security, accounting, fraud-prevention, audit, dispute-resolution, or financial-recordkeeping obligations.",
    "- I understand that closure may be irreversible and can remove access to account services and eligible account history.", "",
    "The customer explicitly acknowledged the closure disclosure. The administrator must record an explicit approve/reject decision. Ticket creation alone must never trigger deletion.",
  ].join("\n");
  const created = await db.transaction(async (tx) => {
    // Lock the account row so multiple tabs cannot create duplicate pending cases.
    const user = (await tx.select({ id: users.id, role: users.role, loginMethod: users.loginMethod })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user" || user.loginMethod === "closed") {
      throw new Error("Only an active customer account can request closure.");
    }
    const pending = (await tx.select({
      id: supportTickets.id, ticketNumber: supportTickets.ticketNumber,
    }).from(supportTickets).where(and(
      eq(supportTickets.customerId, userId),
      eq(supportTickets.subject, ACCOUNT_CLOSURE_TICKET_SUBJECT),
      inArray(supportTickets.status, ["open", "answered"]),
    )).limit(1).for("update"))[0];
    if (pending) return { ...pending, alreadyPending: true };

    const ticketNumber = `ARB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const inserted = await tx.insert(supportTickets).values({
      ticketNumber, customerId: userId, subject: ACCOUNT_CLOSURE_TICKET_SUBJECT,
      category: "account", priority: "high",
    });
    const ticketId = Number(inserted[0].insertId);
    await tx.insert(supportMessages).values({ ticketId, authorId: userId, body });
    return { ticketId, ticketNumber, alreadyPending: false };
  });
  if (created.alreadyPending) return created;

  // Notifications are best-effort after commit; they cannot lose the persisted request.
  try {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    const results = await Promise.allSettled([
      ...admins.map((admin) => createNotification(admin.id, "Account closure request", `${created.ticketNumber}: A customer requested account closure and needs an explicit review decision.`, {
        eventKey: `account-closure-request:${created.ticketId}:admin:${admin.id}`, category: "support", priority: "high",
      })),
      createNotification(userId, "Account closure request received", `${created.ticketNumber}: Your request is awaiting administrator review. Your account remains active.`, {
        eventKey: `account-closure-request:${created.ticketId}:customer`, category: "support", priority: "high",
      }),
    ]);
    if (results.some((result) => result.status === "rejected")) console.error("[AccountClosure] A request notification failed after the ticket was persisted.");
  } catch (error) {
    console.error("[AccountClosure] Request notifications failed:", error instanceof Error ? error.name : "UnknownError");
  }
  return created;
}


export async function listAllTickets() { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:supportTickets.id,ticketNumber:supportTickets.ticketNumber,customerId:supportTickets.customerId,assignedAdminId:supportTickets.assignedAdminId,subject:supportTickets.subject,category:supportTickets.category,priority:supportTickets.priority,status:supportTickets.status,createdAt:supportTickets.createdAt,updatedAt:supportTickets.updatedAt,customerName:users.name,customerEmail:users.email}).from(supportTickets).leftJoin(users,eq(users.id,supportTickets.customerId)).orderBy(desc(supportTickets.updatedAt)); }
export async function listSupportAssignees() { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:users.id,name:users.name,email:users.email}).from(users).where(eq(users.role,"admin")).orderBy(users.id); }
export async function assignSupportTicket(actorId:number,ticketId:number,assignedAdminId:number|null) {
 const db=await getDb(); if(!db) throw new Error("Database is not available");
 const committed=await db.transaction(async tx=>{
  const actor=(await tx.select({id:users.id,role:users.role}).from(users).where(eq(users.id,actorId)).limit(1))[0];
  if(!actor||actor.role!=="admin") throw new Error("Only administrators can assign support tickets");
  const ticket=(await tx.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1).for("update"))[0];
  if(!ticket) throw new Error("Ticket not found");
  let assignee:{id:number;name:string|null;email:string|null}|null=null;
  if(assignedAdminId!==null) {
   assignee=(await tx.select({id:users.id,name:users.name,email:users.email}).from(users).where(and(eq(users.id,assignedAdminId),eq(users.role,"admin"))).limit(1))[0]??null;
   if(!assignee) throw new Error("Assignee must be an existing administrator");
  }
  if((ticket.assignedAdminId??null)===assignedAdminId) return {changed:false,ticket,assignee};
  const changedAt=new Date();
  await tx.update(supportTickets).set({assignedAdminId,updatedAt:changedAt}).where(eq(supportTickets.id,ticketId));
  await tx.insert(v5AuditEvents).values({actorUserId:actorId,action:assignedAdminId===null?"support.ticket.unassigned":"support.ticket.assigned",entityType:"support_ticket",entityId:String(ticketId),reason:assignedAdminId===null?"Support ticket returned to the unassigned queue":"Support ticket assigned to administrator",reference:ticket.ticketNumber,metadataJson:JSON.stringify({previousAssigneeId:ticket.assignedAdminId??null,assignedAdminId})});
  return {changed:true,ticket,assignee,changedAt};
 });
 if(committed.changed&&committed.assignee) {
  try { await createNotification(committed.assignee.id,"Support ticket assigned",`${committed.ticket.ticketNumber}: ${committed.ticket.subject}`,{eventKey:`support-ticket:${ticketId}:assignment:${committed.changedAt!.getTime()}`,category:"support",priority:committed.ticket.priority==="urgent"?"urgent":committed.ticket.priority==="high"?"high":committed.ticket.priority==="low"?"low":"normal",href:"/admin"}); }
  catch(error) { console.error("[Notifications] Support assignment notice failed after assignment commit:",error instanceof Error?error.name:"UnknownError"); }
 }
 return {success:true,changed:committed.changed,assignedAdminId:committed.assignee?.id??null};
}
export async function getCustomerTicket(userId:number,ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return (await db.select().from(supportTickets).where(and(eq(supportTickets.id,ticketId),eq(supportTickets.customerId,userId))).limit(1))[0] ?? null; }
export async function getSupportTicketById(ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return (await db.select({id:supportTickets.id,subject:supportTickets.subject,category:supportTickets.category,customerId:supportTickets.customerId,status:supportTickets.status}).from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1))[0] ?? null; }
export async function addTicketMessage(actorId:number,ticketId:number,body:string,status?:"open"|"answered"|"resolved"|"closed") {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  // Keep the message and ticket status in one transaction: a failed status
  // update must not leave a committed reply with stale inbox state.
  const committed=await db.transaction(async tx=>{
    const ticket=(await tx.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1).for("update"))[0];
    if(!ticket) throw new Error("Ticket not found");
    const actor=(await tx.select({role:users.role}).from(users).where(eq(users.id,actorId)).limit(1))[0];
    if(!actor) throw new Error("Message author not found");
    const isAdmin=actor.role==="admin";
    if(!isAdmin && ticket.customerId!==actorId) throw new Error("You do not have access to this ticket");
    const normalizedBody=normalizeNotificationText(body,20000,"ticket message");
    if(!isAdmin && (ticket.status==="closed" || ticket.status==="resolved")) throw new Error("Resolved or closed tickets must be reopened before a customer reply");
    const inserted=await tx.insert(supportMessages).values({ticketId,authorId:actorId,body:normalizedBody});
    const messageId=Number(inserted[0].insertId);
    const nextStatus=isAdmin ? (status||"answered") : "open";
    await tx.update(supportTickets).set({status:nextStatus,updatedAt:new Date()}).where(eq(supportTickets.id,ticketId));
    return {ticket,isAdmin,normalizedBody,messageId};
  });
  // Notifications are deliberately post-commit and best-effort: a notification
  // outage must not make a successfully persisted reply appear to have failed.
  if(committed.isAdmin){
    try {
      await createNotification(committed.ticket.customerId,"Support replied to your ticket",`${committed.ticket.ticketNumber}: ${committed.normalizedBody.slice(0,240)}`,{eventKey:`support-ticket:${ticketId}:message:${committed.messageId}`,category:"support",priority:"normal"});
    } catch(error) {
      console.error("[Notifications] Ticket reply notice failed after message commit:",error instanceof Error?error.name:"UnknownError");
    }
  } else {
    try {
      const admins=await db.select({id:users.id}).from(users).where(eq(users.role,"admin"));
      const results=await Promise.allSettled(admins.map(admin=>createNotification(admin.id,"Customer replied to a support ticket",`${committed.ticket.ticketNumber}: ${committed.normalizedBody.slice(0,240)}`,{eventKey:`support-ticket:${ticketId}:message:${committed.messageId}:admin:${admin.id}`,category:"support",priority:committed.ticket.priority==="urgent"?"urgent":committed.ticket.priority==="high"?"high":"normal"})));
      if(results.some(result=>result.status==="rejected")) console.error("[Notifications] One or more customer-reply notices failed after message commit.");
    } catch(error) {
      console.error("[Notifications] Customer reply notices failed after message commit:",error instanceof Error?error.name:"UnknownError");
    }
  }
}
export async function reopenSupportTicket(actorId:number,ticketId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const ticket=(await db.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1))[0];
  if(!ticket) throw new Error("Ticket not found");
  const actor=(await db.select({role:users.role}).from(users).where(eq(users.id,actorId)).limit(1))[0];
  if(!actor) throw new Error("Ticket actor not found");
  const isAdmin=actor.role==="admin";
  if(!isAdmin && ticket.customerId!==actorId) throw new Error("You do not have access to this ticket");
  if(ticket.status!=="closed" && ticket.status!=="resolved") return {success:true,changed:false,status:ticket.status};
  const previousUpdatedAt=new Date(ticket.updatedAt as any).getTime();
  // Conditional update prevents two concurrent reopen requests from both
  // claiming that they changed the same closed/resolved ticket.
  const changed=await db.update(supportTickets).set({status:"open",updatedAt:new Date()})
    .where(and(eq(supportTickets.id,ticketId),or(eq(supportTickets.status,"closed"),eq(supportTickets.status,"resolved"))));
  const affected=Number((changed as any)?.[0]?.affectedRows ?? (changed as any)?.affectedRows ?? 0);
  if(affected!==1) {
    const current=(await db.select({status:supportTickets.status}).from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1))[0];
    return {success:true,changed:false,status:current?.status ?? "open"};
  }
  const eventKey=`support-ticket:${ticketId}:reopened:${previousUpdatedAt}`;
  try {
    if(isAdmin) {
      await createNotification(ticket.customerId,"Your support ticket was reopened",`${ticket.ticketNumber}: support has reopened this case and the conversation is available again.`,{eventKey,category:"support",priority:ticket.priority==="urgent"?"urgent":"normal"});
    } else {
      const admins=await db.select({id:users.id}).from(users).where(eq(users.role,"admin"));
      const results=await Promise.allSettled(admins.map(admin=>createNotification(admin.id,"Customer reopened a support ticket",`${ticket.ticketNumber}: the customer reopened this case.`,{eventKey:`${eventKey}:admin:${admin.id}`,category:"support",priority:ticket.priority==="urgent"?"urgent":"normal"})));
      if(results.some(result=>result.status==="rejected")) console.error("[Notifications] One or more reopen notices failed after status commit.");
    }
  } catch(error) {
    console.error("[Notifications] Ticket reopen notice failed after status commit:",error instanceof Error?error.name:"UnknownError");
  }
  return {success:true,changed:true,status:"open" as const};
}
export async function listTicketMessages(ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:supportMessages.id,ticketId:supportMessages.ticketId,authorId:supportMessages.authorId,authorName:users.name,authorRole:users.role,body:supportMessages.body,createdAt:supportMessages.createdAt}).from(supportMessages).leftJoin(users,eq(users.id,supportMessages.authorId)).where(eq(supportMessages.ticketId,ticketId)).orderBy(supportMessages.createdAt); }
export async function listTicketAttachments(ticketId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({id:supportAttachments.id,fileName:supportAttachments.fileName,mimeType:supportAttachments.mimeType,sizeBytes:supportAttachments.sizeBytes,storageKey:supportAttachments.storageKey,createdAt:supportAttachments.createdAt})
    .from(supportAttachments).where(eq(supportAttachments.ticketId,ticketId)).orderBy(supportAttachments.createdAt);
  return rows.filter(row=>isValidSupportAttachmentStorageKey(row.storageKey)).map(({storageKey,...row})=>({...row,url:`/storage/${storageKey}`}));
}
export async function createNotification(userId:number,title:string,body:string,options:{eventKey?:string|null;category?:NotificationCategory;priority?:NotificationPriority;href?:string|null}={}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const safeTitle=normalizeNotificationText(title,200,"title");
  const safeBody=normalizeNotificationText(body,10000,"body");
  const eventKey=buildNotificationEventKey(userId,options.eventKey);
  const href=normalizeNotificationHref(options.href);
  const values={userId,title:safeTitle,body:safeBody,eventKey,category:options.category||"account",priority:options.priority||"normal",href};
  let notificationId=0;
  if(eventKey){
    await db.insert(customerNotifications).values(values).onDuplicateKeyUpdate({set:{eventKey}});
    const existing=(await db.select({id:customerNotifications.id,userId:customerNotifications.userId,title:customerNotifications.title,body:customerNotifications.body,category:customerNotifications.category,priority:customerNotifications.priority,href:customerNotifications.href}).from(customerNotifications).where(eq(customerNotifications.eventKey,eventKey)).limit(1))[0];
    if(!existing) throw new Error("Notification persistence could not be confirmed");
    assertNotificationPayloadMatches(existing,{userId,title:safeTitle,body:safeBody,category:options.category||"account",priority:options.priority||"normal",href});
    notificationId=existing.id;
  } else {
    const inserted=await db.insert(customerNotifications).values(values);
    notificationId=Number(inserted[0].insertId)||0;
  }
  // Do not let a broadcast count an attempt as successful unless its durable
  // notification row can be identified (including on idempotent duplicate retries).
  if(!notificationId) throw new Error("Notification persistence could not be confirmed");
  // Email delivery is keyed by the persisted notification ID; duplicate event
  // retries therefore reuse the same outbox idempotency key.
  if(notificationId){
    try { const { enqueueSystemNotificationEmail }=await import("./emailQueue"); await enqueueSystemNotificationEmail(userId,safeTitle,safeBody,`notification:${notificationId}`); }
    catch(error) { console.error("[Email] System notification enqueue failed:",error instanceof Error?error.name:"UnknownError"); }
  }
  return notificationId;
}
export async function broadcastCustomerNotification(adminId:number,input:{title:string;body:string;eventKey:string;category:AdminBroadcastCategory;priority:NotificationPriority;href?:string|null;targetUserId?:number|null;scheduledAt?:string|null;expiresAt?:string|null}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  if(!Number.isSafeInteger(adminId) || adminId <= 0) throw new RangeError("Broadcast administrator must be a positive integer user ID");
  const targetUserId=normalizeBroadcastTargetUserId(input.targetUserId);
  const title=normalizeNotificationText(input.title,200,"title");
  const body=normalizeNotificationText(input.body,10000,"body");
  const eventKey=normalizeNotificationText(input.eventKey,120,"event key");
  const href=normalizeNotificationHref(input.href);
  const parseDate=(value:string|null|undefined,label:string):Date|null=>{ if(value==null||value==="")return null; const date=new Date(value); if(!Number.isFinite(date.getTime()))throw new RangeError("Announcement "+label+" must be a valid date"); return date; };
  const scheduledAt=parseDate(input.scheduledAt,"schedule time");
  const expiresAt=parseDate(input.expiresAt,"expiry time");
  const now=new Date();
  if(expiresAt && expiresAt.getTime()<=now.getTime())throw new RangeError("Announcement expiry must be in the future");
  if(scheduledAt && expiresAt && expiresAt.getTime()<=scheduledAt.getTime())throw new RangeError("Announcement expiry must be later than its scheduled publish time");
  const sameDate=(left:Date|null|undefined,right:Date|null)=>left==null?right==null:right!=null&&left.getTime()===right.getTime();
  const activeCustomerCondition=or(isNull(customerControls.accountStatus),eq(customerControls.accountStatus,"active"));
  const findRecipients=async()=>targetUserId!==null
    ? await db.select({id:users.id}).from(users).leftJoin(customerControls,eq(customerControls.userId,users.id)).where(and(eq(users.id,targetUserId),eq(users.role,"user"),activeCustomerCondition)).limit(1)
    : await db.select({id:users.id}).from(users).leftJoin(customerControls,eq(customerControls.userId,users.id)).where(and(eq(users.role,"user"),activeCustomerCondition));
  let campaign=(await db.select().from(notificationCampaigns).where(and(eq(notificationCampaigns.createdBy,adminId),eq(notificationCampaigns.eventKey,eventKey))).limit(1))[0];
  const matchesPayload=(row:typeof campaign)=>Boolean(row && row.title===title && row.body===body && row.category===input.category && row.priority===input.priority && row.href===(href??null) && row.targetUserId===(targetUserId??null) && sameDate(row.scheduledAt,scheduledAt) && sameDate(row.expiresAt,expiresAt));
  if(campaign && !matchesPayload(campaign))throw new Error("Announcement event key was already used with a different campaign payload");
  if(!campaign) {
    const recipients=await findRecipients();
    if(targetUserId!==null && !recipients.length)throw new Error("Selected customer account was not found or is not active");
    await db.insert(notificationCampaigns).values({createdBy:adminId,eventKey,title,body,category:input.category,priority:input.priority,href,targetUserId:targetUserId??null,status:"draft",scheduledAt,expiresAt,totalRecipientCount:recipients.length}).onDuplicateKeyUpdate({set:{eventKey}});
    campaign=(await db.select().from(notificationCampaigns).where(and(eq(notificationCampaigns.createdBy,adminId),eq(notificationCampaigns.eventKey,eventKey))).limit(1))[0];
    if(!campaign)throw new Error("Announcement campaign persistence could not be confirmed");
    if(!matchesPayload(campaign))throw new Error("Announcement event key was already used with a different campaign payload");
  }
  if(campaign.status==="expired")throw new Error("Expired announcement campaigns cannot be republished");
  if(campaign.status==="withdrawn")throw new Error("Withdrawn announcement campaigns cannot be republished");
  if(campaign.expiresAt && campaign.expiresAt.getTime()<=now.getTime()) {
    const expiredUpdate=await db.update(notificationCampaigns).set({status:"expired"}).where(and(eq(notificationCampaigns.id,campaign.id),inArray(notificationCampaigns.status,["draft","scheduled","published","failed"])));
    if(Number(expiredUpdate[0]?.affectedRows||0)>0) {
      await db.update(notificationCampaignDeliveries).set({status:"expired"}).where(and(eq(notificationCampaignDeliveries.campaignId,campaign.id),or(eq(notificationCampaignDeliveries.status,"pending"),eq(notificationCampaignDeliveries.status,"failed"))));
      return {campaignId:campaign.id,recipientCount:0,totalRecipientCount:campaign.totalRecipientCount,readCount:0,failedCount:0,pendingCount:0,eventKey,targetUserId:targetUserId??null,status:"expired" as const};
    }
    campaign=(await db.select().from(notificationCampaigns).where(eq(notificationCampaigns.id,campaign.id)).limit(1))[0]!;
    if(campaign.status==="withdrawn")throw new Error("Withdrawn announcement campaigns cannot be republished");
    if(campaign.status==="expired")return {campaignId:campaign.id,recipientCount:0,totalRecipientCount:campaign.totalRecipientCount,readCount:0,failedCount:0,pendingCount:0,eventKey,targetUserId:targetUserId??null,status:"expired" as const};
  }
  if(campaign.status==="scheduled" && campaign.scheduledAt && campaign.scheduledAt.getTime()>now.getTime()) {
    const rows=await db.select({status:notificationCampaignDeliveries.status}).from(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId,campaign.id));
    return {campaignId:campaign.id,recipientCount:0,totalRecipientCount:rows.length,readCount:0,failedCount:rows.filter(x=>x.status==="failed").length,pendingCount:rows.filter(x=>x.status==="pending").length,eventKey,targetUserId:targetUserId??null,status:"scheduled" as const};
  }
  if(campaign.status==="draft") {
    const recipients=await findRecipients();
    if(targetUserId!==null && !recipients.length)throw new Error("Selected customer account was not found or is not active");
    for(const batch of partitionNotificationRecipients(recipients,50)) {
      if(batch.length)await db.insert(notificationCampaignDeliveries).values(batch.map(recipient=>({campaignId:campaign!.id,userId:recipient.id,status:"pending" as const}))).onDuplicateKeyUpdate({set:{campaignId:campaign!.id}});
    }
    const nextStatus=scheduledAt&&scheduledAt.getTime()>now.getTime()?"scheduled":"published";
    await db.update(notificationCampaigns).set({status:nextStatus,publishedAt:nextStatus==="published"?now:null,totalRecipientCount:recipients.length}).where(and(eq(notificationCampaigns.id,campaign.id),eq(notificationCampaigns.status,"draft")));
    campaign=(await db.select().from(notificationCampaigns).where(eq(notificationCampaigns.id,campaign.id)).limit(1))[0]!;
  } else if(campaign.status==="scheduled") {
    await db.update(notificationCampaigns).set({status:"published",publishedAt:now}).where(and(eq(notificationCampaigns.id,campaign.id),eq(notificationCampaigns.status,"scheduled")));
    campaign=(await db.select().from(notificationCampaigns).where(eq(notificationCampaigns.id,campaign.id)).limit(1))[0]!;
  }
  if(campaign.status==="scheduled" && campaign.scheduledAt && campaign.scheduledAt.getTime()>now.getTime()) {
    const rows=await db.select({status:notificationCampaignDeliveries.status}).from(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId,campaign.id));
    return {campaignId:campaign.id,recipientCount:0,totalRecipientCount:rows.length,readCount:0,failedCount:rows.filter(x=>x.status==="failed").length,pendingCount:rows.filter(x=>x.status==="pending").length,eventKey,targetUserId:targetUserId??null,status:"scheduled" as const};
  }
  if(campaign.status!=="published")throw new Error("Announcement campaign is not ready for delivery");
  const pending=await db.select({id:notificationCampaignDeliveries.id,userId:notificationCampaignDeliveries.userId}).from(notificationCampaignDeliveries).where(and(eq(notificationCampaignDeliveries.campaignId,campaign.id),or(eq(notificationCampaignDeliveries.status,"pending"),eq(notificationCampaignDeliveries.status,"failed"))));
  for(const batch of partitionNotificationRecipients(pending,50)) {
    await Promise.allSettled(batch.map(async delivery=>{
      const attemptedAt=new Date();
      try {
        const notificationId=await createNotification(delivery.userId,title,body,{eventKey:"admin-broadcast:"+adminId+":"+eventKey,category:input.category,priority:input.priority,href});
        // A campaign may be withdrawn or expired while this delivery is in flight.
        // Transition only a still-retryable row; never resurrect a terminal state.
        const deliveryUpdate=await db.update(notificationCampaignDeliveries).set({notificationId,status:"delivered",attemptedAt,deliveredAt:new Date(),errorCode:null}).where(and(eq(notificationCampaignDeliveries.id,delivery.id),inArray(notificationCampaignDeliveries.status,["pending","failed"])));
        if(Number(deliveryUpdate[0]?.affectedRows||0)===0) {
          // Link the created row for suppression/audit, but preserve withdrawn,
          // expired, read, or already-delivered status and its error code.
          await db.update(notificationCampaignDeliveries).set({notificationId,attemptedAt,deliveredAt:new Date()}).where(eq(notificationCampaignDeliveries.id,delivery.id));
        }
      } catch(error) {
        try { await db.update(notificationCampaignDeliveries).set({status:"failed",attemptedAt,errorCode:"DELIVERY_FAILED"}).where(and(eq(notificationCampaignDeliveries.id,delivery.id),inArray(notificationCampaignDeliveries.status,["pending","failed"]))); } catch {}
        console.error("[Notifications] Announcement recipient delivery failed:",error instanceof Error?error.name:"UnknownError");
      }
    }));
  }
  const deliveries=await db.select({status:notificationCampaignDeliveries.status}).from(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId,campaign.id));
  const recipientCount=deliveries.filter(row=>row.status==="delivered"||row.status==="read").length;
  const readCount=deliveries.filter(row=>row.status==="read").length;
  const failedCount=deliveries.filter(row=>row.status==="failed").length;
  const pendingCount=deliveries.filter(row=>row.status==="pending").length;
  await db.update(notificationCampaigns).set({totalRecipientCount:deliveries.length}).where(eq(notificationCampaigns.id,campaign.id));
  return {campaignId:campaign.id,recipientCount,totalRecipientCount:deliveries.length,readCount,failedCount,pendingCount,eventKey,targetUserId:targetUserId??null,status:"published" as const};
}

export async function retryNotificationCampaign(adminId:number,campaignId:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  if(!Number.isSafeInteger(adminId)||adminId<=0)throw new RangeError("Broadcast administrator must be a positive integer user ID");
  const campaign=(await db.select().from(notificationCampaigns).where(eq(notificationCampaigns.id,campaignId)).limit(1))[0];
  if(!campaign)throw new Error("Announcement campaign not found");
  return broadcastCustomerNotification(campaign.createdBy,{title:campaign.title,body:campaign.body,eventKey:campaign.eventKey,category:campaign.category as AdminBroadcastCategory,priority:campaign.priority as NotificationPriority,href:campaign.href,targetUserId:campaign.targetUserId,scheduledAt:campaign.scheduledAt?.toISOString()??null,expiresAt:campaign.expiresAt?.toISOString()??null});
}

export async function withdrawNotificationCampaign(adminId:number,campaignId:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  if(!Number.isSafeInteger(adminId)||adminId<=0)throw new RangeError("Withdrawal administrator must be a positive integer user ID");
  if(!Number.isSafeInteger(campaignId)||campaignId<=0)throw new RangeError("Campaign ID must be a positive integer");
  return db.transaction(async tx=>{
    const actor=(await tx.select({id:users.id,role:users.role}).from(users).where(eq(users.id,adminId)).limit(1).for("update"))[0];
    if(!actor||actor.role!=="admin")throw new Error("Only administrators can withdraw announcement campaigns");
    const campaign=(await tx.select().from(notificationCampaigns).where(eq(notificationCampaigns.id,campaignId)).limit(1).for("update"))[0];
    if(!campaign)throw new Error("Announcement campaign not found");
    if(campaign.status==="withdrawn")return {success:true,changed:false,status:"withdrawn" as const};
    if(campaign.status==="expired")return {success:true,changed:false,status:"expired" as const};
    if(!["draft","scheduled","published","failed"].includes(campaign.status))throw new Error("Announcement campaign cannot be withdrawn from its current state");
    await tx.update(notificationCampaigns).set({status:"withdrawn",updatedAt:new Date()}).where(and(eq(notificationCampaigns.id,campaign.id),eq(notificationCampaigns.status,campaign.status)));
    await tx.update(notificationCampaignDeliveries).set({status:"withdrawn",errorCode:"CAMPAIGN_WITHDRAWN"}).where(and(eq(notificationCampaignDeliveries.campaignId,campaign.id),or(eq(notificationCampaignDeliveries.status,"pending"),eq(notificationCampaignDeliveries.status,"failed"))));
    await tx.insert(v5AuditEvents).values({actorUserId:adminId,action:"notification.campaign.withdrawn",entityType:"notification_campaign",entityId:String(campaign.id),reason:"Administrator withdrew announcement campaign",reference:campaign.eventKey,metadataJson:JSON.stringify({previousStatus:campaign.status,totalRecipientCount:campaign.totalRecipientCount})});
    return {success:true,changed:true,status:"withdrawn" as const};
  });
}

export async function processNotificationCampaignLifecycle() {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const now=new Date();
  let expiredCount=0;
  const expired=await db.select().from(notificationCampaigns).where(and(inArray(notificationCampaigns.status,["draft","scheduled","published","failed"]),lte(notificationCampaigns.expiresAt,now))).limit(100);
  for(const campaign of expired) {
    const changed=await db.update(notificationCampaigns).set({status:"expired"}).where(and(eq(notificationCampaigns.id,campaign.id),inArray(notificationCampaigns.status,["draft","scheduled","published","failed"])));
    if(Number(changed[0]?.affectedRows||0)>0) {
      expiredCount++;
      await db.update(notificationCampaignDeliveries).set({status:"expired"}).where(and(eq(notificationCampaignDeliveries.campaignId,campaign.id),or(eq(notificationCampaignDeliveries.status,"pending"),eq(notificationCampaignDeliveries.status,"failed"))));
    }
  }
  const due=await db.select().from(notificationCampaigns).where(and(eq(notificationCampaigns.status,"scheduled"),lte(notificationCampaigns.scheduledAt,now))).limit(100);
  let published=0,failed=0,expiredDuringPublish=0;
  for(const campaign of due) {
    try {
      const result=await broadcastCustomerNotification(campaign.createdBy,{title:campaign.title,body:campaign.body,eventKey:campaign.eventKey,category:campaign.category as AdminBroadcastCategory,priority:campaign.priority as NotificationPriority,href:campaign.href,targetUserId:campaign.targetUserId,scheduledAt:campaign.scheduledAt?.toISOString()??null,expiresAt:campaign.expiresAt?.toISOString()??null});
      // A campaign can expire between the initial expiry sweep and this due batch.
      // Count the actual persisted outcome, not merely a non-throwing function call.
      if(result.status==="published") published++;
      else if(result.status==="expired") expiredDuringPublish++;
    } catch(error) {
      failed++;
      const details = error && typeof error === "object" ? error as { name?: unknown; message?: unknown; code?: unknown; table?: unknown } : {};
      const message = typeof details.message === "string"
        ? details.message.replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]").slice(0, 500)
        : "No error message was provided";
      const code = details.code == null ? undefined : String(details.code).replace(/[^A-Z0-9_]/gi, "").slice(0, 80);
      const table = details.table == null ? undefined : String(details.table).replace(/[^A-Z0-9_]/gi, "").slice(0, 120);
      console.error("[Notifications] Scheduled announcement lifecycle failed", {
        name: typeof details.name === "string" ? details.name.slice(0, 80) : "UnknownError",
        code,
        table,
        message,
      });
    }
  }
  return {expired:expiredCount+expiredDuringPublish,published,failed};
}
export async function listAdminNotificationCampaigns() {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const campaigns=await db.select().from(notificationCampaigns).orderBy(desc(notificationCampaigns.createdAt)).limit(100);
  const counts=await db.select({
    campaignId:notificationCampaignDeliveries.campaignId,
    status:notificationCampaignDeliveries.status,
    count:sql<number>`COUNT(*)`,
  }).from(notificationCampaignDeliveries).where(inArray(notificationCampaignDeliveries.campaignId,campaigns.map(campaign=>campaign.id))).groupBy(notificationCampaignDeliveries.campaignId,notificationCampaignDeliveries.status);
  const byCampaign=new Map<number,{total:number;delivered:number;read:number;failed:number;pending:number;expired:number;withdrawn:number}>();
  for(const row of counts) {
    const summary=byCampaign.get(row.campaignId)??{total:0,delivered:0,read:0,failed:0,pending:0,expired:0,withdrawn:0};
    const count=Number(row.count)||0;
    summary.total+=count;
    if(row.status==="delivered") summary.delivered+=count;
    if(row.status==="read") { summary.read+=count; summary.delivered+=count; }
    if(row.status==="failed") summary.failed+=count;
    if(row.status==="pending") summary.pending+=count;
    if(row.status==="expired") summary.expired+=count;
    if(row.status==="withdrawn") summary.withdrawn+=count;
    byCampaign.set(row.campaignId,summary);
  }
  return campaigns.map(campaign=>({
    ...campaign,
    delivery:byCampaign.get(campaign.id)??{total:0,delivered:0,read:0,failed:0,pending:0,expired:0,withdrawn:0},
  }));
}
export async function getNotificationCategoryVisibility():Promise<Record<NotificationCategory,boolean>> {
  const defaults=Object.fromEntries(NOTIFICATION_CATEGORIES.map(category=>[category,true])) as Record<NotificationCategory,boolean>;
  const raw=await getAppSetting("notification.categoryVisibility");
  if(!raw)return defaults;
  try { const parsed=JSON.parse(raw) as Record<string,unknown>; for(const category of NOTIFICATION_CATEGORIES) if(typeof parsed[category]==="boolean") defaults[category]=parsed[category] as boolean; } catch {}
  return defaults;
}
export async function setNotificationCategoryVisibility(input:Record<NotificationCategory,boolean>,updatedBy:number) {
  const normalized=Object.fromEntries(NOTIFICATION_CATEGORIES.map(category=>[category,input[category]!==false])) as Record<NotificationCategory,boolean>;
  await setAppSetting("notification.categoryVisibility",JSON.stringify(normalized),updatedBy);
  return normalized;
}
async function getSuppressedCampaignNotificationIds(userId:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const rows=await db.select({notificationId:notificationCampaignDeliveries.notificationId}).from(notificationCampaignDeliveries)
    .innerJoin(notificationCampaigns,eq(notificationCampaigns.id,notificationCampaignDeliveries.campaignId))
    .where(and(eq(notificationCampaignDeliveries.userId,userId),inArray(notificationCampaigns.status,["expired","withdrawn"]),sql`${notificationCampaignDeliveries.notificationId} IS NOT NULL`));
  return rows.map(row=>row.notificationId).filter((id):id is number=>id!==null);
}
import { decodeNotificationCursor, encodeNotificationCursor, normalizeNotificationPageSize } from "./modules/notification-pagination";

async function getVisibleNotificationConditions(userId:number,visibility:Record<NotificationCategory,boolean>,expiredIds:number[]) {
  const conditions=[eq(customerNotifications.userId,userId)];
  const disabled=NOTIFICATION_CATEGORIES.filter(category=>visibility[category]===false);
  if(disabled.length) {
    const categoryVisibilityCondition=or(isNull(customerNotifications.category),notInArray(customerNotifications.category,disabled));
    if(categoryVisibilityCondition)conditions.push(categoryVisibilityCondition);
  }
  if(expiredIds.length)conditions.push(notInArray(customerNotifications.id,expiredIds));
  return conditions;
}

async function countUnreadWithFilters(userId:number,visibility:Record<NotificationCategory,boolean>,expiredIds:number[]) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const conditions=await getVisibleNotificationConditions(userId,visibility,expiredIds);
  conditions.push(isNull(customerNotifications.readAt));
  const [row]=await db.select({total:count()}).from(customerNotifications).where(and(...conditions));
  return Number(row?.total)||0;
}

export async function getCustomerNotificationUnreadCount(userId:number) {
  const [visibility,expiredIds]=await Promise.all([getNotificationCategoryVisibility(),getSuppressedCampaignNotificationIds(userId)]);
  return countUnreadWithFilters(userId,visibility,expiredIds);
}

export async function listCustomerNotificationPage(userId:number,cursorValue?:string|null,requestedLimit?:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const limit=normalizeNotificationPageSize(requestedLimit);
  const [visibility,expiredIds]=await Promise.all([
    getNotificationCategoryVisibility(),
    getSuppressedCampaignNotificationIds(userId),
  ]);
  const conditions=await getVisibleNotificationConditions(userId,visibility,expiredIds);
  if(cursorValue!=null) {
    const cursor=decodeNotificationCursor(cursorValue);
    if(!cursor)throw new Error("Invalid notification history cursor");
    const cursorCondition=or(
      lt(customerNotifications.createdAt,cursor.createdAt),
      and(eq(customerNotifications.createdAt,cursor.createdAt),lt(customerNotifications.id,cursor.id)),
    );
    if(cursorCondition)conditions.push(cursorCondition);
  }
  const rows=await db.select().from(customerNotifications).where(and(...conditions))
    .orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)).limit(limit+1);
  const hasMore=rows.length>limit;
  const items=filterNotificationCategories(rows.slice(0,limit),visibility);
  const last=items[items.length-1];
  return {
    items,
    cursor:cursorValue??null,
    nextCursor:hasMore&&last?encodeNotificationCursor(last.createdAt,last.id):null,
    pageSize:limit,
  };
}

export async function listCustomerNotifications(userId:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const [visibility,expiredIds]=await Promise.all([getNotificationCategoryVisibility(),getSuppressedCampaignNotificationIds(userId)]);
  const conditions=await getVisibleNotificationConditions(userId,visibility,expiredIds);
  const rows=await db.select().from(customerNotifications).where(and(...conditions))
    .orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)).limit(50);
  return filterNotificationCategories(rows,visibility);
}
export async function listNotifications(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(customerNotifications).where(eq(customerNotifications.userId,userId)).orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)); }
export async function listNotificationEventCursor(userId:number) {
  const db=await getDb(); if(!db)throw new Error("Database is not available");
  const visibility=await getNotificationCategoryVisibility();
  const disabled=NOTIFICATION_CATEGORIES.filter(category=>visibility[category]===false);
  const expiredIds=await getSuppressedCampaignNotificationIds(userId);
  const conditions=[eq(customerNotifications.userId,userId)];
  // Preserve legacy/unknown-category events exactly as the shared visibility filter does.
  // SQL NOT IN evaluates to UNKNOWN for NULL, which would otherwise hide these rows.
  if(disabled.length) {
    const categoryVisibilityCondition = or(isNull(customerNotifications.category),notInArray(customerNotifications.category,disabled));
    // Drizzle types `or()` as possibly undefined even with two arguments; only add a real predicate.
    if(categoryVisibilityCondition) conditions.push(categoryVisibilityCondition);
  }
  if(expiredIds.length)conditions.push(notInArray(customerNotifications.id,expiredIds));
  const rows=await db.select({id:customerNotifications.id,category:customerNotifications.category,readAt:customerNotifications.readAt}).from(customerNotifications).where(and(...conditions)).orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)).limit(500);
  return filterVisibleNotificationEventCursor(rows,visibility);
}
export async function markCustomerNotificationsRead(userId:number, notificationId?:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const condition=notificationId
    ? and(eq(customerNotifications.userId,userId),eq(customerNotifications.id,notificationId))
    : and(eq(customerNotifications.userId,userId),sql`${customerNotifications.readAt} IS NULL`);
  await db.update(customerNotifications).set({readAt:new Date()}).where(condition);
  const readRows=await db.select({id:customerNotifications.id}).from(customerNotifications)
    .innerJoin(notificationCampaignDeliveries,eq(notificationCampaignDeliveries.notificationId,customerNotifications.id))
    .where(and(eq(customerNotifications.userId,userId),eq(notificationCampaignDeliveries.userId,userId),eq(notificationCampaignDeliveries.status,"delivered"),sql`${customerNotifications.readAt} IS NOT NULL`));
  const ids=readRows.map(row=>row.id);
  if(ids.length) await db.update(notificationCampaignDeliveries).set({status:"read",readAt:new Date()})
    .where(and(eq(notificationCampaignDeliveries.userId,userId),inArray(notificationCampaignDeliveries.notificationId,ids),eq(notificationCampaignDeliveries.status,"delivered")));
  return listCustomerNotifications(userId);
}
export async function getCustomerWalletPreferences(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); let row=(await db.select().from(customerWalletPreferences).where(eq(customerWalletPreferences.userId,userId)).limit(1))[0]; if(!row){await db.insert(customerWalletPreferences).values({userId}); row=(await db.select().from(customerWalletPreferences).where(eq(customerWalletPreferences.userId,userId)).limit(1))[0];} return row; }
export async function updateCustomerWalletPreferences(userId:number,input:{tradingCurrency?:string;swapCurrency?:string;autoTopUpEnabled?:boolean;withdrawalWhitelistEnabled?:boolean}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await getCustomerWalletPreferences(userId); const values:any={...input}; if(values.tradingCurrency) values.tradingCurrency=values.tradingCurrency.toUpperCase(); if(values.swapCurrency) values.swapCurrency=values.swapCurrency.toUpperCase(); await db.update(customerWalletPreferences).set(values).where(eq(customerWalletPreferences.userId,userId)); return getCustomerWalletPreferences(userId); }
export async function getCustomerOpportunityRules(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); let row=(await db.select().from(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId)).limit(1))[0]; if(!row){await db.insert(customerOpportunityRules).values({userId}); row=(await db.select().from(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId)).limit(1))[0];} return row; }
export async function updateCustomerOpportunityRules(userId:number,input:{enabled?:boolean;minimumRewardBps?:number;maxDailyAllocationMinor?:number;allowedAssets?:string;quietHoursStart?:string;quietHoursEnd?:string}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await getCustomerOpportunityRules(userId); const values:any={...input}; if(values.allowedAssets) values.allowedAssets=values.allowedAssets.toUpperCase().replace(/\s+/g,""); await db.update(customerOpportunityRules).set(values).where(eq(customerOpportunityRules.userId,userId)); return getCustomerOpportunityRules(userId); }

export async function addTicketAttachment(userId:number,input:{ticketId:number;fileName:string;mimeType:string;sizeBytes:number;storageKey:string}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const policy=await getTicketUploadPolicy();
  if(!isAllowedAttachmentRequest({fileName:input.fileName,mimeType:input.mimeType,sizeBytes:input.sizeBytes},{maxAttachmentMb:policy.maxAttachmentMb,allowedMimeTypes:policy.allowedMimeTypes})) throw new Error("Attachment does not meet the current upload policy");
  if(!isSupportAttachmentStorageKeyForTicket(input.storageKey,input.ticketId)) throw new Error("Invalid support attachment storage key for this ticket");
  const ticket=(await db.select().from(supportTickets).where(and(eq(supportTickets.id,input.ticketId),eq(supportTickets.customerId,userId))).limit(1))[0];
  if(!ticket) throw new Error("Ticket not found");
  // A storage key identifies one private object. Never allow a second ticket to
  // claim an existing key, including a legacy-format key issued before the
  // ticket-scoped key format was deployed.
  const existingKey=(await db.select({id:supportAttachments.id}).from(supportAttachments).where(eq(supportAttachments.storageKey,input.storageKey)).limit(1))[0];
  if(existingKey) throw new Error("Attachment storage key has already been registered");
  await db.insert(supportAttachments).values({ticketId:input.ticketId,uploadedBy:userId,fileName:input.fileName.slice(0,255),mimeType:input.mimeType.slice(0,160),sizeBytes:input.sizeBytes,storageKey:input.storageKey.slice(0,512)});
  return {success:true};
}
export async function getTicketAttachmentAccess(storageKey:string) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({ticketId:supportTickets.id,customerId:supportTickets.customerId})
    .from(supportAttachments)
    .innerJoin(supportTickets,eq(supportTickets.id,supportAttachments.ticketId))
    .where(eq(supportAttachments.storageKey,storageKey));
  // Fail closed if legacy data or a concurrent registration ever creates
  // duplicate claims for the same object; never choose an arbitrary owner.
  if(rows.length!==1) return null;
  return rows[0] ?? null;
}

// Controlled opportunity engine: this is an internal paper-ledger boundary. Real execution requires licensed providers/custody.
// Legacy Starter/Growth/Pro/Institutional defaults are no longer seeded.
// Trading entitlements now come from the canonical package catalogue and subscriptions.
export async function provisionSignupCredit(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const amount = Number(await getAppSetting("signup.autoCreditMinor"));
  const currency = (await getAppSetting("signup.autoCreditCurrency")) || "USD";
  if (!Number.isSafeInteger(amount) || amount <= 0) return;

  const credited = await db.transaction(async (tx) => {
    // Serialize concurrent signup provisioning, and keep the idempotency read,
    // wallet mutation, and ledger append within the same rollback boundary.
    const userLock = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`) as any;
    if (!userLock?.[0]?.[0]?.id) throw new Error("Customer account was not found for signup credit");

    const existing = await tx.select().from(balanceLedger)
      .where(and(eq(balanceLedger.userId, userId), eq(balanceLedger.entryType, "signup_credit")))
      .limit(1).for("update");
    if (existing[0]) {
      return {
        amountMinor: Number(existing[0].amountMinor),
        currency: String(existing[0].currency),
      };
    }

    const balance = (await tx.select().from(customerBalances)
      .where(and(eq(customerBalances.userId, userId), eq(customerBalances.currency, currency)))
      .limit(1).for("update"))[0];
    if (balance) {
      const available = Number(balance.availableMinor);
      const promotional = Number(balance.promotionalMinor);
      if (
        !Number.isSafeInteger(available) || available < 0 ||
        !Number.isSafeInteger(promotional) || promotional < 0 ||
        !Number.isSafeInteger(available + amount) ||
        !Number.isSafeInteger(promotional + amount)
      ) {
        throw new Error("Signup credit wallet amounts are inconsistent or exceed safe integer precision");
      }
      const updated = await tx.update(customerBalances).set({
        availableMinor: available + amount,
        promotionalMinor: promotional + amount,
        updatedAt: new Date(),
      }).where(eq(customerBalances.id, balance.id));
      if (Number((updated as any)[0]?.affectedRows || 0) !== 1) {
        throw new Error("Signup credit wallet update did not affect exactly one row");
      }
    } else {
      await tx.insert(customerBalances).values({
        userId,
        currency,
        availableMinor: amount,
        promotionalMinor: amount,
        earnedMinor: 0,
      });
    }

    await tx.insert(balanceLedger).values({
      userId,
      currency,
      amountMinor: amount,
      entryType: "signup_credit",
      reference: "signup-" + userId,
      withdrawable: false,
    });
    return { amountMinor: amount, currency };
  });

  // Notifications are best-effort after commit: a delivery failure cannot undo
  // the wallet/ledger pair, and an idempotent call can retry the notice safely.
  const notifySignupCredit = async (creditedAmount: number, creditedCurrency: string) => {
    try {
      await createNotification(
        userId,
        "Signup credit added",
        "A signup credit of " + creditedAmount + " minor units was added to your " + creditedCurrency + " wallet. This credit is not withdrawable.",
        { eventKey: "signup-credit:" + userId, category: "ledger_credit", priority: "normal" }
      );
    } catch (error) {
      console.error("[Notifications] Signup credit notice failed after ledger persistence:", error instanceof Error ? error.name : "UnknownError");
    }
  };
  await notifySignupCredit(credited.amountMinor, credited.currency);
}
const defaultCurrencies=[{code:"USD",name:"US Dollar",symbol:"$",scale:2,assetType:"fiat" as const,usdRate:"1",rateProvider:"manual",externalCode:"USD",enabled:true},{code:"EUR",name:"Euro",symbol:"€",scale:2,assetType:"fiat" as const,usdRate:"1.08",rateProvider:"manual",externalCode:"EUR",enabled:true},{code:"GBP",name:"British Pound",symbol:"£",scale:2,assetType:"fiat" as const,usdRate:"1.27",rateProvider:"manual",externalCode:"GBP",enabled:true},{code:"BTC",name:"Bitcoin",symbol:"₿",scale:8,assetType:"crypto" as const,usdRate:"65000",rateProvider:"manual",externalCode:"BTC",enabled:true},{code:"ETH",name:"Ethereum",symbol:"Ξ",scale:8,assetType:"crypto" as const,usdRate:"3500",rateProvider:"manual",externalCode:"ETH",enabled:true}];
export async function listCurrencies(){const db=await getDb();if(!db)throw new Error("Database is not available");let rows=await db.select().from(currencyRegistry).where(eq(currencyRegistry.enabled,true));if(!rows.length){for(const c of defaultCurrencies)await db.insert(currencyRegistry).values(c).onDuplicateKeyUpdate({set:{name:c.name,symbol:c.symbol,scale:c.scale,usdRate:c.usdRate}});rows=await db.select().from(currencyRegistry).where(eq(currencyRegistry.enabled,true));}return rows;}
export async function upsertCurrency(input:{code:string;name:string;symbol:string;scale:number;assetType:"fiat"|"crypto"|"token";usdRate:string;rateProvider:string;externalCode?:string;enabled?:boolean}){const db=await getDb();if(!db)throw new Error("Database is not available");const code=input.code.trim().toUpperCase();if(!/^[A-Z0-9._-]{2,32}$/.test(code))throw new Error("Currency code must be 2-32 letters or numbers");if(!/^[0-9]+(\\.[0-9]+)?$/.test(input.usdRate)||Number(input.usdRate)<=0)throw new Error("USD rate must be a positive decimal");await db.insert(currencyRegistry).values({...input,code,enabled:input.enabled??true}).onDuplicateKeyUpdate({set:{name:input.name.trim(),symbol:input.symbol.trim(),scale:input.scale,assetType:input.assetType,usdRate:input.usdRate,rateProvider:input.rateProvider.trim(),externalCode:input.externalCode||null,enabled:input.enabled??true}});return (await db.select().from(currencyRegistry).where(eq(currencyRegistry.code,code)).limit(1))[0];}
export async function listBalances(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");const currencies=await listCurrencies();const existing=await db.select().from(customerBalances).where(eq(customerBalances.userId,userId));const byCode=new Map(existing.map(x=>[x.currency,x]));return currencies.map(c=>byCode.get(c.code)||{id:0,userId,currency:c.code,availableMinor:0,lockedMinor:0,promotionalMinor:0,earnedMinor:0,updatedAt:null});}
export async function getCustomerBalanceSummary(userId:number){const currencies=await listCurrencies();const balances=await listBalances(userId);const byCode=new Map(balances.map(x=>[x.currency,x]));let availableUsd=0,lockedUsd=0,promotionalUsd=0,earnedUsd=0;for(const c of currencies){const b=byCode.get(c.code);const factor=Math.pow(10,c.scale);const rate=Number(c.usdRate)||0;availableUsd+=(Number(b?.availableMinor||0)/factor)*rate;lockedUsd+=(Number(b?.lockedMinor||0)/factor)*rate;promotionalUsd+=(Number(b?.promotionalMinor||0)/factor)*rate;earnedUsd+=(Number(b?.earnedMinor||0)/factor)*rate;}return {balances,currencies,summary:{availableUsd,lockedUsd,promotionalUsd,earnedUsd,totalUsd:availableUsd+lockedUsd}};}


const PAYOUT_ASSET_CODES = new Set(["USD", "EUR", "GBP", "BTC", "ETH", "USDT"]);

function parseTotpRecoveryHashes(serialized: string | null | undefined): string[] | null {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed) || parsed.length > 10) return null;
    if (!parsed.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash))) return null;
    if (new Set(parsed).size !== parsed.length) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function createTotpRecoveryCodeSet() {
  const codes = generateTotpRecoveryCodes();
  const hashes = codes.map((code) => hashTotpRecoveryCode(code));
  if (hashes.some((hash) => hash === null)) throw new Error("Could not generate valid authenticator recovery codes.");
  return { codes, hashes: hashes as string[] };
}

export async function getCustomerAuthenticatorStatus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const row = (await db.select({
    confirmedAt: customerTotpAuthenticators.confirmedAt,
    pendingExpiresAt: customerTotpAuthenticators.pendingExpiresAt,
    recoveryCodesHash: customerTotpAuthenticators.recoveryCodesHash,
  }).from(customerTotpAuthenticators).where(eq(customerTotpAuthenticators.userId, userId)).limit(1))[0];
  const pendingIsActive = Boolean(row?.pendingExpiresAt && new Date(row.pendingExpiresAt).getTime() > Date.now());
  return {
    enabled: Boolean(row?.confirmedAt),
    enrollmentPending: pendingIsActive && !row?.confirmedAt,
    replacementPending: pendingIsActive && Boolean(row?.confirmedAt),
    recoveryCodesRemaining: parseTotpRecoveryHashes(row?.recoveryCodesHash)?.length ?? 0,
  };
}

export async function startCustomerAuthenticatorEnrollment(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async (tx) => {
    // Serialize enrollment starts for the account before reading or creating its
    // authenticator row. This also makes repeated requests safe under double-clicks.
    const user = (await tx.select({ id: users.id, role: users.role, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user") throw new Error("Customer account was not found.");

    const existing = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (existing?.confirmedAt) {
      throw new Error("An authenticator is already enabled. Contact support for the verified account-recovery process.");
    }

    const now = Date.now();
    const existingExpiry = existing?.pendingExpiresAt ? new Date(existing.pendingExpiresAt).getTime() : 0;
    if (existing?.pendingSecretCiphertext && existingExpiry > now) {
      // Keep the same credential during the active setup window so concurrent tabs
      // cannot invalidate one another's QR code or provisioning URI.
      const secret = decryptTotpSecret(existing.pendingSecretCiphertext);
      return {
        secret,
        provisioningUri: totpProvisioningUri(secret, user.email || `customer-${userId}`),
        expiresAt: existing.pendingExpiresAt!,
      };
    }

    const secret = generateTotpSecret();
    const pendingExpiresAt = new Date((Math.floor(now / 1000) + 10 * 60) * 1000);
    const pendingSecretCiphertext = encryptTotpSecret(secret);
    if (existing) {
      await tx.update(customerTotpAuthenticators).set({ pendingSecretCiphertext, pendingExpiresAt, updatedAt: new Date(now) })
        .where(eq(customerTotpAuthenticators.userId, userId));
    } else {
      await tx.insert(customerTotpAuthenticators).values({ userId, pendingSecretCiphertext, pendingExpiresAt, lastUsedStep: -1 });
    }
    return {
      secret,
      provisioningUri: totpProvisioningUri(secret, user.email || `customer-${userId}`),
      expiresAt: pendingExpiresAt,
    };
  });
}

export async function confirmCustomerAuthenticatorEnrollment(userId: number, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your authenticator app.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (!row?.pendingSecretCiphertext || !row.pendingExpiresAt || new Date(row.pendingExpiresAt).getTime() <= Date.now()) {
      throw new Error("Authenticator setup has expired. Start setup again.");
    }
    if (row.confirmedAt) throw new Error("An authenticator is already enabled.");
    const secret = decryptTotpSecret(row.pendingSecretCiphertext);
    const step = verifyTotpCode(secret, code, Date.now(), -1);
    if (step === null) throw new Error("The authenticator code is invalid or expired. Check your device time and try again.");
    const recovery = createTotpRecoveryCodeSet();
    await tx.update(customerTotpAuthenticators).set({
      secretCiphertext: row.pendingSecretCiphertext,
      pendingSecretCiphertext: null,
      pendingExpiresAt: null,
      confirmedAt: new Date(),
      lastUsedStep: step,
      recoveryCodesHash: JSON.stringify(recovery.hashes),
      updatedAt: new Date(),
    }).where(eq(customerTotpAuthenticators.userId, userId));
    return { enabled: true, recoveryCodes: recovery.codes };
  });
}

export async function generateCustomerAuthenticatorRecoveryCodes(userId: number, currentCode: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
    const user = (await tx.select({ id: users.id, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user") throw new Error("Customer account was not found.");
    const row = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (!row?.confirmedAt || !row.secretCiphertext) throw new Error("Set up and confirm an authenticator before generating recovery codes.");
    const step = verifyTotpCode(decryptTotpSecret(row.secretCiphertext), currentCode, Date.now(), Number(row.lastUsedStep ?? -1));
    if (step === null) throw new Error("The current authenticator code is invalid, expired, or has already been used.");
    const recovery = createTotpRecoveryCodeSet();
    await tx.update(customerTotpAuthenticators).set({
      lastUsedStep: step,
      recoveryCodesHash: JSON.stringify(recovery.hashes),
      updatedAt: new Date(),
    }).where(eq(customerTotpAuthenticators.userId, userId));
    return { recoveryCodes: recovery.codes };
  });
}

export async function startCustomerAuthenticatorRecoveryReplacement(userId: number, recoveryCode: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
    const user = (await tx.select({ id: users.id, role: users.role, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user") throw new Error("Customer account was not found.");
    const row = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (!row?.confirmedAt || !row.secretCiphertext) throw new Error("No enabled authenticator is available to recover.");
    const storedHashes = parseTotpRecoveryHashes(row.recoveryCodesHash);
    const remainingHashes = consumeTotpRecoveryCode(recoveryCode, storedHashes);
    if (!remainingHashes) throw new Error("The recovery code is invalid or has already been used. Use a saved unused recovery code.");
    const secret = generateTotpSecret();
    const pendingExpiresAt = new Date((Math.floor(Date.now() / 1000) + 10 * 60) * 1000);
    await tx.update(customerTotpAuthenticators).set({
      pendingSecretCiphertext: encryptTotpSecret(secret),
      pendingExpiresAt,
      recoveryCodesHash: JSON.stringify(remainingHashes),
      updatedAt: new Date(),
    }).where(eq(customerTotpAuthenticators.userId, userId));
    return {
      secret,
      provisioningUri: totpProvisioningUri(secret, user.email || `customer-${userId}`),
      expiresAt: pendingExpiresAt,
    };
  });
}

export async function startCustomerAuthenticatorReplacement(userId: number, currentCode: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async (tx) => {
    const user = (await tx.select({ id: users.id, role: users.role, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user") throw new Error("Customer account was not found.");
    const row = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (!row?.confirmedAt || !row.secretCiphertext) {
      throw new Error("Set up and confirm an authenticator before replacing it.");
    }

    const currentSecret = decryptTotpSecret(row.secretCiphertext);
    const usedStep = verifyTotpCode(currentSecret, currentCode, Date.now(), Number(row.lastUsedStep ?? -1));
    if (usedStep === null) throw new Error("The current authenticator code is invalid, expired, or has already been used.");

    const secret = generateTotpSecret();
    const pendingExpiresAt = new Date((Math.floor(Date.now() / 1000) + 10 * 60) * 1000);
    await tx.update(customerTotpAuthenticators).set({
      lastUsedStep: usedStep,
      pendingSecretCiphertext: encryptTotpSecret(secret),
      pendingExpiresAt,
      updatedAt: new Date(),
    }).where(eq(customerTotpAuthenticators.userId, userId));

    return {
      secret,
      provisioningUri: totpProvisioningUri(secret, user.email || `customer-${userId}`),
      expiresAt: pendingExpiresAt,
    };
  });
}

export async function confirmCustomerAuthenticatorReplacement(userId: number, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your new authenticator app.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async (tx) => {
    const row = (await tx.select().from(customerTotpAuthenticators)
      .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (!row?.confirmedAt || !row.secretCiphertext) {
      throw new Error("No enabled authenticator is available to replace.");
    }
    if (!row.pendingSecretCiphertext || !row.pendingExpiresAt || new Date(row.pendingExpiresAt).getTime() <= Date.now()) {
      throw new Error("Authenticator replacement has expired. Start replacement again.");
    }

    const newSecret = decryptTotpSecret(row.pendingSecretCiphertext);
    // The pending key is a new credential, so its confirmation counter is independent
    // of counters previously consumed by the old authenticator.
    const step = verifyTotpCode(newSecret, code, Date.now(), -1);
    if (step === null) throw new Error("The new authenticator code is invalid or expired. Check your device time and try again.");

    await tx.update(customerTotpAuthenticators).set({
      secretCiphertext: row.pendingSecretCiphertext,
      pendingSecretCiphertext: null,
      pendingExpiresAt: null,
      confirmedAt: new Date(),
      lastUsedStep: step,
      updatedAt: new Date(),
    }).where(eq(customerTotpAuthenticators.userId, userId));
    return { enabled: true };
  });
}

async function consumePayoutAuthenticatorCode(tx: any, userId: number, code: string | undefined) {
  const row = (await tx.select().from(customerTotpAuthenticators)
    .where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
  if (!row?.confirmedAt || !row.secretCiphertext) {
    throw new Error("Set up and confirm an authenticator before requesting a payout.");
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Enter the current six-digit authenticator code to request a payout.");
  }
  const secret = decryptTotpSecret(row.secretCiphertext);
  const step = verifyTotpCode(secret, code, Date.now(), Number(row.lastUsedStep ?? -1));
  if (step === null) throw new Error("The authenticator code is invalid, expired, or has already been used.");
  await tx.update(customerTotpAuthenticators).set({ lastUsedStep: step, updatedAt: new Date() })
    .where(eq(customerTotpAuthenticators.userId, userId));
}

type CustomerPayoutInput = {
  currency: "USD" | "EUR" | "GBP" | "BTC" | "ETH" | "USDT";
  amountMinor: number;
  destinationType: "bank_transfer" | "crypto_transfer";
  destinationDetails: string;
  idempotencyKey: string;
  totpCode?: string;
};

type PayoutResolutionInput = {
  requestId: number;
  action: "paid" | "rejected";
  externalReference?: string;
  note?: string;
};

function normalizePayoutDestinationDetails(value: string) {
  const normalized = String(value ?? "").replace(/\0/g, "").trim();
  if (normalized.length < 8) throw new Error("Enter the required bank beneficiary details or public wallet address and network.");
  if (normalized.length > 1000) throw new Error("Payout destination details must be 1,000 characters or fewer.");
  return normalized;
}

function payoutIdempotencyKey(userId: number, rawKey: string) {
  const value = String(rawKey ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new Error("A valid payout idempotency key is required.");
  return `payout:${userId}:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

async function assertPayoutPolicyAllowsRequest(tx: any, userId: number, totpCode?: string) {
  const policyRow = (await tx.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, "policy.defaults")).limit(1).for("update"))[0];
  let policy: Record<string, unknown>;
  try {
    if (!policyRow) throw new Error("Policy is not configured");
    const parsed = JSON.parse(String(policyRow.settingValue || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid policy shape");
    policy = parsed as Record<string, unknown>;
  } catch {
    throw new Error("Payout requests are unavailable until global withdrawal policy is explicitly configured.");
  }
  if (policy.withdrawals !== true) throw new Error("Withdrawals are disabled by the global policy.");

  const controls = (await tx.select().from(customerControls)
    .where(eq(customerControls.userId, userId)).limit(1).for("update"))[0];
  if (!controls) throw new Error("Customer payout controls are not configured.");
  if (controls.accountStatus !== "active") throw new Error("Payout requests are unavailable while the account is restricted.");
  if (controls.withdrawalsEnabled !== true) throw new Error("Withdrawals are not enabled for this customer account.");

  if (policy.twofa === true || controls.twoFactorRequired === true) {
    // Check enrollment before asking for a code, so accounts without an authenticator
    // receive the actionable setup reason rather than a misleading missing-code error.
    await consumePayoutAuthenticatorCode(tx, userId, totpCode);
  } else {
    // The customer UI treats an enabled authenticator as a payout step-up even when
    // two-factor enrollment is optional globally. Keep server enforcement consistent.
    const authenticator = (await tx.select({ confirmedAt: customerTotpAuthenticators.confirmedAt })
      .from(customerTotpAuthenticators).where(eq(customerTotpAuthenticators.userId, userId)).limit(1).for("update"))[0];
    if (authenticator?.confirmedAt) await consumePayoutAuthenticatorCode(tx, userId, totpCode);
  }

  const kycRequired = policy.kyc === true || controls.kycRequired === true;
  if (kycRequired) {
    if (controls.emailVerified !== true) throw new Error("Verify the account email before requesting a payout.");
    const profile = (await tx.select({ overallStatus: kycProfiles.overallStatus })
      .from(kycProfiles).where(eq(kycProfiles.userId, userId)).limit(1).for("update"))[0];
    if (profile?.overallStatus !== "VERIFIED") {
      throw new Error("Complete the required identity verification before requesting a payout.");
    }
  }
}

export async function getCustomerPayoutEligibility(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { allowed: false, reason: "A valid customer account is required." };
  }
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const account = (await db.select({ id: users.id, role: users.role })
    .from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account || account.role !== "user") {
    return { allowed: false, reason: "Customer account was not found." };
  }

  const policyRow = (await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, "policy.defaults")).limit(1))[0];
  let policy: Record<string, unknown>;
  try {
    if (!policyRow) throw new Error("Policy is not configured");
    const parsed = JSON.parse(String(policyRow.settingValue || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid policy shape");
    policy = parsed as Record<string, unknown>;
  } catch {
    return { allowed: false, reason: "Payout requests are unavailable until global withdrawal policy is explicitly configured." };
  }
  if (policy.withdrawals !== true) {
    return { allowed: false, reason: "Withdrawals are disabled by the global policy." };
  }

  const controls = (await db.select().from(customerControls)
    .where(eq(customerControls.userId, userId)).limit(1))[0];
  if (!controls) return { allowed: false, reason: "Customer payout controls are not configured." };
  if (controls.accountStatus !== "active") {
    return { allowed: false, reason: "Payout requests are unavailable while the account is restricted." };
  }
  if (controls.withdrawalsEnabled !== true) {
    return { allowed: false, reason: "Withdrawals are not enabled for this customer account." };
  }
  if (policy.twofa === true || controls.twoFactorRequired === true) {
    const authenticator = (await db.select({ confirmedAt: customerTotpAuthenticators.confirmedAt }).from(customerTotpAuthenticators).where(eq(customerTotpAuthenticators.userId, userId)).limit(1))[0];
    if (!authenticator?.confirmedAt) {
      return { allowed: false, reason: "Set up and confirm an authenticator before requesting a payout." };
    }
  }

  const kycRequired = policy.kyc === true || controls.kycRequired === true;
  if (kycRequired) {
    if (controls.emailVerified !== true) {
      return { allowed: false, reason: "Verify the account email before requesting a payout." };
    }
    const profile = (await db.select({ overallStatus: kycProfiles.overallStatus })
      .from(kycProfiles).where(eq(kycProfiles.userId, userId)).limit(1))[0];
    if (profile?.overallStatus !== "VERIFIED") {
      return { allowed: false, reason: "Complete the required identity verification before requesting a payout." };
    }
  }

  return { allowed: true, reason: null };
}

async function notifyPayoutRequest(userId: number, title: string, body: string, eventKey: string) {
  try {
    await createNotification(userId, title, body, {
      eventKey,
      category: "withdrawal",
      priority: "normal",
      href: "/customer",
    });
  } catch (error) {
    console.error("[Notifications] Payout state notice failed after commit:", error instanceof Error ? error.name : "UnknownError");
  }
}

export async function listCustomerPayoutRequests(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({
    id: payoutRequests.id,
    requestReference: payoutRequests.requestReference,
    currency: payoutRequests.currency,
    amountMinor: payoutRequests.amountMinor,
    destinationType: payoutRequests.destinationType,
    destinationDetails: payoutRequests.destinationDetails,
    status: payoutRequests.status,
    externalReference: payoutRequests.externalReference,
    resolutionNote: payoutRequests.resolutionNote,
    resolvedAt: payoutRequests.resolvedAt,
    createdAt: payoutRequests.createdAt,
    updatedAt: payoutRequests.updatedAt,
  }).from(payoutRequests).where(eq(payoutRequests.userId, userId))
    .orderBy(desc(payoutRequests.createdAt), desc(payoutRequests.id)).limit(50);
}

export async function listAdminPayoutRequests() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({
    id: payoutRequests.id,
    userId: payoutRequests.userId,
    customerName: users.name,
    customerEmail: users.email,
    requestReference: payoutRequests.requestReference,
    currency: payoutRequests.currency,
    amountMinor: payoutRequests.amountMinor,
    destinationType: payoutRequests.destinationType,
    destinationDetails: payoutRequests.destinationDetails,
    status: payoutRequests.status,
    externalReference: payoutRequests.externalReference,
    resolutionNote: payoutRequests.resolutionNote,
    resolvedBy: payoutRequests.resolvedBy,
    resolvedAt: payoutRequests.resolvedAt,
    createdAt: payoutRequests.createdAt,
    updatedAt: payoutRequests.updatedAt,
  }).from(payoutRequests).leftJoin(users, eq(users.id, payoutRequests.userId))
    .orderBy(desc(payoutRequests.createdAt), desc(payoutRequests.id)).limit(100);
}

export async function createCustomerPayoutRequest(userId: number, input: CustomerPayoutInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("A valid customer account is required.");
  const currencyCode = String(input.currency || "").trim().toUpperCase();
  if (!PAYOUT_ASSET_CODES.has(currencyCode)) throw new Error("Choose an eligible payout currency. CKI must be swapped before requesting a payout.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Payout amount must be a positive safe integer in the currency's minor units.");
  if (input.destinationType !== "bank_transfer" && input.destinationType !== "crypto_transfer") throw new Error("Choose a supported manual payout destination.");
  const cryptoCurrency = ["BTC", "ETH", "USDT"].includes(currencyCode);
  const expectedDestinationType = cryptoCurrency ? "crypto_transfer" : "bank_transfer";
  if (input.destinationType !== expectedDestinationType) {
    throw new Error(cryptoCurrency
      ? "BTC, ETH, and USDT payouts require a crypto-wallet destination; no conversion is performed."
      : "USD, EUR, and GBP payouts require a bank-transfer destination; no conversion is performed.");
  }
  const destinationDetails = normalizePayoutDestinationDetails(input.destinationDetails);
  const persistedKey = payoutIdempotencyKey(userId, input.idempotencyKey);
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const user = (await tx.select({ id: users.id, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!user || user.role !== "user") throw new Error("Customer account was not found.");

    // Lock the account row first so concurrent requests with the same key serialize.
    const prior = (await tx.select().from(payoutRequests)
      .where(eq(payoutRequests.idempotencyKey, persistedKey)).limit(1).for("update"))[0];
    if (prior) {
      const matches = Number(prior.userId) === userId
        && String(prior.currency).toUpperCase() === currencyCode
        && Number(prior.amountMinor) === input.amountMinor
        && prior.destinationType === input.destinationType
        && prior.destinationDetails === destinationDetails;
      if (!matches) throw new Error("This payout idempotency key was already used for a different request.");
      return { request: prior, created: false };
    }

    await assertPayoutPolicyAllowsRequest(tx, userId, input.totpCode);
    const currency = (await tx.select().from(currencyRegistry)
      .where(and(eq(currencyRegistry.code, currencyCode), eq(currencyRegistry.enabled, true))).limit(1))[0];
    if (!currency) throw new Error(`Payout currency ${currencyCode} is not enabled.`);
    if (!Number.isInteger(Number(currency.scale)) || Number(currency.scale) < 0 || Number(currency.scale) > 8) {
      throw new Error("Payout currency precision is not configured correctly.");
    }

    const wallet = (await tx.select().from(customerBalances)
      .where(and(eq(customerBalances.userId, userId), eq(customerBalances.currency, currencyCode)))
      .limit(1).for("update"))[0];
    if (!wallet) throw new Error(`The ${currencyCode} wallet is not configured.`);
    const available = Number(wallet.availableMinor);
    const locked = Number(wallet.lockedMinor);
    const promotional = Number(wallet.promotionalMinor);
    if (![available, locked, promotional].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error("Wallet balance values are inconsistent; no payout was reserved.");
    }
    if (promotional > available) throw new Error("The promotional balance exceeds available funds; contact support before requesting a payout.");
    if (input.amountMinor > available - promotional) {
      throw new Error("Payout amount exceeds the available non-promotional balance.");
    }
    if (!Number.isSafeInteger(locked + input.amountMinor)) throw new Error("Payout reservation exceeds the supported balance amount.");

    const requestReference = `payout-${crypto.randomUUID()}`;
    const walletUpdate = await tx.update(customerBalances).set({
      availableMinor: sql`${customerBalances.availableMinor} - ${input.amountMinor}`,
      lockedMinor: sql`${customerBalances.lockedMinor} + ${input.amountMinor}`,
      updatedAt: now,
    }).where(eq(customerBalances.id, wallet.id));
    assertExactlyOneAffectedRow(walletUpdate, "Payout wallet reservation");

    await tx.insert(balanceLedger).values({
      userId,
      currency: currencyCode,
      amountMinor: -input.amountMinor,
      entryType: "payout_reserve",
      reference: requestReference,
      withdrawable: false,
    });
    await tx.insert(payoutRequests).values({
      userId,
      requestReference,
      idempotencyKey: persistedKey,
      currency: currencyCode,
      amountMinor: input.amountMinor,
      destinationType: input.destinationType,
      destinationDetails,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const request = (await tx.select().from(payoutRequests)
      .where(eq(payoutRequests.requestReference, requestReference)).limit(1))[0];
    if (!request) throw new Error("Payout request could not be confirmed after reservation.");
    return { request, created: true };
  });

  if (outcome.created) {
    await notifyPayoutRequest(
      userId,
      "Payout request received",
      `Your ${currencyCode} payout request ${outcome.request.requestReference} is pending manual review. Funds have been reserved; no transfer has been sent.`,
      `payout-request:${outcome.request.requestReference}`,
    );
  }
  return outcome.request;
}

export async function cancelCustomerPayoutRequest(userId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new Error("A valid payout request is required.");
  }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const request = (await tx.select().from(payoutRequests)
      .where(and(eq(payoutRequests.id, requestId), eq(payoutRequests.userId, userId)))
      .limit(1).for("update"))[0];
    if (!request) throw new Error("Payout request was not found.");
    if (request.status !== "pending") throw new Error("Only a pending payout request can be cancelled.");

    const wallet = (await tx.select().from(customerBalances)
      .where(and(eq(customerBalances.userId, userId), eq(customerBalances.currency, request.currency)))
      .limit(1).for("update"))[0];
    if (!wallet) throw new Error("The payout wallet could not be found.");
    const available = Number(wallet.availableMinor);
    const locked = Number(wallet.lockedMinor);
    const amount = Number(request.amountMinor);
    if (![available, locked, amount].every((value) => Number.isSafeInteger(value) && value >= 0) || amount <= 0 || locked < amount) {
      throw new Error("The reserved payout funds could not be reconciled; the request was not cancelled.");
    }
    if (!Number.isSafeInteger(available + amount)) throw new Error("Releasing this payout would exceed the supported balance amount.");

    const walletUpdate = await tx.update(customerBalances).set({
      availableMinor: sql`${customerBalances.availableMinor} + ${amount}`,
      lockedMinor: sql`${customerBalances.lockedMinor} - ${amount}`,
      updatedAt: now,
    }).where(eq(customerBalances.id, wallet.id));
    assertExactlyOneAffectedRow(walletUpdate, "Payout cancellation wallet release");

    await tx.insert(balanceLedger).values({
      userId,
      currency: request.currency,
      amountMinor: amount,
      entryType: "payout_release",
      reference: `${request.requestReference}:release`,
      withdrawable: true,
    });
    const stateUpdate = await tx.update(payoutRequests).set({
      status: "cancelled",
      resolutionNote: "Cancelled by customer",
      resolvedBy: userId,
      resolvedAt: now,
      updatedAt: now,
    }).where(and(eq(payoutRequests.id, requestId), eq(payoutRequests.status, "pending")));
    assertExactlyOneAffectedRow(stateUpdate, "Payout cancellation state transition");
    return (await tx.select().from(payoutRequests).where(eq(payoutRequests.id, requestId)).limit(1))[0];
  });

  await notifyPayoutRequest(
    userId,
    "Payout request cancelled",
    `Your payout request ${result.requestReference} was cancelled. Reserved funds have been returned to your available balance.`,
    `payout:${result.requestReference}:cancelled`,
  );
  return result;
}

export async function resolveCustomerPayoutRequest(adminId: number, input: PayoutResolutionInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!Number.isSafeInteger(adminId) || adminId <= 0 || !Number.isSafeInteger(input.requestId) || input.requestId <= 0) {
    throw new Error("A valid administrator and payout request are required.");
  }
  if (input.action !== "paid" && input.action !== "rejected") throw new Error("Choose whether to mark the request paid or reject it.");
  const externalReference = String(input.externalReference || "").trim();
  const note = String(input.note || "").replace(/\0/g, "").trim();
  if (input.action === "paid" && (externalReference.length < 3 || externalReference.length > 160)) {
    throw new Error("Enter the external transfer reference before marking a payout paid.");
  }
  if (input.action === "rejected" && !note) throw new Error("A rejection reason is required so the customer can understand the decision.");
  if (note.length > 1000) throw new Error("Payout resolution note must be 1,000 characters or fewer.");
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const request = (await tx.select().from(payoutRequests)
      .where(eq(payoutRequests.id, input.requestId)).limit(1).for("update"))[0];
    if (!request) throw new Error("Payout request was not found.");
    if (request.status !== "pending") throw new Error("Only a pending payout request can be resolved.");

    const wallet = (await tx.select().from(customerBalances)
      .where(and(eq(customerBalances.userId, request.userId), eq(customerBalances.currency, request.currency)))
      .limit(1).for("update"))[0];
    if (!wallet) throw new Error("The payout wallet could not be found.");
    const available = Number(wallet.availableMinor);
    const locked = Number(wallet.lockedMinor);
    const amount = Number(request.amountMinor);
    if (![available, locked, amount].every((value) => Number.isSafeInteger(value) && value >= 0) || amount <= 0 || locked < amount) {
      throw new Error("The reserved payout funds could not be reconciled; the request was not resolved.");
    }

    if (input.action === "paid") {
      const duplicateReference = (await tx.select({ id: payoutRequests.id }).from(payoutRequests)
        .where(eq(payoutRequests.externalReference, externalReference)).limit(1))[0];
      if (duplicateReference && Number(duplicateReference.id) !== Number(request.id)) {
        throw new Error("This external transfer reference is already assigned to another payout.");
      }
      const walletUpdate = await tx.update(customerBalances).set({
        lockedMinor: sql`${customerBalances.lockedMinor} - ${amount}`,
        updatedAt: now,
      }).where(eq(customerBalances.id, wallet.id));
      assertExactlyOneAffectedRow(walletUpdate, "Payout paid wallet settlement");
      await tx.insert(balanceLedger).values({
        userId: request.userId,
        currency: request.currency,
        amountMinor: 0,
        entryType: "payout_paid",
        reference: `${request.requestReference}:paid`,
        withdrawable: false,
      });
    } else {
      if (!Number.isSafeInteger(available + amount)) throw new Error("Releasing this payout would exceed the supported balance amount.");
      const walletUpdate = await tx.update(customerBalances).set({
        availableMinor: sql`${customerBalances.availableMinor} + ${amount}`,
        lockedMinor: sql`${customerBalances.lockedMinor} - ${amount}`,
        updatedAt: now,
      }).where(eq(customerBalances.id, wallet.id));
      assertExactlyOneAffectedRow(walletUpdate, "Payout rejection wallet release");
      await tx.insert(balanceLedger).values({
        userId: request.userId,
        currency: request.currency,
        amountMinor: amount,
        entryType: "payout_release",
        reference: `${request.requestReference}:release`,
        withdrawable: true,
      });
    }

    const stateUpdate = await tx.update(payoutRequests).set({
      status: input.action,
      externalReference: input.action === "paid" ? externalReference : null,
      resolutionNote: note || null,
      resolvedBy: adminId,
      resolvedAt: now,
      updatedAt: now,
    }).where(and(eq(payoutRequests.id, input.requestId), eq(payoutRequests.status, "pending")));
    assertExactlyOneAffectedRow(stateUpdate, "Payout resolution state transition");
    return (await tx.select().from(payoutRequests).where(eq(payoutRequests.id, input.requestId)).limit(1))[0];
  });

  if (input.action === "paid") {
    await notifyPayoutRequest(
      result.userId,
      "Payout marked paid",
      `Your ${result.currency} payout request ${result.requestReference} was marked paid by an administrator. Reference: ${result.externalReference}. This record reflects a manual confirmation; no transfer was initiated by Arbitrade.`,
      `payout:${result.requestReference}:paid`,
    );
  } else {
    await notifyPayoutRequest(
      result.userId,
      "Payout request rejected",
      `Your payout request ${result.requestReference} was rejected. The reserved funds have been returned to your available balance. Reason: ${note}`,
      `payout:${result.requestReference}:rejected`,
    );
  }
  return result;
}

export async function ensureCustomerControls(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");let row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];if(!row){await db.insert(customerControls).values({userId});row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];}return row;}
export async function listAdminCustomers(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({id:users.id,name:users.name,email:users.email,role:users.role,createdAt:users.createdAt}).from(users).orderBy(desc(users.createdAt));
  const controls=await db.select().from(customerControls); const byUser=new Map(controls.map(row=>[row.userId,row]));
  const now=new Date();
  const activePackages=await db.select({userId:customerPackageSubscriptions.userId,packageName:packages.name})
    .from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(and(eq(customerPackageSubscriptions.status,"active"),lte(customerPackageSubscriptions.startsAt,now),
      or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now))));
  const subscriptionRows=await db.select({userId:customerPackageSubscriptions.userId,packageId:customerPackageSubscriptions.packageId,
    packageName:packages.name,status:customerPackageSubscriptions.status,startsAt:customerPackageSubscriptions.startsAt,
    expiresAt:customerPackageSubscriptions.expiresAt,termsVersion:customerPackageSubscriptions.packageTermsVersion,
    qualifyingBalanceUsdMinor:customerPackageSubscriptions.qualifyingBalanceUsdMinor,activationKey:customerPackageSubscriptions.activationKey})
    .from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .orderBy(desc(customerPackageSubscriptions.startsAt));
  const assignedTierDetailsByUser=new Map<number,any[]>();
  for(const subscription of subscriptionRows){
    if(!String(subscription.activationKey||"").startsWith("auto-tier:")) continue;
    const details=assignedTierDetailsByUser.get(subscription.userId)||[];
    details.push({packageId:Number(subscription.packageId),packageName:subscription.packageName,status:subscription.status,
      termsVersion:Number(subscription.termsVersion||1),qualifyingBalanceUsdMinor:Number(subscription.qualifyingBalanceUsdMinor||0),
      qualifyingBalanceUsd:Number(subscription.qualifyingBalanceUsdMinor||0)/100,startsAt:subscription.startsAt,expiresAt:subscription.expiresAt,
      assignmentSource:"automatic"});
    assignedTierDetailsByUser.set(subscription.userId,details);
  }
  const packageByUser=new Map<number,string[]>();
  for(const subscription of activePackages){const names=packageByUser.get(subscription.userId)||[];names.push(subscription.packageName);packageByUser.set(subscription.userId,names);}
  const qualifyingLedgerRows=await db.select({
    userId:balanceLedger.userId,
    qualifyingDepositUsdMinor:balanceLedger.qualifyingDepositUsdMinor,
    entryType:balanceLedger.entryType,
  }).from(balanceLedger).where(inArray(balanceLedger.entryType,["admin_manual_deposit_credit","admin_manual_deposit_reversal"]));
  const qualifyingUsdMinorByUser=new Map<number,number>();
  for(const entry of qualifyingLedgerRows){
    const attributed=Number(entry.qualifyingDepositUsdMinor||0);
    if(!Number.isSafeInteger(attributed)) continue;
    qualifyingUsdMinorByUser.set(entry.userId,(qualifyingUsdMinorByUser.get(entry.userId)||0)+attributed);
  }
  return rows.filter(row=>row.role!=="admin").map(row=>{
    const control=byUser.get(row.id);
    const assignedTiers=[...new Set(packageByUser.get(row.id)||[])];
    const packageLabel=assignedTiers.length?assignedTiers.join(", "):"No active tier";
    const qualifyingUsdMinor=Math.max(0,qualifyingUsdMinorByUser.get(row.id)||0);
    return {id:row.id,name:row.name||row.email||"Customer",email:row.email||"",package:packageLabel,group:packageLabel,
      assignedTierDetails:assignedTierDetailsByUser.get(row.id)||[],
      qualifyingDepositUsd:qualifyingUsdMinor/100,
      status:control?.accountStatus||"active",accountState:control?.accountStatus||"active",opportunities:"Automatically assigned tier allowance",
      kyc:control?.kycRequired??true,withdrawals:control?.withdrawalsEnabled??false,twofa:control?.twoFactorRequired??false,
      facial:false,emailVerified:control?.emailVerified??false,riskTier:control?.riskTier||"standard",adminNote:control?.adminNote||"",createdAt:row.createdAt};
  });
}
export async function createAdminCustomer(input:{name:string;email:string;password:string}){
  const db=await getDb();if(!db)throw new Error("Database is not available");
  const email=input.email.trim().toLowerCase();
  if(input.password.length<10)throw new Error("Customer password must be at least 10 characters");
  const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];
  if(existing)throw new Error("A customer with this email already exists");
  const salt=crypto.randomBytes(16).toString("hex");
  const digest=crypto.scryptSync(input.password,salt,32).toString("hex");
  const result=await db.insert(users).values({openId:`local:customer:${crypto.randomUUID()}`,name:input.name.trim(),email,loginMethod:"password",role:"user",passwordHash:`scrypt$${salt}$${digest}`,packageName:"No active package"});
  const id=Number(result[0].insertId);
  await db.insert(customerControls).values({userId:id});
  return {id,email,name:input.name.trim(),packageName:"No active package"};
}
export async function updateAdminCustomer(input:{id:number;name:string;email:string}){
  const db=await getDb();if(!db)throw new Error("Database is not available");
  const email=input.email.trim().toLowerCase();
  const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];
  if(existing&&existing.id!==input.id)throw new Error("That email is already used by another account");
  await db.update(users).set({name:input.name.trim(),email}).where(and(eq(users.id,input.id),eq(users.role,"user")));
  return {success:true};
}
export async function updateCustomerControls(adminId:number,input:{userId:number;accountStatus?:"active"|"suspended"|"restricted";withdrawalsEnabled?:boolean;kycRequired?:boolean;twoFactorRequired?:boolean;emailVerified?:boolean;riskTier?:string;adminNote?:string}){
  const db=await getDb();if(!db)throw new Error("Database is not available");
  const values:any={};
  for(const key of ["accountStatus","withdrawalsEnabled","kycRequired","twoFactorRequired","emailVerified","riskTier","adminNote"] as const){
    if(input[key]!==undefined) values[key]=input[key];
  }
  const existing=(await db.select().from(customerControls).where(eq(customerControls.userId,input.userId)).limit(1))[0];
  if(existing) await db.update(customerControls).set({...values,updatedBy:adminId}).where(eq(customerControls.userId,input.userId));
  else await db.insert(customerControls).values({userId:input.userId,updatedBy:adminId,...values});
  return {success:true};
}
export type AccountClosureDecision = "approve" | "reject";
export class AccountClosureDecisionError extends Error {
  constructor(message: string) { super(message); this.name = "AccountClosureDecisionError"; }
}

function nonZeroWalletAmount(value: string | number | null | undefined): boolean {
  const normalized = String(value ?? "0").trim().replace(/^[+-]/, "");
  if (!normalized) return false;
  if (!/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) return true;
  return /[1-9]/.test(normalized.split(/[eE]/)[0] ?? "0");
}

/** Refuse account closure while Mining has unsettled customer obligations. Run inside the closure transaction. */
export async function assertNoOutstandingMiningOperations(tx: any, userId: number) {
  const guards = [
    {
      query: sql`SELECT id FROM mining_customer_packages
        WHERE userId=${userId} AND status IN ('active','replaced')
          AND (expiresAt IS NULL OR expiresAt>UTC_TIMESTAMP(3))
          AND (endedAt IS NULL OR endedAt>UTC_TIMESTAMP(3))
        LIMIT 1 FOR UPDATE`,
      message: "Resolve or let all active Mining packages expire before approving account closure.",
    },
    {
      query: sql`SELECT id FROM mining_pending_boost_rewards
        WHERE userId=${userId} AND status='pending'
        LIMIT 1 FOR UPDATE`,
      message: "Wait for pending Mining boost rewards to settle before approving account closure.",
    },
    {
      query: sql`SELECT id FROM mining_conversion_jobs
        WHERE userId=${userId} AND status IN ('queued','retrying')
        LIMIT 1 FOR UPDATE`,
      message: "Resolve queued Mining conversions before approving account closure.",
    },
    {
      query: sql`SELECT id FROM mining_adjustment_requests
        WHERE userId=${userId} AND status='pending'
        LIMIT 1 FOR UPDATE`,
      message: "Resolve pending Mining balance adjustments before approving account closure.",
    },
    {
      query: sql`SELECT id FROM mining_ledger_transactions
        WHERE userId=${userId} AND status='pending'
        LIMIT 1 FOR UPDATE`,
      message: "Resolve pending Mining ledger entries before approving account closure.",
    },
  ] as const;

  for (const guard of guards) {
    const [rows] = await tx.execute(guard.query) as any;
    if (rows?.length) throw new AccountClosureDecisionError(guard.message);
  }
}

/** An explicit, audited decision. Approval anonymizes direct identity but preserves financial/audit records. */
export async function applyAccountClosureDecision(adminId: number, input: { ticketId: number; decision: AccountClosureDecision; reason: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!ENV.cookieSecret) throw new AccountClosureDecisionError("Account closure requires the configured session-signing secret.");

  return db.transaction(async (tx) => {
    const snapshot = (await tx.select({ customerId: supportTickets.customerId })
      .from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1))[0];
    if (!snapshot) throw new AccountClosureDecisionError("The account-closure ticket was not found.");

    // Use one lock order (account, then ticket) for request and decision operations.
    const user = (await tx.select().from(users).where(eq(users.id, snapshot.customerId)).limit(1).for("update"))[0];
    const ticket = (await tx.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1).for("update"))[0];
    if (!ticket || ticket.customerId !== snapshot.customerId || ticket.subject !== ACCOUNT_CLOSURE_TICKET_SUBJECT || ticket.category !== "account") {
      throw new AccountClosureDecisionError("This ticket is not a valid account-closure request.");
    }
    if (!user || user.role !== "user" || user.loginMethod === "closed") {
      throw new AccountClosureDecisionError("The customer account is no longer eligible for a closure decision.");
    }
    if (ticket.status !== "open" && ticket.status !== "answered") {
      throw new AccountClosureDecisionError("This account-closure request has already been decided. Submit a new request if another review is needed.");
    }

    if (input.decision === "reject") {
      await tx.insert(supportMessages).values({
        ticketId: ticket.id, authorId: adminId,
        body: `ACCOUNT CLOSURE REQUEST REJECTED\n\nAdministrator review: ${input.reason.trim()}\n\nThe customer account remains open. The customer may contact support if further clarification is needed.`,
      });
      await tx.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, ticket.id));
      await tx.insert(v5AuditEvents).values({
        actorUserId: adminId, action: "ACCOUNT_CLOSURE_REJECTED", entityType: "customer_account",
        entityId: String(user.id), reason: input.reason.trim(), reference: ticket.ticketNumber,
        metadataJson: JSON.stringify({ ticketId: ticket.id, accountChanged: false }),
      });
      return { success: true, decision: input.decision, ticketId: ticket.id, ticketNumber: ticket.ticketNumber, customerId: user.id };
    }

    const otherActiveSupport = (await tx.select({ id: supportTickets.id }).from(supportTickets).where(and(
      eq(supportTickets.customerId, user.id), inArray(supportTickets.status, ["open", "answered"]),
      sql`${supportTickets.id} <> ${ticket.id}`,
    )).limit(1).for("update"))[0];
    if (otherActiveSupport) throw new AccountClosureDecisionError("Resolve or close the customer's other open support cases before approving account closure.");

    const pendingPayout = (await tx.select({ id: payoutRequests.id }).from(payoutRequests).where(and(
      eq(payoutRequests.userId, user.id), eq(payoutRequests.status, "pending"),
    )).limit(1).for("update"))[0];
    if (pendingPayout) throw new AccountClosureDecisionError("Resolve or cancel pending payout requests before approving account closure.");

    const activeTrade = (await tx.select({ id: tradePositions.id }).from(tradePositions).where(and(
      eq(tradePositions.userId, user.id), inArray(tradePositions.status, ["pending", "confirmed"]),
    )).limit(1).for("update"))[0];
    if (activeTrade) throw new AccountClosureDecisionError("Resolve all pending trading positions before approving account closure.");

    const activeStake = (await tx.select({ id: stakePositions.id }).from(stakePositions).where(and(
      eq(stakePositions.userId, user.id),
      inArray(stakePositions.status, ["PENDING", "PROCESSING", "ACTIVE", "REWARD_ACCRUING", "SETTLING"]),
    )).limit(1).for("update"))[0];
    if (activeStake) throw new AccountClosureDecisionError("Complete or cancel active staking positions before approving account closure.");

    const activeSubscription = (await tx.select({ id: customerPackageSubscriptions.id }).from(customerPackageSubscriptions).where(and(
      eq(customerPackageSubscriptions.userId, user.id), eq(customerPackageSubscriptions.status, "active"),
      or(isNull(customerPackageSubscriptions.expiresAt), gt(customerPackageSubscriptions.expiresAt, new Date())),
    )).limit(1).for("update"))[0];
    if (activeSubscription) throw new AccountClosureDecisionError("Resolve the customer's active package subscription before approving account closure.");

    await assertNoOutstandingMiningOperations(tx, user.id);

    const balances = await tx.select().from(customerBalances).where(eq(customerBalances.userId, user.id)).for("update");
    if (balances.some((balance) => [balance.availableMinor, balance.lockedMinor, balance.promotionalMinor, balance.earnedMinor].some((amount) => Number(amount) !== 0))) {
      throw new AccountClosureDecisionError("The customer has a non-zero wallet balance. Resolve or transfer funds before approving account closure.");
    }
    const digitalBalances = await tx.select().from(v5Wallets).where(eq(v5Wallets.userId, user.id)).for("update");
    if (digitalBalances.some((wallet) => [wallet.availableAmount, wallet.lockedAmount, wallet.pendingAmount].some(nonZeroWalletAmount))) {
      throw new AccountClosureDecisionError("The customer has a non-zero digital-asset balance. Resolve or transfer funds before approving account closure.");
    }

    const tombstoneOpenId = closedAccountIdentityKey(user.openId);
    if (!tombstoneOpenId) throw new AccountClosureDecisionError("The account cannot be safely anonymized because the identity-protection secret is unavailable.");

    const existingControls = (await tx.select({ userId: customerControls.userId }).from(customerControls)
      .where(eq(customerControls.userId, user.id)).limit(1).for("update"))[0];
    const closedControls = {
      accountStatus: "restricted" as const, withdrawalsEnabled: false, updatedBy: adminId,
    };
    if (existingControls) await tx.update(customerControls).set(closedControls).where(eq(customerControls.userId, user.id));
    else await tx.insert(customerControls).values({ userId: user.id, ...closedControls });

    await tx.insert(supportMessages).values({
      ticketId: ticket.id, authorId: adminId,
      body: `ACCOUNT CLOSURE APPROVED\n\nThe administrator approved this request. Authentication was revoked and direct account-identifying profile fields were anonymized. Financial ledger, transaction references, and audit records remain retained where needed for compliance and dispute resolution.\n\nAdministrative decision: ${input.reason.trim()}`,
    });

    // Waiting conversion jobs cannot execute, and executable jobs were checked above.
    // Mark waiting jobs terminal rather than retaining an orphaned conversion queue entry.
    await tx.execute(sql`UPDATE mining_conversion_jobs
      SET status='failed',lastError='Cancelled because the account was closed',updatedAt=UTC_TIMESTAMP(3)
      WHERE userId=${user.id} AND status='waiting'`);
    await tx.execute(sql`DELETE FROM mining_conversion_preferences WHERE userId=${user.id}`);

    // Remove authentication secrets, device/IP history, preferences, and customer notifications.
    // Monetary ledgers, balances, completed transactions, KYC/compliance and audit records are retained.
    await tx.delete(customerTotpAuthenticators).where(eq(customerTotpAuthenticators.userId, user.id));
    await tx.delete(customerSessions).where(eq(customerSessions.userId, user.id));
    await tx.delete(customerWalletPreferences).where(eq(customerWalletPreferences.userId, user.id));
    await tx.delete(customerOpportunityRules).where(eq(customerOpportunityRules.userId, user.id));
    await tx.delete(customerEmailPreferences).where(eq(customerEmailPreferences.userId, user.id));
    await tx.delete(authEmailTokens).where(eq(authEmailTokens.userId, user.id));
    await tx.delete(customerNotifications).where(eq(customerNotifications.userId, user.id));

    if (user.email) {
      await tx.update(emailOutbox).set({
        recipient: `closed-account-${user.id}@invalid.example`,
        encryptedPayload: "[REDACTED — ACCOUNT CLOSED]",
        status: "FAILED", leaseUntil: null, lastError: "Cancelled and redacted after account closure",
        providerMessageId: null, sentAt: null,
      }).where(eq(emailOutbox.recipient, user.email));
    }

    const customerTickets = await tx.select({ id: supportTickets.id }).from(supportTickets)
      .where(eq(supportTickets.customerId, user.id)).for("update");
    const ticketIds = customerTickets.map((row) => row.id);
    for (const oldTicketId of ticketIds.filter((id) => id !== ticket.id)) {
      await tx.update(supportMessages).set({
        body: "[Conversation content redacted following approved account closure; ticket metadata retained for audit and dispute resolution.]",
      }).where(eq(supportMessages.ticketId, oldTicketId));
      await tx.update(supportTickets).set({
        subject: "Closed account support record", status: "closed", assignedAdminId: null,
      }).where(eq(supportTickets.id, oldTicketId));
    }
    await tx.update(supportMessages).set({
      body: "[Customer closure-request details redacted following approval. Decision metadata is retained in the administrative audit trail.]",
    }).where(and(eq(supportMessages.ticketId, ticket.id), eq(supportMessages.authorId, user.id)));

    await tx.update(users).set({
      openId: tombstoneOpenId, name: null, email: null, loginMethod: "closed",
      passwordHash: null, reportingTimezone: null, authVersion: sql`${users.authVersion} + 1`,
    }).where(and(eq(users.id, user.id), eq(users.role, "user")));
    await tx.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, ticket.id));
    await tx.insert(v5AuditEvents).values({
      actorUserId: adminId, action: "ACCOUNT_CLOSURE_APPROVED", entityType: "customer_account",
      entityId: String(user.id), reason: input.reason.trim(), reference: ticket.ticketNumber,
      metadataJson: JSON.stringify({
        ticketId: ticket.id, directProfileAnonymized: true, authVersionIncremented: true,
        walletAndFinancialLedgersPreserved: true,
        supportAttachmentObjectsRetainedForProviderSpecificReview: true,
      }),
    });
    return { success: true, decision: input.decision, ticketId: ticket.id, ticketNumber: ticket.ticketNumber, customerId: user.id };
  });
}

/**
 * Direct administrative deletion is intentionally disabled. Customer account
 * closure must pass through the audited approve/reject workflow, which checks
 * financial obligations, revokes access and preserves required ledgers/audit rows.
 */
export async function deleteAdminCustomer(_userId: number): Promise<never> {
  throw new AccountClosureDecisionError(
    "Direct customer deletion is disabled. Use the customer's account-closure request and the explicit administrator decision workflow.",
  );
}
export async function adjustCustomerBalance(adminId:number,input:{
  userId:number;currency:string;amountMinor:number;mode:"credit"|"debit";
  creditClassification?:"qualifying_deposit"|"non_qualifying_credit";
  debitClassification?:"ordinary_debit"|"qualifying_deposit_reversal";
  reversalLedgerId?:number;reason:string;idempotencyKey:string;
}){
  const db=await getDb();
  if(!db) throw new Error("Database is not available");
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new Error("Amount must be a positive safe integer in minor units");
  if(input.mode==="credit"&&!input.creditClassification) throw new Error("Choose whether the manual credit is a qualifying deposit or non-qualifying credit");
  if(input.mode==="debit"&&!input.debitClassification) throw new Error("Choose whether this debit is ordinary or reverses a qualifying deposit");
  if(input.mode==="debit"&&input.debitClassification==="qualifying_deposit_reversal"&&!Number.isSafeInteger(input.reversalLedgerId)) throw new Error("Select the qualifying deposit being reversed");
  const idempotencyKey=String(input.idempotencyKey??"").trim();
  if(!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) throw new Error("A valid wallet-adjustment idempotency key is required.");
  if(String(input.reason??"").trim().length<3) throw new Error("A clear administrator reason is required for this wallet adjustment.");
  const normalizedRequest={
    adminId,userId:input.userId,currency:String(input.currency).trim().toUpperCase(),amountMinor:input.amountMinor,mode:input.mode,
    creditClassification:input.creditClassification??null,debitClassification:input.debitClassification??null,
    reversalLedgerId:input.reversalLedgerId??null,reason:String(input.reason).trim(),
  };
  const requestHash=crypto.createHash("sha256").update(JSON.stringify(normalizedRequest)).digest("hex");
  const restoreCommittedResponse=(stored:unknown)=>{
    let replay:any;try{replay=JSON.parse(String(stored))}catch{throw new Error("The prior wallet adjustment response could not be verified; do not resubmit with a new key.")}
    if(!replay||replay.success!==true||!Number.isSafeInteger(Number(replay.ledgerId))) throw new Error("The prior wallet adjustment response is invalid; do not resubmit with a new key.");
    if(replay.rateUpdatedAt!=null){const updatedAt=new Date(replay.rateUpdatedAt);if(!Number.isFinite(updatedAt.getTime())) throw new Error("The prior wallet adjustment response has an invalid FX timestamp.");replay.rateUpdatedAt=updatedAt;}
    return replay;
  };
  const priorRequest=(await db.select().from(adminWalletAdjustmentIdempotency).where(
    eq(adminWalletAdjustmentIdempotency.idempotencyKey,idempotencyKey),
  ).limit(1))[0];
  if(priorRequest){
    if(priorRequest.requestHash!==requestHash) throw new Error("This wallet-adjustment idempotency key was already used for a different request.");
    if(priorRequest.responseJson==null) throw new Error("The prior wallet adjustment has an incomplete idempotency record and requires administrator review.");
    const replay=restoreCommittedResponse(priorRequest.responseJson);
    return {...replay,idempotentReplay:true};
  }
  let creditTimeRate: Awaited<ReturnType<typeof fetchCurrencyUsdRate>> | null = null;
  let creditTimeCurrency: { code: string; scale: number; assetType: "fiat" | "crypto" | "token"; externalCode: string | null } | null = null;
  if(input.mode==="credit"&&input.creditClassification==="qualifying_deposit"&&input.userId!==adminId){
    const preflightUser=(await db.select({id:users.id,role:users.role}).from(users).where(eq(users.id,input.userId)).limit(1))[0];
    if(preflightUser?.role==="user"){
      const preflightCurrency=(await db.select().from(currencyRegistry).where(and(eq(currencyRegistry.code,input.currency.toUpperCase()),eq(currencyRegistry.enabled,true))).limit(1))[0];
      if(!preflightCurrency) throw new Error(`Currency ${input.currency} is not enabled. Add it in Currency registry first.`);
      const assetType=String(preflightCurrency.assetType) as "fiat"|"crypto"|"token";
      if(!["fiat","crypto","token"].includes(assetType)) throw new Error(`Wallet ${preflightCurrency.code} has an unsupported asset type for USD conversion.`);
      creditTimeCurrency={code:String(preflightCurrency.code).toUpperCase(),scale:Number(preflightCurrency.scale),assetType,externalCode:preflightCurrency.externalCode?String(preflightCurrency.externalCode):null};
      creditTimeRate=await fetchCurrencyUsdRate({code:creditTimeCurrency.code,assetType,externalCode:creditTimeCurrency.externalCode});
    }
  }
  const ledgerReference=`admin-${adminId}-${input.userId}-${crypto.randomUUID()}`;
  const result=await db.transaction(async tx=>{
    await tx.insert(adminWalletAdjustmentIdempotency).values({adminId,idempotencyKey,requestHash,responseJson:null})
      .onDuplicateKeyUpdate({set:{requestHash:sql`${adminWalletAdjustmentIdempotency.requestHash}`}});
    const idempotencyRecord=(await tx.select().from(adminWalletAdjustmentIdempotency).where(
      eq(adminWalletAdjustmentIdempotency.idempotencyKey,idempotencyKey),
    ).limit(1).for("update"))[0];
    if(!idempotencyRecord) throw new Error("Wallet-adjustment idempotency record could not be secured.");
    if(idempotencyRecord.requestHash!==requestHash) throw new Error("This wallet-adjustment idempotency key was already used for a different request.");
    if(idempotencyRecord.responseJson!=null){
      const replay=restoreCommittedResponse(idempotencyRecord.responseJson);
      return {...replay,idempotentReplay:true};
    }
    const user=(await tx.select({id:users.id,role:users.role,loginMethod:users.loginMethod}).from(users)
      .where(input.userId===adminId?eq(users.id,input.userId):and(eq(users.id,input.userId),eq(users.role,"user")))
      .limit(1).for("update"))[0];
    if(!user) throw new Error("Customer account not found");
    if(user.role==="user"&&user.loginMethod==="closed") throw new Error("Cannot adjust the wallet of a closed customer account");
    if(user.role==="admin"&&user.id!==adminId) throw new Error("Administrators may adjust only their own wallet");
    const currency=(await tx.select().from(currencyRegistry).where(and(eq(currencyRegistry.code,input.currency.toUpperCase()),eq(currencyRegistry.enabled,true))).limit(1))[0];
    if(!currency) throw new Error(`Currency ${input.currency} is not enabled. Add it in Currency registry first.`);

    let qualifyingDepositUsdMinor:number|null=null;
    let qualifyingDepositRate:string|null=null;
    let qualifyingDepositRateProvider:string|null=null;
    let qualifyingDepositRateAt:Date|null=null;
    let qualifyingDepositReversalOfId:number|null=null;

    if(input.mode==="credit"&&input.creditClassification==="qualifying_deposit"&&user.role==="user"){
      const currencyCode=String(currency.code).toUpperCase();
      if(!creditTimeRate||!creditTimeCurrency||creditTimeCurrency.code!==currencyCode||
        creditTimeCurrency.scale!==Number(currency.scale)||
        creditTimeCurrency.assetType!==String(currency.assetType)||
        creditTimeCurrency.externalCode!==(currency.externalCode?String(currency.externalCode):null)){
        throw new Error("A fresh API conversion rate for this exact wallet configuration is required before this qualifying credit can be committed. Retry the credit.");
      }
      const rate=Number(creditTimeRate.rate);
      const provider=creditTimeRate.provider;
      const rateAt=new Date(creditTimeRate.sourceDate);
      if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(rateAt.getTime())||rateAt.getTime()>Date.now()+60_000){
        throw new Error("A valid, timestamped API currency-to-USD rate is required before this qualifying deposit can be credited.");
      }
      const usdMinor=nativeMinorToUsdMinorExact(input.amountMinor,Number(currency.scale),creditTimeRate.rate);
      if(!Number.isSafeInteger(usdMinor)||usdMinor<=0) throw new Error("Qualifying deposit USD value is invalid or below the supported precision.");
      qualifyingDepositUsdMinor=usdMinor;
      qualifyingDepositRate=String(creditTimeRate.rate);
      qualifyingDepositRateProvider=provider;
      qualifyingDepositRateAt=rateAt;
    }

    if(input.mode==="debit"&&input.debitClassification==="qualifying_deposit_reversal"){
      if(user.role!=="user") throw new Error("Only a customer qualifying deposit can be reversed");
      const original=(await tx.select().from(balanceLedger).where(and(
        eq(balanceLedger.id,Number(input.reversalLedgerId)),
        eq(balanceLedger.userId,input.userId),
        eq(balanceLedger.currency,currency.code),
        eq(balanceLedger.entryType,"admin_manual_deposit_credit"),
        isNotNull(balanceLedger.qualifyingDepositUsdMinor),
      )).limit(1).for("update"))[0];
      if(!original) throw new Error("The selected qualifying deposit was not found for this customer and currency");
      const priorReversals=await tx.select({
        amountMinor:balanceLedger.amountMinor,
        qualifyingDepositUsdMinor:balanceLedger.qualifyingDepositUsdMinor,
      }).from(balanceLedger).where(eq(balanceLedger.qualifyingDepositReversalOfId,original.id)).for("update");
      const reversedNative=priorReversals.reduce((sum,row)=>sum+Math.abs(Number(row.amountMinor)),0);
      const reversedUsd=priorReversals.reduce((sum,row)=>sum+Math.abs(Number(row.qualifyingDepositUsdMinor||0)),0);
      const remainingNative=Number(original.amountMinor)-reversedNative;
      const originalUsd=Number(original.qualifyingDepositUsdMinor);
      const remainingUsd=originalUsd-reversedUsd;
      if(!Number.isSafeInteger(remainingNative)||remainingNative<=0||input.amountMinor>remainingNative){
        throw new Error("The reversal exceeds the unreversed amount of the selected qualifying deposit");
      }
      if(!Number.isSafeInteger(remainingUsd)||remainingUsd<0) throw new Error("The qualifying deposit reversal history is inconsistent");
      const reversalUsd=input.amountMinor===remainingNative?remainingUsd:Math.min(remainingUsd,proportionalMinorAmount(originalUsd,input.amountMinor,Number(original.amountMinor)));
      if(!Number.isSafeInteger(reversalUsd)||reversalUsd<0) throw new Error("The qualifying deposit reversal value is invalid");
      qualifyingDepositUsdMinor=-reversalUsd;
      qualifyingDepositRate=original.qualifyingDepositRate;
      qualifyingDepositRateProvider=original.qualifyingDepositRateProvider;
      qualifyingDepositRateAt=original.qualifyingDepositRateAt?new Date(original.qualifyingDepositRateAt):null;
      qualifyingDepositReversalOfId=Number(original.id);
    }

    const balance=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1).for("update"))[0];
    const current=balance?.availableMinor??0;
    if(!Number.isSafeInteger(current)||current<0) throw new Error("Wallet available balance is invalid; reconcile the wallet before adjusting it");
    const next=input.mode==="credit"?current+input.amountMinor:current-input.amountMinor;
    if(!Number.isSafeInteger(next)) throw new Error("Wallet adjustment exceeds the safe integer range");
    if(next<0) throw new Error("Debit exceeds available wallet balance");
    if(balance&&input.mode==="credit"&&(!Number.isSafeInteger(balance.promotionalMinor)||balance.promotionalMinor<0||!Number.isSafeInteger(balance.promotionalMinor+input.amountMinor))) throw new Error("Wallet promotional balance is invalid or exceeds the safe integer range");
    if(balance) await tx.update(customerBalances).set({availableMinor:next,promotionalMinor:input.mode==="credit"?balance.promotionalMinor+input.amountMinor:balance.promotionalMinor}).where(eq(customerBalances.id,balance.id));
    else await tx.insert(customerBalances).values({userId:input.userId,currency:currency.code,availableMinor:input.amountMinor,promotionalMinor:input.mode==="credit"?input.amountMinor:0,earnedMinor:0});

    if(qualifyingDepositUsdMinor!==null&&creditTimeRate){
      await tx.insert(fxRateSnapshots).values({
        baseAsset:currency.code,quoteAsset:"USD",rate:String(creditTimeRate.rate),
        provider:creditTimeRate.provider,sourceDate:creditTimeRate.sourceDate,
        rawJson:JSON.stringify({currency:currency.code,usdRate:creditTimeRate.rate,provider:creditTimeRate.provider,
          sourceDate:creditTimeRate.sourceDate,fetchedAt:creditTimeRate.fetchedAt.toISOString(),ledgerReference}),
      });
    }
    const entryType=qualifyingDepositReversalOfId!==null?"admin_manual_deposit_reversal":qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":`admin_${input.mode}`;
    const inserted=await tx.insert(balanceLedger).values({
      userId:input.userId,currency:currency.code,amountMinor:input.mode==="credit"?input.amountMinor:-input.amountMinor,
      qualifyingDepositUsdMinor,qualifyingDepositRate,qualifyingDepositRateProvider,qualifyingDepositRateAt,
      qualifyingDepositReversalOfId,entryType,reference:ledgerReference,withdrawable:false,
    });
    const ledgerId=Number(inserted[0].insertId);
    if(entryType==="admin_manual_deposit_credit"||entryType==="admin_manual_deposit_reversal"){
      // Atomic outbox: the ledger entry and its tier-qualification job commit together.
      // sourceLedgerId is unique, so a retry cannot enqueue the same ledger credit twice.
      await tx.insert(tradingTierQualificationJobs).values({
        userId:input.userId,sourceLedgerId:ledgerId,status:"pending",attempts:0,availableAt:new Date(),
      });
    }
    if(entryType==="admin_manual_deposit_credit"||entryType==="admin_manual_deposit_reversal"){
      await tx.insert(v5AuditEvents).values({
        actorUserId:adminId,
        action:entryType==="admin_manual_deposit_credit"?"trading_qualifying_deposit_credited":"trading_qualifying_deposit_reversed",
        entityType:"balance_ledger",entityId:String(ledgerId),reason:input.reason,reference:ledgerReference,
        metadataJson:JSON.stringify({ledgerId,userId:input.userId,currency:currency.code,amountMinor:input.amountMinor,entryType,qualifyingDepositUsdMinor,qualifyingDepositReversalOfId,rate:qualifyingDepositRate,rateProvider:qualifyingDepositRateProvider,rateAt:qualifyingDepositRateAt?.toISOString()}),
      });
    }
    const committedResponse={
      success:true,newAvailableMinor:next,currency:currency.code,amountMinor:input.amountMinor,ledgerReference,ledgerId,entryType,
      qualifyingDepositUsdMinor,qualifyingDepositReversalOfId,
      rateUsd:qualifyingDepositRate!==null?Number(qualifyingDepositRate):Number(currency.usdRate),
      rateUpdatedAt:qualifyingDepositRateAt??currency.updatedAt,
      amountUsd:qualifyingDepositUsdMinor!==null?Math.abs(qualifyingDepositUsdMinor)/100:nativeMinorToUsd(input.amountMinor,Number(currency.scale),Number(currency.usdRate)),
      qualifyingDepositRateProvider,
    };
    const idempotencyUpdate=await tx.update(adminWalletAdjustmentIdempotency).set({responseJson:JSON.stringify(committedResponse),updatedAt:new Date()})
      .where(eq(adminWalletAdjustmentIdempotency.id,idempotencyRecord.id));
    if(Number((idempotencyUpdate as any)[0]?.affectedRows||0)!==1) throw new Error("Wallet-adjustment response could not be committed atomically.");
    return {...committedResponse,idempotentReplay:false};
  });

  if(!result.idempotentReplay&&(result.entryType==="admin_manual_deposit_credit"||result.entryType==="admin_manual_deposit_reversal")){
    try{await ensureAutomaticTradingTierEntitlements(input.userId);}
    catch(error){console.error("[Trading] Automatic tier reconciliation deferred to scheduled worker:",error instanceof Error?error.message:"UnknownError");}
  }
  if(!result.idempotentReplay) try {
    await createNotification(input.userId,`Wallet ${input.mode==="credit"?"credited":"debited"}`,`An administrator ${input.mode}ed ${input.amountMinor} native ledger units to your ${input.currency.toUpperCase()} wallet. Reason: ${input.reason}`,{eventKey:`wallet-adjustment:${result.ledgerReference}`,category:input.mode==="credit"?"ledger_credit":"ledger_debit",priority:"normal"});
  } catch(error) {
    console.error("[Notifications] Wallet adjustment notice failed after ledger commit:",error instanceof Error?error.name:"UnknownError");
  }
  if(!result.idempotentReplay) try {
    const { enqueueWalletAdjustmentEmail } = await import("./emailQueue");
    await enqueueWalletAdjustmentEmail(input.userId,input.mode,input.amountMinor,input.currency,`admin-ledger:${adminId}:${input.userId}:${Date.now()}`);
  } catch(error) {
    console.error("[Email] Wallet alert enqueue failed:",error instanceof Error?error.name:"UnknownError");
  }
  return result;
}

export async function listOpenOffers(){const db=await getDb();if(!db)throw new Error("Database is not available");const now=new Date();return db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt);}
/**
 * Use only values explicitly published on the opportunity. These are estimates
 * for reservation and display; they are not evidence of a realized outcome.
 */
function calculateTradeTerms(_userId:number, offer:any, _amountMinor:number) {
  const minimumMinor=Number(offer.minimumMinor);
  const rewardBps=Number(offer.expectedRewardBps);
  if(offer.minimumMinor==null||!Number.isSafeInteger(minimumMinor)||minimumMinor<=0) {
    throw new Error("Published opportunity has an invalid minimum allocation");
  }
  if(offer.expectedRewardBps==null||!Number.isSafeInteger(rewardBps)||rewardBps<0||rewardBps>10000) {
    throw new Error("Published opportunity has an invalid estimated reward rate");
  }
  return { minimumMinor, rewardBps, method:"admin-published-estimate" };
}
function packageUsdUnitsToNativeMinor(usdUnits:number, currency:string, currencies:any[]):number { const row=currencies.find((item:any)=>item.code===currency); if(!row) throw new Error(`Currency ${currency} is not configured`); return usdUnitsToNativeMinor(usdUnits,Number(row.scale),Number(row.usdRate)); }
const TRADE_ALLOCATION_CONTROL_KEY = "trading.allocations.paused";

export type TradeAllocationControls = {
  allocationsPaused: boolean;
  reason: string;
  updatedAt: string | null;
  updatedBy: number | null;
};

function parseTradeAllocationControls(raw: string | null | undefined): TradeAllocationControls {
  if (!raw) {
    // Missing control row means the safety migration may not have run; fail closed.
    return { allocationsPaused: true, reason: "Global allocation safety setting is missing; administrator review is required.", updatedAt: null, updatedBy: null };
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" ||
        typeof value.allocationsPaused !== "boolean" ||
        typeof value.reason !== "string" ||
        !(value.updatedAt === null || typeof value.updatedAt === "string") ||
        !(value.updatedBy === null || (Number.isSafeInteger(value.updatedBy) && value.updatedBy > 0))) {
      throw new Error("Invalid global allocation safety setting shape");
    }
    return {
      allocationsPaused: value.allocationsPaused,
      reason: value.reason,
      updatedAt: value.updatedAt,
      updatedBy: value.updatedBy,
    };
  } catch {
    // A malformed safety setting must fail closed, never silently resume allocation.
    return { allocationsPaused: true, reason: "Safety setting requires administrator review because its stored value is invalid.", updatedAt: null, updatedBy: null };
  }
}

export async function getTradeAllocationControls(): Promise<TradeAllocationControls> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const row = (await db.select({ settingValue: appSettings.settingValue }).from(appSettings)
      .where(eq(appSettings.settingKey, TRADE_ALLOCATION_CONTROL_KEY)).limit(1))[0];
    return parseTradeAllocationControls(row?.settingValue);
  } catch (error) {
    const cause = error as { name?: unknown; message?: unknown; code?: unknown; errno?: unknown; sqlState?: unknown };
    console.error("[Trading] Admin allocation safety status read failed", {
      errorName: typeof cause?.name === "string" ? cause.name : "UnknownError",
      errorCode: typeof cause?.code === "string" || typeof cause?.code === "number" ? cause.code : undefined,
      errorNumber: typeof cause?.errno === "number" ? cause.errno : undefined,
      sqlState: typeof cause?.sqlState === "string" ? cause.sqlState : undefined,
      message: typeof cause?.message === "string" ? cause.message : "Unknown database error",
    });
    throw new Error("Unable to load the Trading allocation safety status. Check server logs for the underlying database error.");
  }
}

export async function setTradeAllocationControls(updatedBy: number, input: { allocationsPaused: boolean; reason: string }) {
  if (!Number.isSafeInteger(updatedBy) || updatedBy <= 0) throw new Error("Administrator identity is required");
  const reason = String(input.reason ?? "").trim();
  if (input.allocationsPaused && reason.length < 8) throw new Error("Provide a reason of at least 8 characters before pausing new allocations");
  if (reason.length > 500) throw new Error("Pause reason must be 500 characters or fewer");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const row = (await tx.select({ settingKey: appSettings.settingKey, settingValue: appSettings.settingValue })
      .from(appSettings).where(eq(appSettings.settingKey, TRADE_ALLOCATION_CONTROL_KEY)).limit(1).for("update"))[0];
    if (!row && !input.allocationsPaused) {
      throw new Error("Global allocation safety setting is missing; apply the migration before resuming new allocations");
    }
    const previous = parseTradeAllocationControls(row?.settingValue);
    const next: TradeAllocationControls = {
      allocationsPaused: input.allocationsPaused,
      reason: input.allocationsPaused ? reason : (reason || "Resumed by administrator"),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    const settingValue = JSON.stringify(next);
    if (row) {
      await tx.update(appSettings).set({ settingValue, updatedBy, updatedAt: new Date() })
        .where(eq(appSettings.settingKey, TRADE_ALLOCATION_CONTROL_KEY));
    } else {
      await tx.insert(appSettings).values({ settingKey: TRADE_ALLOCATION_CONTROL_KEY, settingValue, updatedBy });
    }
    await tx.insert(v5AuditEvents).values({
      actorUserId: updatedBy,
      action: input.allocationsPaused ? "trading_new_allocations_paused" : "trading_new_allocations_resumed",
      entityType: "trade_allocation_controls",
      entityId: "global",
      reason: next.reason,
      reference: "trade-allocation-control:" + crypto.randomUUID(),
      metadataJson: JSON.stringify({ old: previous, new: next }),
    });
    return next;
  });
}

export async function listAdminTradingPackages() {
  try {
    const db=await getDb();
    if(!db) throw new Error("Database is not available");
    return await db.select().from(packages).orderBy(packages.minimumQualifyingBalanceUsdMinor,packages.id);
  } catch (error) {
    // Keep database details server-side while recording enough context to diagnose
    // missing migrations, missing tables/columns, connectivity, or permission errors.
    const cause = error as { name?: unknown; message?: unknown; code?: unknown; errno?: unknown; sqlState?: unknown };
    console.error("[Trading] Admin package catalogue read failed", {
      errorName: typeof cause?.name === "string" ? cause.name : "UnknownError",
      errorCode: typeof cause?.code === "string" || typeof cause?.code === "number" ? cause.code : undefined,
      errorNumber: typeof cause?.errno === "number" ? cause.errno : undefined,
      sqlState: typeof cause?.sqlState === "string" ? cause.sqlState : undefined,
      message: typeof cause?.message === "string" ? cause.message : "Unknown database error",
    });
    throw new Error("Unable to load the Trading package catalogue. Check server logs for the underlying database error.");
  }
}
const UNCONFIGURED_TIER_POLICY_SENTINELS = {
  badgeLabel:null,badgeStyle:"neutral",
  minimumPayoutRateBps:null,maximumPayoutRateBps:null,
  minimumTradeDurationSeconds:null,maximumTradeDurationSeconds:null,
  companyRotationEnabled:false,companyRotationCountryNames:null,
  companyRotationRepeatPolicy:"avoid_until_exhausted" as const,
  maxPopupsPerDay:0,maxVisibleOffers:0,minimumTradeUnits:0,maximumTradeUnits:0,
  minHourlyTarget:0,normalHourlyTarget:0,marketInfluenceBps:0,burstEnabled:false,maxBurstSize:0,
  enabled:false,automaticDelivery:false,dailyPopupTarget:0,schedulingPeriod:"rolling_24h" as const,
  minIntervalSeconds:0,maxIntervalSeconds:0,randomizationEnabled:false,popupDisplayTargetSeconds:0,
  completionDisplaySeconds:0,postCompletionIntervalSeconds:0,maxPendingDeliveries:0,
  deliveryRetryPolicy:"none" as const,maxDeliveryAttempts:0,expiryHandling:"expire" as const,
  duplicatePrevention:false,audioEnabled:false,audioSound:"",automaticTradingEnabled:false,
  maxTradeAttemptsPerDay:0,tradeRetryDelaySeconds:0,maxSuccessfulTradesPerDay:0,maxConcurrentActiveTrades:0,
  requirePreviousSettlement:true,minSettlementDelaySeconds:0,maxSettlementDelaySeconds:0,
  minimumRewardBps:0,allowedOpportunityTypes:null,maxDailyRewardMinor:0,rewardLimitCurrency:"USD",
  dailyRewardWindow:"calendar_day" as const,maxRewardPerTradeMinor:0,unsettledRewardPolicy:"reserve" as const,
  capReachedPolicy:"stop_new_trades" as const,settlementConfirmationState:"ledger_and_wallet" as const,
  settlementRetryPolicy:"manual" as const,maxSettlementAttempts:0,closePolicy:"after_completion" as const,
  policyVersion:0,
} as const;

export async function createAdminTradingPackage(createdBy:number,input:{
  name:string; minimumQualifyingBalanceUsdMinor:number; durationMonths:number;
  opportunitiesPerDay:number; maxPopupsPerDay:number; maxActiveInvestments:number;
  startsAt:Date|null; expiresAt:Date|null; enabled:boolean; reason:string;
}) {
  const name=input.name.trim();
  if(!name||name.length>80) throw new Error("Package name must contain 1–80 characters");
  const auditReason=String(input.reason??"").trim();
  if(auditReason.length<5||auditReason.length>500) throw new Error("Provide an audit reason of 5–500 characters");
  if(input.enabled) throw new Error("New Trading tiers must be created disabled. Save and review the delivery policy, then explicitly enable the tier.");
  if(!Number.isSafeInteger(input.minimumQualifyingBalanceUsdMinor)||input.minimumQualifyingBalanceUsdMinor<=0) throw new Error("Minimum qualifying balance must be a positive USD minor-unit integer");
  if(!Number.isSafeInteger(input.durationMonths)||input.durationMonths<1||input.durationMonths>1200) throw new Error("Package duration must be 1–1200 calendar months");
  if(!Number.isSafeInteger(input.opportunitiesPerDay)||input.opportunitiesPerDay<1||input.opportunitiesPerDay>10000) throw new Error("Daily opportunity quota must be between 1 and 10000");
  if(!Number.isSafeInteger(input.maxPopupsPerDay)||input.maxPopupsPerDay<0||input.maxPopupsPerDay>10000) throw new Error("Package popup cap must be between 0 and 10000");
  if(!Number.isSafeInteger(input.maxActiveInvestments)||input.maxActiveInvestments<0||input.maxActiveInvestments>10000) throw new Error("Package active-investment cap must be between 0 and 10000");
  if(input.startsAt&&!Number.isFinite(input.startsAt.getTime())) throw new Error("Package start time is invalid");
  if(input.expiresAt&&!Number.isFinite(input.expiresAt.getTime())) throw new Error("Package expiry time is invalid");
  if(input.startsAt&&input.expiresAt&&input.expiresAt<=input.startsAt) throw new Error("Package expiry must be later than its start time");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.transaction(async tx=>{
    const duplicate=(await tx.select({id:packages.id}).from(packages).where(eq(packages.name,name)).limit(1).for("update"))[0];
    if(duplicate) throw new Error("A package with this name already exists");
    const policyConflict=(await tx.select({id:opportunityPackagePolicies.id}).from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,name)).limit(1).for("update"))[0];
    if(policyConflict) throw new Error("A tier policy with this name already exists; reconcile the orphan policy before creating the tier.");
    const inserted=await tx.insert(packages).values({
      name,minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,
      durationMonths:input.durationMonths,opportunitiesPerDay:input.opportunitiesPerDay,
      maxPopupsPerDay:input.maxPopupsPerDay,maxActiveInvestments:input.maxActiveInvestments,
      startsAt:input.startsAt,expiresAt:input.expiresAt,enabled:false,termsVersion:1,
    });
    const id=Number(inserted[0].insertId);
    await tx.insert(opportunityPackagePolicies).values({packageName:name,updatedBy:createdBy,...UNCONFIGURED_TIER_POLICY_SENTINELS});
    await tx.insert(v5AuditEvents).values({
      actorUserId:createdBy,action:"trading_package_created",entityType:"trading_package",entityId:String(id),
      reason:auditReason,
      reference:"trading-package-created:"+id+":1",
      metadataJson:JSON.stringify({id,...input,name,termsVersion:1}),
    });
    return {id,name,minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,durationMonths:input.durationMonths,opportunitiesPerDay:input.opportunitiesPerDay,maxPopupsPerDay:input.maxPopupsPerDay,maxActiveInvestments:input.maxActiveInvestments,startsAt:input.startsAt,expiresAt:input.expiresAt,enabled:false,termsVersion:1};
  });
}

export async function updateAdminTradingPackage(updatedBy:number,input:{
  id:number; name:string; minimumQualifyingBalanceUsdMinor:number; durationMonths:number;
  opportunitiesPerDay:number; maxPopupsPerDay:number; maxActiveInvestments:number;
  startsAt:Date|null; expiresAt:Date|null; enabled:boolean; reason:string;
}) {
  const auditReason=String(input.reason??"").trim();
  if(auditReason.length<5||auditReason.length>500) throw new Error("Provide an audit reason of 5–500 characters");
  if(!Number.isSafeInteger(input.id)||input.id<=0) throw new Error("Package ID is invalid");
  if(!input.name.trim()||input.name.trim().length>80) throw new Error("Package name must contain 1–80 characters");
  if(!Number.isSafeInteger(input.minimumQualifyingBalanceUsdMinor)||input.minimumQualifyingBalanceUsdMinor<=0) throw new Error("Minimum qualifying balance must be a positive USD minor-unit integer");
  if(!Number.isSafeInteger(input.durationMonths)||input.durationMonths<1||input.durationMonths>1200) throw new Error("Package duration must be 1–1200 calendar months");
  if(!Number.isSafeInteger(input.opportunitiesPerDay)||input.opportunitiesPerDay<1||input.opportunitiesPerDay>10000) throw new Error("Daily opportunity quota must be between 1 and 10000");
  if(!Number.isSafeInteger(input.maxPopupsPerDay)||input.maxPopupsPerDay<0||input.maxPopupsPerDay>10000) throw new Error("Package popup cap must be between 0 and 10000; zero means use the admin policy cap");
  if(!Number.isSafeInteger(input.maxActiveInvestments)||input.maxActiveInvestments<0||input.maxActiveInvestments>10000) throw new Error("Package active-investment cap must be between 0 and 10000; zero means no tier-specific cap");
  if(input.startsAt&&!Number.isFinite(input.startsAt.getTime())) throw new Error("Package start time is invalid");
  if(input.expiresAt&&!Number.isFinite(input.expiresAt.getTime())) throw new Error("Package expiry time is invalid");
  if(input.startsAt&&input.expiresAt&&input.expiresAt<=input.startsAt) throw new Error("Package expiry must be later than its start time");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.transaction(async tx=>{
    const current=(await tx.select().from(packages).where(eq(packages.id,input.id)).limit(1).for("update"))[0];
    if(!current) throw new Error("Trading package not found");
    const nextName=input.name.trim();
    const conflicting=(await tx.select({id:packages.id}).from(packages).where(eq(packages.name,nextName)).limit(1))[0];
    if(conflicting&&conflicting.id!==input.id) throw new Error("A tier with this name already exists");
    if(current.name!==nextName){
      const currentPolicy=(await tx.select().from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,current.name)).limit(1).for("update"))[0];
      const targetPolicy=(await tx.select({id:opportunityPackagePolicies.id}).from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,nextName)).limit(1).for("update"))[0];
      if(!currentPolicy) throw new Error("Saved Trading policy is missing for "+current.name+"; reconcile it explicitly before renaming this tier.");
      if(targetPolicy&&targetPolicy.id!==currentPolicy.id) throw new Error("A tier policy with the new name already exists; reconcile it before renaming this tier.");
      const nextPolicyVersion=Number(currentPolicy.policyVersion||0)+1;
      if(!Number.isSafeInteger(nextPolicyVersion)) throw new Error("Tier policy version has reached its limit");
      await tx.update(opportunityPackagePolicies).set({packageName:nextName,updatedBy,policyVersion:nextPolicyVersion,updatedAt:new Date()}).where(eq(opportunityPackagePolicies.id,currentPolicy.id));
    }
    const activationPolicy=(await tx.select().from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,nextName)).limit(1).for("update"))[0];
    if(input.enabled&&(
      !activationPolicy||
      Number(activationPolicy.policyVersion)<1||
      !activationPolicy.enabled||
      !activationPolicy.automaticDelivery||
      !activationPolicy.automaticTradingEnabled||
      !Number.isSafeInteger(Number(activationPolicy.minimumPayoutRateBps))||
      !Number.isSafeInteger(Number(activationPolicy.maximumPayoutRateBps))||
      Number(activationPolicy.minimumPayoutRateBps)<0||
      Number(activationPolicy.maximumPayoutRateBps)<Number(activationPolicy.minimumPayoutRateBps)||
      !Number.isSafeInteger(Number(activationPolicy.minimumTradeDurationSeconds))||
      !Number.isSafeInteger(Number(activationPolicy.maximumTradeDurationSeconds))||
      Number(activationPolicy.minimumTradeDurationSeconds)<10||
      Number(activationPolicy.maximumTradeDurationSeconds)<Number(activationPolicy.minimumTradeDurationSeconds)||
      Number(activationPolicy.maximumTradeDurationSeconds)>86400
    )) {
      throw new Error("Save and enable a valid delivery policy with payout-rate and duration bounds before enabling this Trading tier.");
    }
    const nextVersion=Number(current.termsVersion||1)+1;
    if(!Number.isSafeInteger(nextVersion)) throw new Error("Package terms version has reached its limit");
    await tx.update(packages).set({
      name:input.name.trim(),
      minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,
      durationMonths:input.durationMonths,
      opportunitiesPerDay:input.opportunitiesPerDay,
      maxPopupsPerDay:input.maxPopupsPerDay,
      maxActiveInvestments:input.maxActiveInvestments,
      startsAt:input.startsAt,
      expiresAt:input.expiresAt,
      enabled:input.enabled,
      termsVersion:nextVersion,
    }).where(eq(packages.id,input.id));
    await tx.insert(v5AuditEvents).values({
      actorUserId:updatedBy,action:"trading_package_terms_updated",
      entityType:"trading_package",entityId:String(input.id),
      reason:auditReason,
      reference:"trading-package-terms:"+input.id+":"+nextVersion,
      metadataJson:JSON.stringify({old:{name:current.name,minimumQualifyingBalanceUsdMinor:Number(current.minimumQualifyingBalanceUsdMinor),durationMonths:current.durationMonths,opportunitiesPerDay:current.opportunitiesPerDay,maxPopupsPerDay:current.maxPopupsPerDay,maxActiveInvestments:current.maxActiveInvestments,startsAt:current.startsAt,expiresAt:current.expiresAt,enabled:current.enabled,termsVersion:current.termsVersion},new:{...input,name:input.name.trim(),termsVersion:nextVersion}}),
    });
    return {id:input.id,name:input.name.trim(),minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,durationMonths:input.durationMonths,opportunitiesPerDay:input.opportunitiesPerDay,maxPopupsPerDay:input.maxPopupsPerDay,maxActiveInvestments:input.maxActiveInvestments,startsAt:input.startsAt,expiresAt:input.expiresAt,enabled:input.enabled,termsVersion:nextVersion};
  });
}

/**
 * Customer-safe, read-only progressive eligibility summary. Returns only the
 * current automatically assigned tier and at most one next milestone with the
 * qualification progress and allowance fields permitted by the canonical spec;
 * never returns a full catalogue or customer activation/management controls.
 */
/**
 * Reconcile automatic tier entitlements from persisted qualifying-deposit
 * attribution. Called by the scheduled worker so tier start dates and admin
 * configuration changes do not depend on a customer visit or another deposit.
 */
export async function ensureAutomaticTradingTierEntitlements(userId:number) {
  const db=await getDb();
  if(!db) throw new Error("Trading eligibility is temporarily unavailable.");
  await db.transaction(async tx=>{
    const user=(await tx.select({id:users.id,role:users.role,loginMethod:users.loginMethod})
      .from(users).where(eq(users.id,userId)).limit(1).for("update"))[0];
    if(!user||user.role!=="user"||user.loginMethod==="closed") return;
    const creditedRows=await tx.select({amount:balanceLedger.qualifyingDepositUsdMinor})
      .from(balanceLedger).where(and(
        eq(balanceLedger.userId,userId),
        inArray(balanceLedger.entryType,["admin_manual_deposit_credit","admin_manual_deposit_reversal"]),
        isNotNull(balanceLedger.qualifyingDepositUsdMinor),
      ));
    const qualifyingTotal=creditedRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    if(!Number.isSafeInteger(qualifyingTotal)||qualifyingTotal<0) throw new Error("Cumulative qualifying deposit total is invalid.");
    const now=new Date();
    const tiers=await tx.select().from(packages)
      .orderBy(packages.minimumQualifyingBalanceUsdMinor,packages.id).for("update");
    const history=await tx.select().from(customerPackageSubscriptions)
      .where(eq(customerPackageSubscriptions.userId,userId))
      .orderBy(desc(customerPackageSubscriptions.activatedAt)).for("update");

    for(const tier of tiers){
      const threshold=Number(tier.minimumQualifyingBalanceUsdMinor);
      const tierHistory=history.filter(row=>Number(row.packageId)===Number(tier.id)&&String(row.activationKey||"").startsWith("auto-tier:"));
      const activeRows=tierHistory.filter(row=>row.status==="active"&&(!row.expiresAt||new Date(row.expiresAt)>now));

      const belowSnapshotThreshold=activeRows.filter(entitlement=>{
        try {
          const snapshot=JSON.parse(String(entitlement.termsSnapshotJson||"{}"));
          const assignedThreshold=Number(snapshot.minimumQualifyingBalanceUsdMinor??threshold);
          return !Number.isSafeInteger(assignedThreshold)||assignedThreshold<=0||qualifyingTotal<assignedThreshold;
        } catch {
          return qualifyingTotal<threshold;
        }
      });
      for(const entitlement of belowSnapshotThreshold){
        let assignedThreshold=threshold;
        try {
          const snapshot=JSON.parse(String(entitlement.termsSnapshotJson||"{}"));
          assignedThreshold=Number(snapshot.minimumQualifyingBalanceUsdMinor??threshold);
        } catch {}
        await tx.update(customerPackageSubscriptions).set({status:"expired"})
          .where(and(eq(customerPackageSubscriptions.id,entitlement.id),eq(customerPackageSubscriptions.status,"active")));
        await tx.insert(v5AuditEvents).values({
          actorUserId:null,action:"trading_tier_auto_disqualified",entityType:"customer_package_subscription",entityId:String(entitlement.id),
          reason:"A qualifying deposit reversal reduced cumulative qualifying deposits below the threshold recorded in this entitlement's terms snapshot.",
          reference:"trading-tier-revoked:"+userId+":"+tier.id+":"+now.getTime()+":"+crypto.randomUUID().slice(0,8),
          metadataJson:JSON.stringify({userId,packageId:Number(tier.id),subscriptionId:Number(entitlement.id),qualifyingDepositUsdMinor:qualifyingTotal,thresholdUsdMinor:assignedThreshold,configuredThresholdUsdMinor:threshold,termsVersion:Number(tier.termsVersion),source:"scheduled_worker_reconciliation"}),
        });
      }
      const stillActive=activeRows.length>belowSnapshotThreshold.length;
      if(stillActive) continue;
      if(qualifyingTotal<threshold) continue;

      const tierAvailable=Boolean(tier.enabled)&&(!tier.startsAt||new Date(tier.startsAt)<=now)&&(!tier.expiresAt||new Date(tier.expiresAt)>now);
      if(!tierAvailable) continue;
      const latest=tierHistory[0];
      // Do not silently renew an expired entitlement every worker tick. A new
      // qualifying credit or a new administrator terms version can re-assign it.
      if(latest&&Number(latest.qualifyingBalanceUsdMinor)>=qualifyingTotal&&Number(latest.packageTermsVersion)===Number(tier.termsVersion)) continue;

      const expiresAt=addCalendarMonths(now,Number(tier.durationMonths));
      const activationKey="auto-tier:"+userId+":"+tier.id+":"+now.getTime()+":"+crypto.randomUUID().slice(0,8);
      const snapshot={id:Number(tier.id),name:tier.name,minimumQualifyingBalanceUsdMinor:threshold,durationMonths:Number(tier.durationMonths),opportunitiesPerDay:Number(tier.opportunitiesPerDay),maxPopupsPerDay:Number(tier.maxPopupsPerDay||0),maxActiveInvestments:Number(tier.maxActiveInvestments||0),startsAt:tier.startsAt?new Date(tier.startsAt).toISOString():null,expiresAt:tier.expiresAt?new Date(tier.expiresAt).toISOString():null,termsVersion:Number(tier.termsVersion),qualificationSource:"cumulative_authorized_admin_manual_deposit_credits",qualifyingDepositUsdMinor:qualifyingTotal};
      const inserted=await tx.insert(customerPackageSubscriptions).values({
        userId,packageId:Number(tier.id),startsAt:now,expiresAt,status:"active",activationKey,
        termsSnapshotJson:JSON.stringify(snapshot),qualifyingBalanceUsdMinor:qualifyingTotal,
        packageTermsVersion:Number(tier.termsVersion),activatedAt:now,createdAt:now,
      });
      const subscriptionId=Number(inserted[0].insertId);
      await tx.insert(v5AuditEvents).values({
        actorUserId:null,action:"trading_tier_auto_qualified",entityType:"customer_package_subscription",entityId:String(subscriptionId),
        reason:"Scheduled worker reconciled tier eligibility from cumulative qualifying administrator manual deposit credits.",
        reference:"trading-auto-tier:"+userId+":"+tier.id+":"+now.getTime()+":"+crypto.randomUUID().slice(0,8),
        metadataJson:JSON.stringify({subscriptionId,userId,packageId:Number(tier.id),qualifyingDepositUsdMinor:qualifyingTotal,thresholdUsdMinor:threshold,dailyQuota:Number(tier.opportunitiesPerDay),termsVersion:Number(tier.termsVersion),expiresAt:expiresAt.toISOString(),source:"scheduled_worker"}),
      });
      history.unshift({id:subscriptionId,userId,packageId:Number(tier.id),startsAt:now,expiresAt,status:"active",activationKey,termsSnapshotJson:JSON.stringify(snapshot),qualifyingBalanceUsdMinor:qualifyingTotal,packageTermsVersion:Number(tier.termsVersion),activatedAt:now,createdAt:now} as typeof history[number]);
    }
  });
}

/**
 * Process durable qualification jobs created atomically with administrator
 * qualifying-credit/reversal ledger entries. Idle cycles perform only one
 * indexed queue lookup; no full customer scan is required.
 */
export async function runTradingTierQualificationWorkerCycle(options?: { batchSize?: number }) {
  const db=await getDb();
  if(!db) throw new Error("Trading qualification worker database is unavailable.");
  const batchSize=Math.max(1,Math.min(50,Math.floor(options?.batchSize??20)));
  // MySQL TIMESTAMP has second precision here; use a stable persisted lease token.
  // Eligibility keeps full precision; a just-requeued TIMESTAMP may round into the next second.
  // Persist only second-aligned lease tokens for compare-and-set fencing.
  const eligibilityNow=new Date();
  const leaseNow=new Date(Math.floor(eligibilityNow.getTime()/1000)*1000);
  const staleLeaseBefore=new Date(leaseNow.getTime()-5*60_000);
  const jobs=await db.transaction(async tx=>{
    const eligible=await tx.select({
      id:tradingTierQualificationJobs.id,
      userId:tradingTierQualificationJobs.userId,
      sourceLedgerId:tradingTierQualificationJobs.sourceLedgerId,
      attempts:tradingTierQualificationJobs.attempts,
    }).from(tradingTierQualificationJobs).where(or(
      and(eq(tradingTierQualificationJobs.status,"pending"),lte(tradingTierQualificationJobs.availableAt,eligibilityNow)),
      and(eq(tradingTierQualificationJobs.status,"processing"),lt(tradingTierQualificationJobs.lockedAt,staleLeaseBefore)),
    )).orderBy(tradingTierQualificationJobs.id).limit(batchSize).for("update");
    for(const job of eligible){
      await tx.update(tradingTierQualificationJobs).set({
        status:"processing",attempts:Number(job.attempts||0)+1,lockedAt:leaseNow,updatedAt:leaseNow,
      }).where(eq(tradingTierQualificationJobs.id,job.id));
    }
    return eligible.map(job=>({...job,attempts:Number(job.attempts||0)+1,lockedAt:leaseNow}));
  });
  let completed=0,retrying=0,dead=0;
  for(const job of jobs){
    try{
      await ensureAutomaticTradingTierEntitlements(Number(job.userId));
      await db.update(tradingTierQualificationJobs).set({
        status:"completed",lockedAt:null,lastError:null,updatedAt:new Date(),
      }).where(and(
        eq(tradingTierQualificationJobs.id,job.id),
        eq(tradingTierQualificationJobs.status,"processing"),
        eq(tradingTierQualificationJobs.lockedAt,job.lockedAt),
      ));
      completed++;
    }catch(error){
      const message=(error instanceof Error?error.message:"Unknown qualification worker error").slice(0,950);
      const exhausted=job.attempts>=8;
      const delayMs=Math.min(5*60_000,1000*2**Math.min(job.attempts,8));
      await db.update(tradingTierQualificationJobs).set({
        status:exhausted?"dead":"pending",
        availableAt:new Date(Date.now()+delayMs),
        lockedAt:null,lastError:message,updatedAt:new Date(),
      }).where(and(
        eq(tradingTierQualificationJobs.id,job.id),
        eq(tradingTierQualificationJobs.status,"processing"),
        eq(tradingTierQualificationJobs.lockedAt,job.lockedAt),
      ));
      if(exhausted) dead++; else retrying++;
      console.error("[TradingTierWorker] qualification job failed",{
        jobId:job.id,userId:job.userId,sourceLedgerId:job.sourceLedgerId,
        attempt:job.attempts,terminal:exhausted,error:message,
      });
    }
  }
  return {claimed:jobs.length,completed,retrying,dead};
}

export async function getCustomerTradingEligibility(userId:number) {
  const db=await getDb();
  if(!db) throw new Error("Trading eligibility is temporarily unavailable.");
  const now=new Date();
  const rows=await db.select({
    activationKey:customerPackageSubscriptions.activationKey,
    termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson,
    dailyQuota:packages.opportunitiesPerDay,
    packageName:packages.name,
    minimumQualifyingBalanceUsdMinor:packages.minimumQualifyingBalanceUsdMinor,
    durationMonths:packages.durationMonths,
  }).from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(and(
      eq(customerPackageSubscriptions.userId,userId),
      eq(customerPackageSubscriptions.status,"active"),
      lte(customerPackageSubscriptions.startsAt,now),
      or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),
      or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
    ));
  const eligibleRows=rows.filter(row=>String(row.activationKey||"").startsWith("auto-tier:"));
  const snapshotFor=(row:typeof rows[number])=>{
    try { return JSON.parse(String(row.termsSnapshotJson||"{}")); } catch { return {}; }
  };
  const dailyOpportunityAllowance=eligibleRows.reduce((total,row)=>{
    const quota=Number(snapshotFor(row).opportunitiesPerDay??row.dailyQuota);
    return total+(Number.isSafeInteger(quota)&&quota>=0?quota:0);
  },0);
  if(!Number.isSafeInteger(dailyOpportunityAllowance)||dailyOpportunityAllowance<0) throw new Error("Trading eligibility quota is invalid.");

  // The customer receives only their highest active tier and the single next threshold,
  // never the full administrator-managed catalogue.
  const activePackages=eligibleRows.map(row=>{
    const snapshot=snapshotFor(row);
    return {
      name:String(row.packageName),
      minimumQualifyingBalanceUsdMinor:Number(snapshot.minimumQualifyingBalanceUsdMinor??row.minimumQualifyingBalanceUsdMinor),
      durationMonths:Number(snapshot.durationMonths??row.durationMonths),
      opportunitiesPerDay:Number(snapshot.opportunitiesPerDay??row.dailyQuota),
    };
  }).filter(tier=>Number.isSafeInteger(tier.minimumQualifyingBalanceUsdMinor)&&tier.minimumQualifyingBalanceUsdMinor>0)
    .sort((a,b)=>b.minimumQualifyingBalanceUsdMinor-a.minimumQualifyingBalanceUsdMinor);
  const qualifyingRows=await db.select({
    qualifyingDepositUsdMinor:balanceLedger.qualifyingDepositUsdMinor,
  }).from(balanceLedger).where(and(
    eq(balanceLedger.userId,userId),
    inArray(balanceLedger.entryType,["admin_manual_deposit_credit","admin_manual_deposit_reversal"]),
  ));
  const qualifyingUsdMinor=qualifyingRows.reduce((total,row)=>{
    const amount=Number(row.qualifyingDepositUsdMinor||0);
    return Number.isSafeInteger(amount)?total+amount:total;
  },0);
  if(!Number.isSafeInteger(qualifyingUsdMinor)) throw new Error("Trading qualifying-deposit total is invalid.");
  const qualifyingDepositUsdMinor=Math.max(0,qualifyingUsdMinor);
  const tiers=await db.select({
    name:packages.name,
    minimumQualifyingBalanceUsdMinor:packages.minimumQualifyingBalanceUsdMinor,
    durationMonths:packages.durationMonths,
    opportunitiesPerDay:packages.opportunitiesPerDay,
  }).from(packages).where(and(
    eq(packages.enabled,true),
    or(isNull(packages.startsAt),lte(packages.startsAt,now)),
    or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
  ));
  tiers.sort((a,b)=>Number(a.minimumQualifyingBalanceUsdMinor)-Number(b.minimumQualifyingBalanceUsdMinor));
  const nextTier=tiers.find(tier=>Number(tier.minimumQualifyingBalanceUsdMinor)>qualifyingDepositUsdMinor);
  const currentPackage=activePackages[0]||null;
  const nextPackage=nextTier?{
    name:nextTier.name,
    minimumQualifyingBalanceUsdMinor:Number(nextTier.minimumQualifyingBalanceUsdMinor),
    amountNeededUsdMinor:Math.max(0,Number(nextTier.minimumQualifyingBalanceUsdMinor)-qualifyingDepositUsdMinor),
    durationMonths:Number(nextTier.durationMonths),
    additionalDailyOpportunities:Number(nextTier.opportunitiesPerDay),
  }:null;
  return {
    eligible:eligibleRows.length>0,
    dailyOpportunityAllowance,
    status:eligibleRows.length>0?"eligible":"not_eligible",
    qualifyingDepositUsdMinor,
    currentPackage,
    nextPackage,
  };
}


export async function previewNextCustomerCompanySpotlight(userId:number) {
  const eligibility=await getCustomerTradingEligibility(userId);
  const packageName=String(eligibility.currentPackage?.name||"").trim();
  if(!eligibility.eligible||!packageName) throw new Error("An active automatically assigned Trading tier is required for company spotlight preview.");
  const policies=await listPersistedOpportunityPackagePolicies();
  const policy=policies.find(row=>row.packageName===packageName);
  if(!policy) throw new Error("The active Trading tier has no saved company rotation policy.");
  if(!policy.companyRotationEnabled) return null;
  const db=await getDb();
  if(!db) throw new Error("Company spotlight preview is temporarily unavailable.");
  const catalogueRow=(await db.select({settingValue:appSettings.settingValue})
    .from(appSettings).where(eq(appSettings.settingKey,"trade.companyCatalogue.adminState")).limit(1))[0];
  const catalogueState=parseCompanyCatalogueAdminState(catalogueRow?.settingValue??"{}");
  const pool=buildCompanySpotlightPool(String(policy.companyRotationCountryNames||""),catalogueState);
  if(!pool.length) return null;
  const stateKey="trading.companyRotation."+userId+"."+packageName;
  if(stateKey.length>120) throw new Error("Company rotation scope key exceeds the storage limit.");

  // Preview reads the next approved candidate but never creates a cursor row or advances
  // production state. The worker assigns the company inside the opportunity transaction.
  const row=(await db.select({settingValue:appSettings.settingValue})
    .from(appSettings).where(eq(appSettings.settingKey,stateKey)).limit(1))[0];
  let priorState:CompanySpotlightState|null=null;
  try { const parsed=JSON.parse(String(row?.settingValue||"")); if(parsed&&typeof parsed==="object") priorState=parsed as CompanySpotlightState; } catch {}
  const repeatPolicy=String(policy.companyRotationRepeatPolicy||"avoid_until_exhausted") as "avoid_until_exhausted"|"allow_repeats";
  const result=nextCompanySpotlight(pool,priorState,userId,packageName,repeatPolicy);
  return {...result.company,adminCatalogueStatus:"verified" as const,referenceOnly:true as const,rotationCycle:result.rotationCycle,rotationSequence:result.rotationSequence,poolFingerprint:result.poolFingerprint,packageName,previewOnly:true as const};
}

/** Runtime reads never create policy rows from schema defaults; tiers without saved policy are ineligible. */
function hasConfiguredTradingOfferPolicy(policy:any):boolean {
  if(!policy) return false;
  const minRate=policy.minimumPayoutRateBps==null?NaN:Number(policy.minimumPayoutRateBps);
  const maxRate=policy.maximumPayoutRateBps==null?NaN:Number(policy.maximumPayoutRateBps);
  const minDuration=policy.minimumTradeDurationSeconds==null?NaN:Number(policy.minimumTradeDurationSeconds);
  const maxDuration=policy.maximumTradeDurationSeconds==null?NaN:Number(policy.maximumTradeDurationSeconds);
  return Number.isSafeInteger(minRate)&&Number.isSafeInteger(maxRate)&&minRate>=1&&maxRate>=minRate&&maxRate<=5000&&
    Number.isSafeInteger(minDuration)&&Number.isSafeInteger(maxDuration)&&minDuration>=10&&maxDuration>=minDuration&&maxDuration<=86400;
}

export async function listOpportunityPackagePolicies() {
  const db=await getDb();
  if(!db) throw new Error("Database is not available");
  const [tiers,rows]=await Promise.all([
    db.select({name:packages.name}).from(packages),
    db.select().from(opportunityPackagePolicies),
  ]);
  const tierNames=new Set(tiers.map(tier=>tier.name));
  return rows.filter(row=>tierNames.has(row.packageName));
}

/** Read-only policy snapshot; missing rows fail closed until admin/worker reconciliation creates them. */
export async function listPersistedOpportunityPackagePolicies() {
  const db=await getDb();
  if(!db) throw new Error("Database is not available");
  const [tiers,rows]=await Promise.all([
    db.select({name:packages.name}).from(packages),
    db.select().from(opportunityPackagePolicies),
  ]);
  const tierNames=new Set(tiers.map(tier=>tier.name));
  const matchingRows=rows.filter(row=>tierNames.has(row.packageName));
  const policyNames=new Set(matchingRows.map(row=>row.packageName));
  const missing=tiers.filter(tier=>!policyNames.has(tier.name)).map(tier=>tier.name);
  if(missing.length) throw new Error("Trading tier opportunity policy is missing for: "+missing.join(", "));
  return matchingRows;
}
export async function updateOpportunityPackagePolicies(updatedBy:number, policies:any[], reason:string) {
  const auditReason=String(reason??"").trim();
  if(auditReason.length<5||auditReason.length>500) throw new Error("Provide an audit reason of 5–500 characters");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const tiers=await db.select({name:packages.name}).from(packages);
  const tierNames=new Set(tiers.map(tier=>tier.name));
  const seenTierNames=new Set<string>();
  const requested=policies.map(policy=>{
    if(typeof policy.packageName!=="string"||!tierNames.has(policy.packageName)) throw new Error("Opportunity policy references an unknown Trading tier");
    if(seenTierNames.has(policy.packageName)) throw new Error("Each Trading tier may appear only once in a policy update.");
    seenTierNames.add(policy.packageName);
    return policy;
  });
  await db.transaction(async tx=>{
    // Lock before merging so concurrent partial saves cannot overwrite fields
    // omitted from the other administrator's request.
    for(const policy of requested){
      const current=(await tx.select().from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,policy.packageName)).limit(1).for("update"))[0];
      const supplied:any={};
      for(const [key,value] of Object.entries(policy)){
        if(value!==undefined&&!['id','updatedAt','policyVersion','updatedBy'].includes(key)) supplied[key]=value;
      }
      const effective:any={...UNCONFIGURED_TIER_POLICY_SENTINELS,...(current||{}),...supplied,packageName:policy.packageName,updatedBy};
      if(effective.minHourlyTarget>effective.normalHourlyTarget) throw new Error(`Minimum hourly target cannot exceed normal target for ${policy.packageName}`);
      if(effective.normalHourlyTarget*24>effective.maxPopupsPerDay&&effective.maxPopupsPerDay>0) throw new Error(`Normal hourly target exceeds daily quota for ${policy.packageName}`);
      if(!Number.isSafeInteger(effective.minimumTradeUnits)||!Number.isSafeInteger(effective.maximumTradeUnits)||effective.minimumTradeUnits<1||effective.maximumTradeUnits<effective.minimumTradeUnits) throw new Error(`Trade amount bounds are invalid for ${policy.packageName}`);
      const badgeLabel=effective.badgeLabel==null||String(effective.badgeLabel).trim()===""?null:String(effective.badgeLabel).trim();
      const badgeStyle=String(effective.badgeStyle??"neutral");
      if(badgeLabel!==null&&badgeLabel.length>40) throw new Error(`Badge label must be at most 40 characters for ${policy.packageName}`);
      if(!["neutral","blue","purple","gold","green"].includes(badgeStyle)) throw new Error(`Badge style is not allowed for ${policy.packageName}`);
      const minimumPayoutRateBps=effective.minimumPayoutRateBps==null?null:Number(effective.minimumPayoutRateBps);
      const maximumPayoutRateBps=effective.maximumPayoutRateBps==null?null:Number(effective.maximumPayoutRateBps);
      if((minimumPayoutRateBps===null)!==(maximumPayoutRateBps===null)) throw new Error(`Set both published reward-rate bounds or leave both blank for ${policy.packageName}`);
      if(minimumPayoutRateBps!==null&&(maximumPayoutRateBps===null||!Number.isSafeInteger(minimumPayoutRateBps)||!Number.isSafeInteger(maximumPayoutRateBps)||minimumPayoutRateBps<0||maximumPayoutRateBps<minimumPayoutRateBps||maximumPayoutRateBps>5000)) throw new Error(`Published reward-rate bounds must satisfy 0 ≤ minimum ≤ maximum ≤ 5000 bps for ${policy.packageName}`);
      const companyRotationEnabled=effective.companyRotationEnabled==null?false:Boolean(effective.companyRotationEnabled);
      const normalizedCompanyRotationCountryNames=normalizeCompanyRotationCountryNames(effective.companyRotationCountryNames??"");
      const companyRotationCountryNames=normalizedCompanyRotationCountryNames||null;
      const companyRotationRepeatPolicy=String(effective.companyRotationRepeatPolicy??"avoid_until_exhausted");
      if(!["avoid_until_exhausted","allow_repeats"].includes(companyRotationRepeatPolicy)) throw new Error(`Company rotation repeat policy is invalid for ${policy.packageName}`);
      // The approved pool is customer/admin state, so validate only the country-folder syntax here.
      // A package may legitimately have no currently verified company; delivery then omits the company identity.
      const minimumTradeDurationSeconds=effective.minimumTradeDurationSeconds==null?null:Number(effective.minimumTradeDurationSeconds);
      const maximumTradeDurationSeconds=effective.maximumTradeDurationSeconds==null?null:Number(effective.maximumTradeDurationSeconds);
      if((minimumTradeDurationSeconds===null)!==(maximumTradeDurationSeconds===null)) throw new Error(`Set both published duration bounds or leave both blank for ${policy.packageName}`);
      if(minimumTradeDurationSeconds!==null&&(maximumTradeDurationSeconds===null||!Number.isSafeInteger(minimumTradeDurationSeconds)||!Number.isSafeInteger(maximumTradeDurationSeconds)||minimumTradeDurationSeconds<10||maximumTradeDurationSeconds<minimumTradeDurationSeconds||maximumTradeDurationSeconds>86400)) throw new Error(`Published duration bounds must satisfy 10 ≤ minimum ≤ maximum ≤ 86400 seconds for ${policy.packageName}`);
      if(typeof effective.enabled!=="boolean"||typeof effective.automaticDelivery!=="boolean"||typeof effective.automaticTradingEnabled!=="boolean") throw new Error(`Policy and automation switches must be explicitly set for ${policy.packageName}`);
      const automation={
        packageName:policy.packageName,
        enabled:effective.enabled,
        automaticDelivery:effective.automaticDelivery,
        dailyPopupTarget:effective.dailyPopupTarget,
        schedulingPeriod:effective.schedulingPeriod,
        minIntervalSeconds:effective.minIntervalSeconds,
        maxIntervalSeconds:effective.maxIntervalSeconds,
        randomizationEnabled:effective.randomizationEnabled,
        popupDisplayTargetSeconds:effective.popupDisplayTargetSeconds,
        completionDisplaySeconds:effective.completionDisplaySeconds,
        postCompletionIntervalSeconds:effective.postCompletionIntervalSeconds,
        maxPendingDeliveries:effective.maxPendingDeliveries,
        maxDeliveryAttempts:effective.maxDeliveryAttempts,
        automaticTradingEnabled:effective.automaticTradingEnabled,
        maxTradeAttemptsPerDay:effective.maxTradeAttemptsPerDay,
        tradeRetryDelaySeconds:effective.tradeRetryDelaySeconds,
        maxSuccessfulTradesPerDay:effective.maxSuccessfulTradesPerDay,
        maxConcurrentActiveTrades:effective.maxConcurrentActiveTrades,
        requirePreviousSettlement:effective.requirePreviousSettlement,
        minSettlementDelaySeconds:effective.minSettlementDelaySeconds,
        maxSettlementDelaySeconds:effective.maxSettlementDelaySeconds,
        minimumRewardBps:effective.minimumRewardBps,
        maxDailyRewardMinor:effective.maxDailyRewardMinor,
        maxRewardPerTradeMinor:effective.maxRewardPerTradeMinor,
        closePolicy:effective.closePolicy,
      };
      const requiresConfiguredOfferTerms=automation.enabled&&automation.automaticDelivery;
      if(requiresConfiguredOfferTerms&&(minimumPayoutRateBps===null||maximumPayoutRateBps===null||minimumPayoutRateBps<1||minimumTradeDurationSeconds===null||maximumTradeDurationSeconds===null)) throw new Error(`Set valid published reward-rate and duration bounds before enabling delivery for ${policy.packageName}`);
      if(automation.automaticTradingEnabled&&(!automation.enabled||!automation.automaticDelivery)) throw new Error(`Automatic trading requires an enabled delivery policy for ${policy.packageName}`);
      validatePackageAutomationPolicy(automation);
      if(automation.minIntervalSeconds>automation.maxIntervalSeconds) throw new Error(`Delivery interval minimum exceeds maximum for ${policy.packageName}`);
      if(automation.minSettlementDelaySeconds>automation.maxSettlementDelaySeconds) throw new Error(`Settlement delay minimum exceeds maximum for ${policy.packageName}`);
      const values:any={...effective,...automation,badgeLabel,badgeStyle,minimumPayoutRateBps,maximumPayoutRateBps,minimumTradeDurationSeconds,maximumTradeDurationSeconds,companyRotationEnabled,companyRotationCountryNames,companyRotationRepeatPolicy,updatedBy};
      delete values.id; delete values.updatedAt; delete values.policyVersion;
      const currentVersion=Number(current?.policyVersion||0);
      const nextVersion=current?currentVersion+1:1;
      if(!Number.isSafeInteger(nextVersion)||nextVersion<1) throw new Error(`Trading policy version is invalid for ${policy.packageName}`);
      const next={...values,policyVersion:nextVersion,updatedAt:new Date()};
      if(current){
        await tx.update(opportunityPackagePolicies).set(next).where(eq(opportunityPackagePolicies.id,current.id));
      }else{
        await tx.insert(opportunityPackagePolicies).values(next);
      }
      await tx.insert(v5AuditEvents).values({
        actorUserId:updatedBy,action:"trading_delivery_policy_updated",
        entityType:"opportunity_package_policy",entityId:String(current?.id??policy.packageName),
        reason:auditReason,
        reference:"trading-delivery-policy:"+policy.packageName+":"+nextVersion,
        metadataJson:JSON.stringify({packageName:policy.packageName,previousVersion:currentVersion||null,nextVersion,oldPolicy:current||null,newPolicy:next}),
      });
    }
  });
  return listOpportunityPackagePolicies();
}
async function listMissedOpportunities(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");return db.select().from(missedOpportunities).where(and(eq(missedOpportunities.userId,userId),eq(missedOpportunities.status,"MISSED"))).orderBy(desc(missedOpportunities.createdAt)).limit(50);}
async function markMissedOpportunity(userId:number,offer:any,amountMinor:number,reason:string){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const terms=calculateTradeTerms(userId,offer,amountMinor);
  const potentialRewardMinor=Math.floor(amountMinor*terms.rewardBps/10000);
  const balance=(await listBalances(userId)).find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase());
  const availableMinorAtOpportunity=Math.max(0,Number(balance?.availableMinor||0));
  const shortfallMinor=Math.max(0,amountMinor-availableMinorAtOpportunity);
  await db.insert(missedOpportunities).values({
    userId,offerId:offer.id,symbol:offer.symbol,currency:offer.currency,amountMinor,
    availableMinorAtOpportunity,shortfallMinor,potentialRewardMinor,expectedRewardBps:terms.rewardBps,
    reason,status:"MISSED",
  }).onDuplicateKeyUpdate({set:{updatedAt:new Date(),potentialRewardMinor,availableMinorAtOpportunity,shortfallMinor,reason}});
}
async function markOpportunityExecuted(userId:number,offerId:number,executionLeaseToken:string){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  await db.update(missedOpportunities).set({status:"EXECUTED",updatedAt:new Date()})
    .where(and(eq(missedOpportunities.userId,userId),eq(missedOpportunities.offerId,offerId)));
  await db.update(opportunityPopupEvents).set({executionStatus:"SUCCEEDED",executionRetryAfter:null,executionLastErrorCode:null,updatedAt:new Date()})
    .where(and(eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.offerId,offerId),eq(opportunityPopupEvents.eventStatus,"TRADED"),eq(opportunityPopupEvents.executionLeaseToken,executionLeaseToken)));
}
export async function claimOpportunityExecutionAttempt(userId:number, offer:any){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.transaction(async tx=>{
    // Match createTrade's customer-first lock order and serialize all claims for
    // this customer, including claims on different opportunity events.
    const userLock=await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`) as any;
    if(!userLock?.[0]?.[0]?.id) return {claimed:false,reason:"customer-unavailable"};
    const event=(await tx.select({
      id:opportunityPopupEvents.id,eventStatus:opportunityPopupEvents.eventStatus,tradeId:opportunityPopupEvents.tradeId,
      packageName:opportunityPopupEvents.packageName,
      executionStatus:opportunityPopupEvents.executionStatus,executionAttemptCount:opportunityPopupEvents.executionAttemptCount,executionLeaseToken:opportunityPopupEvents.executionLeaseToken,
      executionRetryAfter:opportunityPopupEvents.executionRetryAfter,executionRetryDay:opportunityPopupEvents.executionRetryDay,executionDailyAttemptCount:opportunityPopupEvents.executionDailyAttemptCount,executionDailyAttemptDay:opportunityPopupEvents.executionDailyAttemptDay,executionLastErrorCode:opportunityPopupEvents.executionLastErrorCode,
    }).from(opportunityPopupEvents).where(and(eq(opportunityPopupEvents.id,Number(offer.deliveryEventId)),eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.offerId,Number(offer.offerId)))).limit(1).for("update"))[0];
    if(!event||event.tradeId||["TRADED","SETTLED"].includes(String(event.eventStatus))||String(event.executionStatus)==="SUCCEEDED") return {claimed:false,reason:"terminal"};
    if(String(event.executionStatus)==="FAILED") return {claimed:false,reason:"failed",errorCode:String((event as any).executionLastErrorCode||"TEMPORARY_EXECUTION_RETRIES_EXHAUSTED")};
    const now=new Date();
    const day=now.toISOString().slice(0,10);
    const attempts=Number(event.executionAttemptCount||0);
    if(attempts>0&&event.executionRetryDay&&String(event.executionRetryDay)!==day){
      await tx.update(opportunityPopupEvents).set({executionStatus:"FAILED",executionRetryAfter:null,executionLastErrorCode:"TEMPORARY_EXECUTION_RETRY_WINDOW_EXPIRED",updatedAt:now}).where(eq(opportunityPopupEvents.id,event.id));
      return {claimed:false,reason:"retry-window-expired"};
    }
    if(event.executionRetryAfter&&new Date(event.executionRetryAfter).getTime()>now.getTime()) return {claimed:false,reason:"waiting"};
    const policy=(await tx.select({maxTradeAttemptsPerDay:opportunityPackagePolicies.maxTradeAttemptsPerDay})
      .from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,String(event.packageName||""))).limit(1).for("update"))[0];
    if(!policy) return {claimed:false,reason:"policy-unavailable"};
    const dailyAttemptLimit=Number(policy.maxTradeAttemptsPerDay);
    if(!Number.isSafeInteger(dailyAttemptLimit)||dailyAttemptLimit<0) return {claimed:false,reason:"policy-invalid"};
    if(dailyAttemptLimit>0){
      const usedRows=await tx.execute(sql`SELECT COALESCE(SUM(executionDailyAttemptCount),0) AS count
        FROM opportunity_popup_events WHERE userId=${userId} AND executionDailyAttemptDay=${day}`) as any;
      const usedAttempts=Number(usedRows?.[0]?.[0]?.count||0);
      if(usedAttempts>=dailyAttemptLimit){
        const nextDayStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
        await tx.update(opportunityPopupEvents).set({
          executionStatus:"RETRYING",executionRetryAfter:nextDayStart,
          executionLastErrorCode:"DAILY_TRADE_ATTEMPT_LIMIT_REACHED",updatedAt:now,
        }).where(eq(opportunityPopupEvents.id,event.id));
        return {claimed:false,reason:"daily-attempt-limit",usedAttempts,dailyAttemptLimit};
      }
    }
    const executionLeaseToken=crypto.randomUUID();
    await tx.update(opportunityPopupEvents).set({
      executionStatus:"RUNNING",executionAttemptCount:attempts+1,executionLeaseToken,
      executionDailyAttemptCount:String(event.executionDailyAttemptDay||"")===day?Number(event.executionDailyAttemptCount||0)+1:1,
      executionDailyAttemptDay:day,
      executionRetryAfter:new Date(now.getTime()+Math.max(5,Math.min(3600,Number(offer.tradeRetryDelaySeconds)||30))*1000),executionRetryDay:day,updatedAt:now,
    }).where(eq(opportunityPopupEvents.id,event.id));
    return {claimed:true,attemptNumber:attempts+1,eventId:Number(event.id),executionLeaseToken};
  });
}
async function recordOpportunityExecutionFailure(userId:number,eventId:number, state:{status:"RETRYING"|"FAILED";retryAt?:Date;errorCode:string;attemptNumber?:number;releaseAttempt?:boolean;executionLeaseToken:string}){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const set:any={executionStatus:state.status,executionRetryAfter:state.retryAt||null,executionLastErrorCode:state.errorCode,updatedAt:now};
  if(state.releaseAttempt&&Number.isSafeInteger(state.attemptNumber)) set.executionAttemptCount=Math.max(0,Number(state.attemptNumber)-1);
  if(state.status==="RETRYING") set.executionRetryDay=now.toISOString().slice(0,10);
  await db.update(opportunityPopupEvents).set(set).where(and(eq(opportunityPopupEvents.id,eventId),eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.executionLeaseToken,state.executionLeaseToken),notInArray(opportunityPopupEvents.eventStatus,["TRADED","SETTLED"])));
}
async function autoTradeOpenOpportunities(userId:number,offers:any[],controls:any){
  const executed:any[]=[];
  if(controls.accountStatus!=="active") return {executed,missed:await listMissedOpportunities(userId)};
  const existingTrades:any[]=await listTrades(userId);
  const existingMisses=await listMissedOpportunities(userId);
  const missedOfferIds=new Set(existingMisses.map((row:any)=>Number(row.offerId)));
  for(const offer of offers){
    // A pending/retrying card is not a delivered opportunity and must never trigger
    // a trade. Only authoritative DELIVERED/NOTICED popup states are eligible.
    if(offer.executionEligible!==true) continue;
    if(existingTrades.some((trade:any)=>Number(trade.offerId)===Number(offer.id))||missedOfferIds.has(Number(offer.id))) continue;
    const offerMinimum=Number(offer.minimumMinor);
    const packageMinimum=Number(offer.packageMinimumTradeMinor||0);
    const requestedAmount=Math.max(offerMinimum,packageMinimum);
    const packageMaximum=Number(offer.packageMaximumTradeMinor??Number.MAX_SAFE_INTEGER);
    if(!Number.isSafeInteger(requestedAmount)||requestedAmount<=0||requestedAmount>packageMaximum){
      await markMissedOpportunity(userId,offer,Math.max(1,Number.isFinite(requestedAmount)?requestedAmount:offerMinimum),"PACKAGE_TRADE_LIMIT_UNSATISFIABLE");
      missedOfferIds.add(Number(offer.id));
      continue;
    }
    const balance=(await listBalances(userId)).find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase());
    if(!balance||Number(balance.availableMinor)<requestedAmount){
      await markMissedOpportunity(userId,offer,requestedAmount,"INSUFFICIENT_AVAILABLE_BALANCE");
      missedOfferIds.add(Number(offer.id));
      continue;
    }
    const terms=calculateTradeTerms(userId,offer,requestedAmount);
    const claim=await claimOpportunityExecutionAttempt(userId,offer);
    if(!claim.claimed){
      if(claim.reason==="retry-window-expired"||claim.reason==="attempts-exhausted"||claim.reason==="failed"){
        const reason=claim.reason==="retry-window-expired"?"TEMPORARY_EXECUTION_RETRY_WINDOW_EXPIRED":claim.reason==="failed"?String((claim as any).errorCode||"TEMPORARY_EXECUTION_RETRIES_EXHAUSTED"):"TEMPORARY_EXECUTION_RETRIES_EXHAUSTED";
        await markMissedOpportunity(userId,offer,requestedAmount,reason);
        missedOfferIds.add(Number(offer.id));
      }
      continue;
    }
    const executionLeaseToken=claim.executionLeaseToken;
    if(!executionLeaseToken) continue;
    try{
      const result=await createTrade(userId,{
        offerId:offer.id,amountMinor:requestedAmount,executionLeaseToken,
        deliveryEventId:offer.deliveryEventId ? Number(offer.deliveryEventId) : undefined,
        packageSubscriptionId:Number(offer.packageSubscriptionId||0)||undefined,
        packageId:Number(offer.packageId||0)||undefined,
      });
      await markOpportunityExecuted(userId,offer.id,executionLeaseToken);
      executed.push({...result,offerId:offer.id,symbol:offer.symbol,amountMinor:requestedAmount,rewardBps:Number(result.rewardBps),calculationMethod:String(result.calculationMethod||"saved-tier-policy")});
      existingTrades.push({offerId:offer.id,confirmedAt:new Date()});
      break;
    }catch(error){
      const message=error instanceof Error?error.message:"AUTO_TRADE_REJECTED";
      // A reclaimed event belongs to the newer lease owner. The stale worker must
      // not convert that event into a missed opportunity or overwrite retry state.
      if(/execution lease was lost/i.test(message)) continue;
      if(/already been allocated|duplicate/i.test(message)) continue;
      // A pause must not consume the configured retry budget; release the claim
      // and wait briefly so the durable worker can resume after the administrator unpauses.
      if(/new trading allocations are paused by an administrator/i.test(message)){
        await recordOpportunityExecutionFailure(userId,Number(claim.eventId),{status:"RETRYING",retryAt:new Date(Date.now()+Math.max(5,Math.min(3600,Number(offer.tradeRetryDelaySeconds)||30))*1000),errorCode:"ALLOCATION_PAUSED",attemptNumber:claim.attemptNumber,releaseAttempt:true,executionLeaseToken});
        continue;
      }
      const decision=decideTradeExecutionRetry(error,Number(claim.attemptNumber),MAX_TRANSIENT_ATTEMPTS_PER_OPPORTUNITY,new Date(),Math.max(5,Math.min(3600,Number(offer.tradeRetryDelaySeconds)||30)));
      if(decision.kind==="retry"){
        await recordOpportunityExecutionFailure(userId,Number(claim.eventId),{status:"RETRYING",retryAt:decision.retryAt,errorCode:decision.errorCode,executionLeaseToken});
        continue;
      }
      await recordOpportunityExecutionFailure(userId,Number(claim.eventId),{status:"FAILED",errorCode:decision.errorCode,executionLeaseToken:claim.executionLeaseToken});
      await markMissedOpportunity(userId,offer,requestedAmount,decision.errorCode);
      missedOfferIds.add(Number(offer.id));
    }
  }
  return {executed,missed:await listMissedOpportunities(userId)};
}
export async function listCustomerOpportunities(userId:number, options:{consumeDelivery?:boolean;workerCycle?:boolean}={}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const quotaDay=now.toISOString().slice(0,10);
  const settled:Array<{tradeId:number;rewardMinor:number;currency:string;totalMinor:number}>=[];
  if(options.workerCycle===true) await markDueTradesAwaitingConfirmation(userId);
  const controls=await ensureCustomerControls(userId);
  const emptyResult=async (delivery:any)=>({offers:[],missed:await listMissedOpportunities(userId),autoTrades:[],settled,delivery});
  if(controls.accountStatus!=="active") return emptyResult({packageName:"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,accountInactive:true,popupPolicy:{}});
  const subscriptions=(await db.select({
    subscriptionId:customerPackageSubscriptions.id,packageId:packages.id,packageName:packages.name,
    activationKey:customerPackageSubscriptions.activationKey,
    packageQuota:packages.opportunitiesPerDay,packageMaxPopupsPerDay:packages.maxPopupsPerDay,termsVersion:packages.termsVersion,termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson,
    expiresAt:customerPackageSubscriptions.expiresAt,startsAt:customerPackageSubscriptions.startsAt,
  }).from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(and(eq(customerPackageSubscriptions.userId,userId),eq(customerPackageSubscriptions.status,"active"),
      lte(customerPackageSubscriptions.startsAt,now),or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)))).orderBy(customerPackageSubscriptions.expiresAt))
    .filter(subscription=>String(subscription.activationKey||"").startsWith("auto-tier:"));
  if(!subscriptions.length) return emptyResult({packageName:"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,noPackage:true,popupPolicy:{}});
  const packagePolicies=await listOpportunityPackagePolicies();
  const policyByName=new Map<string,typeof packagePolicies[number]>();
  for(const policyRow of packagePolicies) policyByName.set(policyRow.packageName,policyRow);
  // Package-level delivery controls apply before any new popup or quota is
  // assigned. Automatic trading can be disabled independently while delivery
  // remains available for an administrator-configured review workflow.
  const eligibleSubscriptions=subscriptions.filter(subscription=>{
    const configured=policyByName.get(subscription.packageName);
    return Boolean(configured && configured.enabled && configured.automaticDelivery && hasConfiguredTradingOfferPolicy(configured));
  });
  if(!eligibleSubscriptions.length) return emptyResult({packageName:subscriptions.map(row=>row.packageName).join(", "),maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,packagePolicyPaused:true,popupPolicy:{}});
  const quotaFor=(subscription:any)=>{
    try { const snapshot=JSON.parse(String(subscription.termsSnapshotJson||"{}")); const value=Number(snapshot.opportunitiesPerDay??subscription.packageQuota); return Number.isSafeInteger(value)&&value>0?value:0; }
    catch { const value=Number(subscription.packageQuota); return Number.isSafeInteger(value)&&value>0?value:0; }
  };
  const quotaByPackage=new Map<string,number>();
  for(const subscription of eligibleSubscriptions) quotaByPackage.set(subscription.packageName,(quotaByPackage.get(subscription.packageName)||0)+quotaFor(subscription));
  const combinedQuota=[...quotaByPackage.values()].reduce((sum,value)=>sum+value,0);
  if(combinedQuota<=0) return emptyResult({packageName:eligibleSubscriptions.map(row=>row.packageName).join(", "),maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,packageQuotaExhausted:true,popupPolicy:{}});
  const currencyRows=await listCurrencies();
  const configuredPolicies=eligibleSubscriptions.map(subscription=>policyByName.get(subscription.packageName)).filter((row:any)=>Boolean(row));
  const policy=configuredPolicies[0]||null;
  const packageName=[...new Set(eligibleSubscriptions.map(row=>row.packageName))].join(", ");
  const tierDeliveryCaps=eligibleSubscriptions.map(subscription=>{
    const row=policyByName.get(subscription.packageName);
    let snapshot:any={};try{snapshot=JSON.parse(String(subscription.termsSnapshotJson||"{}"))}catch{snapshot={}}
    return {
      quota:quotaFor(subscription),policyMaxPopupsPerDay:row?.maxPopupsPerDay,
      packageMaxPopupsPerDay:snapshot.maxPopupsPerDay??subscription.packageMaxPopupsPerDay,
      dailyPopupTarget:row?.dailyPopupTarget,maxVisibleOffers:row?.maxVisibleOffers,
    };
  });
  const {maxPopupsPerDay,maxVisibleOffers}=calculateTierDeliveryCaps(tierDeliveryCaps);
  const effectiveSchedulingPeriod=configuredPolicies.some((row:any)=>row.schedulingPeriod==="rolling_24h")?"rolling_24h":"calendar_day";
  const quotaWindow=resolveTradingQuotaWindow(now,effectiveSchedulingPeriod);
  const popupPolicy={
    popupMinGapSeconds:Math.max(0,Number(policy?.minIntervalSeconds||0)),
    popupDisplaySeconds:Math.max(1,Number(policy?.popupDisplayTargetSeconds||120)),
    popupMaxPerHour:maxPopupsPerDay,
    popupPreAlertProbabilityBps:0,popupPreAlertSeconds:0,popupWithdrawalProbabilityBps:0,
    popupJitterSeconds:policy?.randomizationEnabled?Math.max(0,Number(policy?.maxIntervalSeconds||0)-Number(policy?.minIntervalSeconds||0)):0,
  };
  const offerRows=await db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt).limit(5000);
  const tradeHistory=await listTrades(userId);
  const tradeOfferIds=new Set(tradeHistory.map((row:any)=>Number(row.offerId)));
  const missedHistory=await listMissedOpportunities(userId);
  const missedOfferIds=new Set(missedHistory.map((row:any)=>Number(row.offerId)));
  const deliveredToday=await db.select({offerId:opportunityDeliveryEvents.offerId,status:opportunityDeliveryEvents.status}).from(opportunityDeliveryEvents).where(and(
    eq(opportunityDeliveryEvents.userId,userId),gte(opportunityDeliveryEvents.deliveredAt,quotaWindow.start),
    lt(opportunityDeliveryEvents.deliveredAt,quotaWindow.end),notInArray(opportunityDeliveryEvents.status,["failed"])
  ));
  const deliveredOfferIds=new Set(deliveredToday.filter(row=>row.status!=="failed").map(row=>Number(row.offerId)));
  const deliveredOfferCount=countConsumedDeliveryOffers(deliveredToday);
  // Package copies are separate entitlements: count allocations against each
  // subscription's own quota window instead of pooling copies under package name.
  const usedQuotaRows=await db.execute(sql`SELECT packageSubscriptionId,COUNT(*) AS used FROM trade_positions
    WHERE userId=${userId} AND packageSubscriptionId IS NOT NULL
      AND confirmedAt>=${quotaWindow.start} AND confirmedAt<${quotaWindow.end}
      AND status<>'cancelled'
    GROUP BY packageSubscriptionId`) as any;
  const usedBySubscription=new Map<number,number>();
  for(const row of (usedQuotaRows?.[0]||[])) usedBySubscription.set(Number(row.packageSubscriptionId),Number(row.used||0));
  const subscriptionHasQuota=(subscription:any)=>{
    const dailyQuota=quotaFor(subscription);
    return dailyQuota>0&&(usedBySubscription.get(Number(subscription.subscriptionId))||0)<dailyQuota;
  };
  const activePopupRows=await db.select({
    eventId:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,packageName:opportunityPopupEvents.packageName,
    symbol:opportunityPopupEvents.symbol,currency:opportunityPopupEvents.currency,popupMinimumMinor:opportunityPopupEvents.minimumMinor,
    expectedRewardBps:opportunityPopupEvents.expectedRewardBps,balanceAvailableMinor:opportunityPopupEvents.balanceAvailableMinor,
    balanceStatus:opportunityPopupEvents.balanceStatus,eventStatus:opportunityPopupEvents.eventStatus,deliveryStatus:opportunityPopupEvents.deliveryStatus,quotaDay:opportunityPopupEvents.quotaDay,
    deliveredAt:opportunityPopupEvents.deliveredAt,venueFrom:opportunityOffers.venueFrom,venueTo:opportunityOffers.venueTo,
    offerStatus:opportunityOffers.status,offerMinimumMinor:opportunityOffers.minimumMinor,opensAt:opportunityOffers.opensAt,
    closesAt:opportunityOffers.closesAt,rewardAt:opportunityOffers.rewardAt,durationSeconds:opportunityOffers.durationSeconds,
    marketObservedAt:opportunityOffers.marketObservedAt,marketSnapshotId:opportunityOffers.marketSnapshotId,
    sector:opportunityOffers.sector,industry:opportunityOffers.industry,listingStatus:opportunityOffers.listingStatus,
  }).from(opportunityPopupEvents).leftJoin(opportunityOffers,eq(opportunityPopupEvents.offerId,opportunityOffers.id))
    .where(and(eq(opportunityPopupEvents.userId,userId),notInArray(opportunityPopupEvents.eventStatus,["TRADED","SETTLED","WITHDRAWN"])))
    .orderBy(desc(opportunityPopupEvents.deliveredAt));
  const activePopupOfferIds=new Set(activePopupRows.map(row=>Number(row.offerId)));
  const activeVisibleCount=activePopupRows.filter(row=>{
    const eventStatus=String(row.eventStatus||"").toUpperCase();
    const deliveryStatus=String(row.deliveryStatus||"pending").toLowerCase();
    return ["DELIVERED","NOTICED","OPENED"].includes(eventStatus)&&["pending","delivered","received","rendered"].includes(deliveryStatus);
  }).length;
  const schedulePolicyEnabled=configuredPolicies.some((row:any)=>Number(row.minIntervalSeconds||0)>0||Number(row.maxIntervalSeconds||0)>0||Number(row.postCompletionIntervalSeconds||0)>0);
  const lastDelivery=schedulePolicyEnabled?(await db.select({
    id:opportunityDeliveryEvents.id,deliveredAt:opportunityDeliveryEvents.deliveredAt,policyVersion:opportunityDeliveryEvents.policyVersion,
  }).from(opportunityDeliveryEvents).where(and(eq(opportunityDeliveryEvents.userId,userId),notInArray(opportunityDeliveryEvents.status,["failed"])))
    .orderBy(desc(opportunityDeliveryEvents.deliveredAt)).limit(1))[0]:undefined;
  const deliverySchedule=resolveTradingDeliverySchedule({
    lastDeliveredAt:lastDelivery?.deliveredAt??null,deliveryEventId:Number(lastDelivery?.id||0),userId,
    policyVersion:Number(lastDelivery?.policyVersion||0),
    minIntervalSeconds:Math.max(0,Number(policy?.minIntervalSeconds||0)),
    maxIntervalSeconds:Math.max(0,Number(policy?.maxIntervalSeconds||0)),
    randomizationEnabled:Boolean(policy?.randomizationEnabled),
  });
  const postCompletionIntervalSeconds=Math.max(0,Number(policy?.postCompletionIntervalSeconds||0));
  const lastCompletedTrade=postCompletionIntervalSeconds>0?(await db.select({completionAt:tradePositions.completionAt})
    .from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"settled"),isNotNull(tradePositions.completionAt)))
    .orderBy(desc(tradePositions.completionAt)).limit(1))[0]:undefined;
  const postCompletionReadyAt=lastCompletedTrade?.completionAt
    ?new Date(new Date(lastCompletedTrade.completionAt).getTime()+postCompletionIntervalSeconds*1000):null;
  const readyDeadlines=[deliverySchedule.readyAt,postCompletionReadyAt].filter((value):value is Date=>value instanceof Date);
  const formulaReadyAt=readyDeadlines.length?new Date(Math.max(...readyDeadlines.map(value=>value.getTime()))):null;
  const formulaCooling=Boolean(formulaReadyAt&&formulaReadyAt.getTime()>now.getTime());
  const dailyCap=maxPopupsPerDay;
  const deliveryCapacity=calculateTradingDeliveryCapacity({dailyCap,deliveredOfferCount,maxVisibleOffers,activeVisibleCount});
  let remainingQuota=deliveryCapacity.remainingQuota;
  const balancesSnapshot=await listBalances(userId);
  const newlyEligible:any[]=[];
  // Preserve the entitlement selected for newly created popups during this cycle,
  // so the later automatic-trade pass does not count that same quota slot twice.
  const assignedSubscriptionByOffer=new Map<number,any>();
  if(options.workerCycle===true&&!formulaCooling&&remainingQuota>0){
    for(const offer of offerRows){
      if(remainingQuota<=0) break;
      const offerId=Number(offer.id);
      if(deliveredOfferIds.has(offerId)||activePopupOfferIds.has(offerId)||tradeOfferIds.has(offerId)||missedOfferIds.has(offerId)) continue;
      const currencyRow=currencyRows.find((row:any)=>String(row.code).toUpperCase()===String(offer.currency).toUpperCase());
      if(!currencyRow) continue;
      // The administrator's rate/duration bounds filter published opportunities.
      // They never synthesize a reward rate or reroll a duration.
      const publishedRewardBps=Number(offer.expectedRewardBps);
      const publishedDurationSeconds=Number(offer.durationSeconds);
      if(!Number.isSafeInteger(publishedRewardBps)||publishedRewardBps<0||publishedRewardBps>10000||
         !Number.isSafeInteger(publishedDurationSeconds)||publishedDurationSeconds<10||publishedDurationSeconds>86400) continue;
      let selected:any=null;
      for(const candidate of eligibleSubscriptions){
        if(!subscriptionHasQuota(candidate)) continue;
        const candidatePolicy=policyByName.get(candidate.packageName);
        const configuredMinimum=candidatePolicy?packageUsdUnitsToNativeMinor(Number(candidatePolicy.minimumTradeUnits),String(offer.currency),currencyRows):Number(offer.minimumMinor);
        const configuredMaximum=candidatePolicy?Math.max(configuredMinimum,packageUsdUnitsToNativeMinor(Number(candidatePolicy.maximumTradeUnits),String(offer.currency),currencyRows)):Number.MAX_SAFE_INTEGER;
        const terms=calculateTradeTerms(userId,offer,Math.max(Number(offer.minimumMinor),configuredMinimum));
        const minimumMinor=Math.max(Number(offer.minimumMinor),Number(terms.minimumMinor||0),configuredMinimum);
        if(!Number.isSafeInteger(minimumMinor)||minimumMinor<=0||minimumMinor>configuredMaximum) continue;
        selected={subscription:candidate,configured:candidatePolicy,configuredMinimum,configuredMaximum,minimumMinor,terms};
        break;
      }
      if(!selected) continue;
      const subscription=selected.subscription;
      const configured=selected.configured;
      if(!configured||!hasConfiguredTradingOfferPolicy(configured)) continue;
      // Select one administrator-configured rate and duration exactly once. The
      // selection is persisted with the popup and reused by retries/trade allocation.
      const configuredProfitRateBps=chooseInclusiveInteger(Number(configured.minimumPayoutRateBps),Number(configured.maximumPayoutRateBps));
      const configuredDurationSeconds=chooseInclusiveInteger(Number(configured.minimumTradeDurationSeconds),Number(configured.maximumTradeDurationSeconds));
      const configuredPopupDisplaySeconds=Number(configured.popupDisplayTargetSeconds);
      if(!Number.isSafeInteger(configuredPopupDisplaySeconds)||configuredPopupDisplaySeconds<1||configuredPopupDisplaySeconds>86400) continue;
      newlyEligible.push({...offer,packageName:subscription.packageName,packageSubscriptionId:Number(subscription.subscriptionId),
        minimumMinor:selected.minimumMinor,packageMinimumTradeMinor:selected.configuredMinimum,packageMaximumTradeMinor:selected.configuredMaximum,
        currencyRateUsd:Number(currencyRow.usdRate||0),currencyRateUpdatedAt:currencyRow.updatedAt||null,
        expectedRewardBps:configuredProfitRateBps,configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds,
        durationSeconds:configuredDurationSeconds,policyVersion:Number(configured.policyVersion||1),packagePolicyVersionSnapshot:Number(configured.policyVersion||1),
        badgeLabel:configured.badgeLabel==null?null:String(configured.badgeLabel),packageBadgeLabel:configured.badgeLabel==null?null:String(configured.badgeLabel),
        badgeStyle:["neutral","blue","purple","gold","green"].includes(String(configured.badgeStyle))?String(configured.badgeStyle):"neutral",
        companyRotationEnabled:Boolean(configured.companyRotationEnabled),
        companyRotationCountryNames:String(configured.companyRotationCountryNames||""),
        companyRotationRepeatPolicy:configured.companyRotationRepeatPolicy==="allow_repeats"?"allow_repeats":"avoid_until_exhausted"});
      assignedSubscriptionByOffer.set(Number(offer.id),subscription);
      usedBySubscription.set(Number(subscription.subscriptionId),(usedBySubscription.get(Number(subscription.subscriptionId))||0)+1);
      remainingQuota--;
    }
  }
  if(newlyEligible.length){
    await db.insert(opportunityDeliveryEvents).values(newlyEligible.map(offer=>({userId,offerId:offer.id,quotaDay,policyVersion:Number(policyByName.get(offer.packageName)?.policyVersion||1)}))).onDuplicateKeyUpdate({set:{deliveredAt:new Date()}});
    const lifecycleIds=await ensurePopupDeliveries(newlyEligible.map(offer=>{
      const available=Math.max(0,Number(balancesSnapshot.find((row:any)=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase())?.availableMinor||0));
      return {userId,offerId:offer.id,quotaDay,packageName:offer.packageName,symbol:offer.symbol,currency:offer.currency,minimumMinor:Number(offer.minimumMinor),
        expectedRewardBps:Number(offer.expectedRewardBps),configuredProfitRateBps:Number(offer.configuredProfitRateBps),
        configuredDurationSeconds:Number(offer.configuredDurationSeconds),configuredPopupDisplaySeconds:Number(offer.configuredPopupDisplaySeconds),
        policyVersion:Number(offer.policyVersion||1),packagePolicyVersionSnapshot:Number(offer.packagePolicyVersionSnapshot||offer.policyVersion||1),
        durationSeconds:Number(offer.configuredDurationSeconds),badgeLabel:offer.badgeLabel??null,packageBadgeLabel:offer.packageBadgeLabel??null,badgeStyle:offer.badgeStyle||"neutral",
        companyRotationEnabled:Boolean(offer.companyRotationEnabled),companyRotationCountryNames:String(offer.companyRotationCountryNames||""),
        companyRotationRepeatPolicy:offer.companyRotationRepeatPolicy==="allow_repeats"?"allow_repeats":"avoid_until_exhausted",
        balanceAvailableMinor:available,balanceStatus:available>=Number(offer.minimumMinor)?"sufficient":"insufficient",
        marketObservedAt:offer.marketObservedAt,marketSnapshotJson:JSON.stringify({symbol:offer.symbol,venueFrom:offer.venueFrom,venueTo:offer.venueTo,marketValueUsd:offer.marketValueUsd,sector:offer.sector,industry:offer.industry,listingStatus:offer.listingStatus,observedAt:offer.marketObservedAt,publishedExpectedRewardBps:Number(offer.expectedRewardBps),publishedDurationSeconds:Number(offer.durationSeconds),configuredProfitRateBps:Number(offer.configuredProfitRateBps),configuredDurationSeconds:Number(offer.configuredDurationSeconds)})};
    }));
    for(const offer of newlyEligible){offer.deliveryEventId=lifecycleIds.get(userId+":"+offer.id+":"+quotaDay)||null; deliveredOfferIds.add(Number(offer.id));}
  }
  const popupRows=await db.select({
    eventId:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,packageName:opportunityPopupEvents.packageName,
    executionStatus:opportunityPopupEvents.executionStatus,executionAttemptCount:opportunityPopupEvents.executionAttemptCount,executionRetryAfter:opportunityPopupEvents.executionRetryAfter,executionRetryDay:opportunityPopupEvents.executionRetryDay,executionLastErrorCode:opportunityPopupEvents.executionLastErrorCode,
    symbol:opportunityPopupEvents.symbol,currency:opportunityPopupEvents.currency,popupMinimumMinor:opportunityPopupEvents.minimumMinor,
    expectedRewardBps:opportunityPopupEvents.expectedRewardBps,policyVersion:opportunityPopupEvents.policyVersion,
    configuredProfitRateBps:opportunityPopupEvents.configuredProfitRateBps,configuredDurationSeconds:opportunityPopupEvents.configuredDurationSeconds,
    configuredPopupDisplaySeconds:opportunityPopupEvents.configuredPopupDisplaySeconds,packagePolicyVersionSnapshot:opportunityPopupEvents.packagePolicyVersionSnapshot,
    packageBadgeLabel:opportunityPopupEvents.packageBadgeLabel,companyReferenceId:opportunityPopupEvents.companyReferenceId,
    companyDisplayName:opportunityPopupEvents.companyDisplayName,companyLogoUrl:opportunityPopupEvents.companyLogoUrl,
    companyReferenceMetadataJson:opportunityPopupEvents.companyReferenceMetadataJson,companyReferenceOnly:opportunityPopupEvents.companyReferenceOnly,
    popupDurationSeconds:opportunityPopupEvents.durationSeconds,badgeLabel:opportunityPopupEvents.badgeLabel,badgeStyle:opportunityPopupEvents.badgeStyle,
    balanceAvailableMinor:opportunityPopupEvents.balanceAvailableMinor,
    balanceStatus:opportunityPopupEvents.balanceStatus,eventStatus:opportunityPopupEvents.eventStatus,deliveryStatus:opportunityPopupEvents.deliveryStatus,quotaDay:opportunityPopupEvents.quotaDay,
    deliveredAt:opportunityPopupEvents.deliveredAt,venueFrom:opportunityOffers.venueFrom,venueTo:opportunityOffers.venueTo,
    offerStatus:opportunityOffers.status,offerMinimumMinor:opportunityOffers.minimumMinor,opensAt:opportunityOffers.opensAt,
    closesAt:opportunityOffers.closesAt,rewardAt:opportunityOffers.rewardAt,durationSeconds:opportunityOffers.durationSeconds,
    marketObservedAt:opportunityOffers.marketObservedAt,marketSnapshotId:opportunityOffers.marketSnapshotId,
    sector:opportunityOffers.sector,industry:opportunityOffers.industry,listingStatus:opportunityOffers.listingStatus,
  }).from(opportunityPopupEvents).leftJoin(opportunityOffers,eq(opportunityPopupEvents.offerId,opportunityOffers.id))
    .where(and(eq(opportunityPopupEvents.userId,userId),notInArray(opportunityPopupEvents.eventStatus,["TRADED","SETTLED","WITHDRAWN"])))
    .orderBy(desc(opportunityPopupEvents.deliveredAt));
  // Enforce current admin status at read time too: previously-created active popups
  // lose their company identity immediately when that company is unverified/archived.
  const catalogueAdminRow=(await db.select({settingValue:appSettings.settingValue})
    .from(appSettings).where(eq(appSettings.settingKey,"trade.companyCatalogue.adminState")).limit(1))[0];
  const catalogueAdminState=parseCompanyCatalogueAdminState(catalogueAdminRow?.settingValue??"{}");
  const currentlyVerifiedCompanyIds=new Set(catalogueAdminState.verifiedIds);
  const archivedCompanyIds=new Set(catalogueAdminState.archivedIds);
  const companyDisplayAllowed=(id:unknown)=>typeof id==="string"&&currentlyVerifiedCompanyIds.has(id)&&!archivedCompanyIds.has(id);
  const tradeCandidates=popupRows.filter(row=>row.offerStatus==="open"&&row.closesAt&&new Date(row.closesAt).getTime()>now.getTime()).map(row=>{
    // Never reassign an existing popup to another package when its original
    // package is renamed, disabled, expired, or otherwise no longer eligible.
    // Existing popups keep their package identity, while the actual entitlement
    // is selected from same-package copies that still have their own daily quota.
    const assignedSubscription=assignedSubscriptionByOffer.get(Number(row.offerId));
    const subscription=assignedSubscription&&assignedSubscription.packageName===row.packageName
      ?assignedSubscription
      :eligibleSubscriptions.find(item=>item.packageName===row.packageName&&subscriptionHasQuota(item));
    if(!subscription) return null;
    if(!assignedSubscriptionByOffer.has(Number(row.offerId))) {
      usedBySubscription.set(Number(subscription.subscriptionId),(usedBySubscription.get(Number(subscription.subscriptionId))||0)+1);
    }
    const configured=policyByName.get(subscription.packageName);
    const currencyRow=currencyRows.find((item:any)=>String(item.code).toUpperCase()===String(row.currency).toUpperCase());
    const offerMinimum=Number(row.offerMinimumMinor??row.popupMinimumMinor);
    const configuredMinimum=configured&&currencyRow?packageUsdUnitsToNativeMinor(Number(configured.minimumTradeUnits),String(row.currency),currencyRows):offerMinimum;
    const configuredMaximum=configured&&currencyRow?Math.max(configuredMinimum,packageUsdUnitsToNativeMinor(Number(configured.maximumTradeUnits),String(row.currency),currencyRows)):Number.MAX_SAFE_INTEGER;
    return {id:Number(row.offerId),offerId:Number(row.offerId),deliveryEventId:Number(row.eventId),packageId:Number(subscription.packageId),packageName:subscription.packageName,packageSubscriptionId:Number(subscription.subscriptionId),
      symbol:row.symbol,venueFrom:row.venueFrom||"",venueTo:row.venueTo||"",currency:row.currency,minimumMinor:Math.max(offerMinimum,Number(row.popupMinimumMinor||0),configuredMinimum),
      packageMinimumTradeMinor:configuredMinimum,packageMaximumTradeMinor:configuredMaximum,expectedRewardBps:Number(row.expectedRewardBps||0),
      durationSeconds:Number(row.popupDurationSeconds??row.durationSeconds??0),configuredProfitRateBps:Number(row.configuredProfitRateBps||row.expectedRewardBps||0),configuredDurationSeconds:Number(row.configuredDurationSeconds||row.popupDurationSeconds||row.durationSeconds||0),configuredPopupDisplaySeconds:Number(row.configuredPopupDisplaySeconds||0),packagePolicyVersionSnapshot:Number(row.packagePolicyVersionSnapshot||row.policyVersion||1),packageBadgeLabel:row.packageBadgeLabel??row.badgeLabel??null,companyReferenceId:companyDisplayAllowed(row.companyReferenceId)?row.companyReferenceId:null,companyDisplayName:companyDisplayAllowed(row.companyReferenceId)?row.companyDisplayName:null,companyLogoUrl:companyDisplayAllowed(row.companyReferenceId)?row.companyLogoUrl:null,companyReferenceMetadataJson:companyDisplayAllowed(row.companyReferenceId)?row.companyReferenceMetadataJson:null,companyReferenceOnly:companyDisplayAllowed(row.companyReferenceId)&&Boolean(row.companyReferenceOnly),badgeLabel:row.badgeLabel??null,badgeStyle:["neutral","blue","purple","gold","green"].includes(String(row.badgeStyle))?String(row.badgeStyle):"neutral",policyVersion:Number(row.policyVersion||1),
      opensAt:row.opensAt,closesAt:row.closesAt,rewardAt:row.rewardAt,marketObservedAt:row.marketObservedAt,
      marketSnapshotId:row.marketSnapshotId,sector:row.sector,industry:row.industry,listingStatus:row.listingStatus,
      executionStatus:row.executionStatus,executionAttemptCount:Number(row.executionAttemptCount||0),executionRetryAfter:row.executionRetryAfter,executionRetryDay:row.executionRetryDay,executionLastErrorCode:row.executionLastErrorCode,
      maxTradeAttemptsPerDay:Number(policyByName.get(String(row.packageName))?.maxTradeAttemptsPerDay??5),
      tradeRetryDelaySeconds:Number(policyByName.get(String(row.packageName))?.tradeRetryDelaySeconds??30),
      popupEligible:["DELIVERED","NOTICED"].includes(row.eventStatus)&&["delivered","received","rendered"].includes(String(row.deliveryStatus)),
      executionEligible:isPopupExecutionEligible({eventStatus:row.eventStatus,deliveryStatus:row.deliveryStatus,executionStatus:row.executionStatus}),
      eventStatus:row.eventStatus,deliveryStatus:row.deliveryStatus};
  }).filter((offer) => offer !== null);
  const allocationControls=await getTradeAllocationControls();
  const autoTradeCandidates=tradeCandidates.filter((offer:any)=>{
    // Dismissing/minimizing a customer card is presentation-only and must not
    // suppress an otherwise eligible server-owned automatic execution.
    if(offer.executionEligible!==true || allocationControls.allocationsPaused) return false;
    const packagePolicy=policyByName.get(String(offer.packageName));
    // Disabled package policies or automatic execution must stop new allocations
    // without turning a merely visible/pending popup into a trade request.
    return Boolean(packagePolicy && packagePolicy.enabled && packagePolicy.automaticDelivery && packagePolicy.automaticTradingEnabled && hasConfiguredTradingOfferPolicy(packagePolicy));
  });
  const effectiveControls=controls;
  const auto=options.workerCycle===true ? await autoTradeOpenOpportunities(userId,autoTradeCandidates,effectiveControls) : {executed:[],missed:await listMissedOpportunities(userId)};
  const executedByOffer=new Map(auto.executed.map((trade:any)=>[Number(trade.offerId),trade]));
  const enrichedOffers=popupRows.map(row=>{
    const base:any=tradeCandidates.find(offer=>Number(offer.offerId)===Number(row.offerId))||{};
    const executed=executedByOffer.get(Number(row.offerId))||null;
    return {...base,id:Number(row.offerId),offerId:Number(row.offerId),deliveryEventId:Number(row.eventId),packageName:row.packageName,
      symbol:row.symbol,currency:row.currency,minimumMinor:Number(row.popupMinimumMinor),balanceAvailableMinor:Number(row.balanceAvailableMinor),
      balanceStatus:row.balanceStatus,expectedRewardBps:Number(row.expectedRewardBps),eventStatus:row.eventStatus,deliveredAt:row.deliveredAt,
      venueFrom:row.venueFrom||base.venueFrom||"",venueTo:row.venueTo||base.venueTo||"",opensAt:row.opensAt,closesAt:row.closesAt,rewardAt:row.rewardAt,
      durationSeconds:Number(row.popupDurationSeconds??row.durationSeconds??base.durationSeconds??0),
      configuredProfitRateBps:Number(row.configuredProfitRateBps||row.expectedRewardBps||0),configuredDurationSeconds:Number(row.configuredDurationSeconds||row.popupDurationSeconds||row.durationSeconds||base.durationSeconds||0),
      configuredPopupDisplaySeconds:Number(row.configuredPopupDisplaySeconds||0),packagePolicyVersionSnapshot:Number(row.packagePolicyVersionSnapshot||row.policyVersion||1),
      packageBadgeLabel:row.packageBadgeLabel??row.badgeLabel??null,companyReferenceId:companyDisplayAllowed(row.companyReferenceId)?row.companyReferenceId:null,companyDisplayName:companyDisplayAllowed(row.companyReferenceId)?row.companyDisplayName:null,
      companyLogoUrl:companyDisplayAllowed(row.companyReferenceId)?row.companyLogoUrl:null,companyReferenceMetadataJson:companyDisplayAllowed(row.companyReferenceId)?row.companyReferenceMetadataJson:null,companyReferenceOnly:companyDisplayAllowed(row.companyReferenceId)&&Boolean(row.companyReferenceOnly),
      badgeLabel:row.badgeLabel??null,badgeStyle:["neutral","blue","purple","gold","green"].includes(String(row.badgeStyle))?String(row.badgeStyle):"neutral",
      policyVersion:Number(row.policyVersion||base.policyVersion||1),marketObservedAt:row.marketObservedAt,sector:row.sector,industry:row.industry,
      listingStatus:row.listingStatus,popupEligible:["DELIVERED","NOTICED"].includes(row.eventStatus),automaticTrade:executed};
  });
  return {offers:enrichedOffers,missed:auto.missed,autoTrades:auto.executed,settled,delivery:{packageName,maxPopupsPerDay:dailyCap,maxVisibleOffers:maxVisibleOffers,
    remainingDailyQuota:Math.max(0,deliveryCapacity.dailyRemaining-newlyEligible.length),
    remainingVisibleSlots:Math.max(0,deliveryCapacity.visibleRemaining-newlyEligible.length),
    remainingQuota,activeVisibleCount:activeVisibleCount+newlyEligible.length,schedulingPeriod:effectiveSchedulingPeriod,
    formulaCooling,formulaReadyAt,nextPopupFormulaDelaySeconds:Number(policy?.postCompletionIntervalSeconds||0),rateProfile:{minHourlyTarget:Number(policy?.minHourlyTarget||0),normalHourlyTarget:Number(policy?.normalHourlyTarget||0),marketInfluenceBps:Number(policy?.marketInfluenceBps||0),burstEnabled:Boolean(policy?.burstEnabled),maxBurstSize:Number(policy?.maxBurstSize||0)},popupPolicy}};
}
export async function claimAutoTradeCycleCustomers(input:{batchSize?:number}={}){
  const db=await getDb();
  if(!db) throw new Error("Database is not available");
  const requestedBatchSize=input.batchSize??100;
  const batchSize=Number.isSafeInteger(requestedBatchSize)?Math.max(1,Math.min(250,requestedBatchSize)):100;
  const now=new Date();
  const cursorKey="trade.autoTradeCycle.lastUserId";

  // Select only customers with a currently active, server-assigned tier. A locked
  // durable cursor makes work bounded and round-robin across server instances;
  // the worker never scans the full users table on every timer tick.
  const customers=await db.transaction(async tx=>{
    await tx.insert(appSettings).values({settingKey:cursorKey,settingValue:"0"})
      .onDuplicateKeyUpdate({set:{settingKey:cursorKey}});
    const cursorRow=(await tx.select({settingValue:appSettings.settingValue}).from(appSettings)
      .where(eq(appSettings.settingKey,cursorKey)).limit(1).for("update"))[0];
    const rawCursor=Number(cursorRow?.settingValue??0);
    const cursor=Number.isSafeInteger(rawCursor)&&rawCursor>=0?rawCursor:0;
    const activeTierFilter=and(
      eq(customerPackageSubscriptions.status,"active"),
      sql`${customerPackageSubscriptions.activationKey} LIKE 'auto-tier:%'`,
      lte(customerPackageSubscriptions.startsAt,now),
      or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),
      or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
    );
    const selectAfter=(afterUserId:number)=>tx.selectDistinct({id:customerPackageSubscriptions.userId})
      .from(customerPackageSubscriptions)
      .innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
      .where(and(activeTierFilter,gt(customerPackageSubscriptions.userId,afterUserId)))
      .orderBy(customerPackageSubscriptions.userId)
      .limit(batchSize);
    const batch=await selectAfter(cursor);
    // Do not wrap and re-claim the first page in the same tick: another server
    // instance may already be processing that page. Reset the cursor and let the
    // next scheduled tick start a fresh pass.
    if(!batch.length&&cursor>0){
      await tx.update(appSettings).set({settingValue:"0"}).where(eq(appSettings.settingKey,cursorKey));
      return [];
    }
    const nextCursor=batch.length?Number(batch[batch.length-1].id):0;
    await tx.update(appSettings).set({settingValue:String(nextCursor)}).where(eq(appSettings.settingKey,cursorKey));
    return batch;
  });
  return {customers,batchSize};
}

export async function runAutoTradeCycle(input:{batchSize?:number}={}){
  const {customers,batchSize}=await claimAutoTradeCycleCustomers(input);
  let allocations=0;
  for(const customer of customers){
    try{
      const result=await listCustomerOpportunities(customer.id,{workerCycle:true,consumeDelivery:false});
      allocations+=result.autoTrades.length;
      for(const trade of result.autoTrades){
        const notices=[
          {title:"Automatic trading allocation confirmed",body:trade.symbol+" was allocated from your available "+trade.currency+" balance.",eventKey:"auto-trade-allocation:"+trade.tradeId,category:"trading",priority:"normal"},
          {title:"Balance reserved for trade",body:trade.amountMinor+" minor units of "+trade.currency+" were reserved for the automatic allocation.",eventKey:"auto-trade-debit:"+trade.tradeId,category:"ledger_debit",priority:"normal"},
        ] as const;
        const outcomes=await Promise.allSettled(notices.map(notice=>createNotification(customer.id,notice.title,notice.body,{eventKey:notice.eventKey,category:notice.category,priority:notice.priority})));
        if(outcomes.some(outcome=>outcome.status==="rejected")) console.error("[Notifications] Automatic allocation notice failed after ledger commit.");
      }
    }catch(error){
      console.error("[AutoTrade] Customer cycle failed:",error instanceof Error?error.name:"UnknownError");
    }
  }
  return {customers:customers.length,allocations,batchSize};
}
export async function createTrade(userId:number,input:{offerId:number;amountMinor:number;deliveryEventId?:number;packageSubscriptionId?:number;packageId?:number;executionLeaseToken?:string}){
 const db=await getDb();if(!db)throw new Error("Database is not available");
 // Fetch FX quotes before opening the financial transaction. The transaction below
 // locks every affected wallet in stable order and rechecks all spendable balances.
 const preflightWallets=await db.select({currency:customerBalances.currency,availableMinor:customerBalances.availableMinor}).from(customerBalances).where(eq(customerBalances.userId,userId));
 const targetCurrency=String((await db.select({currency:opportunityOffers.currency}).from(opportunityOffers).where(eq(opportunityOffers.id,input.offerId)).limit(1))[0]?.currency||"").toUpperCase();
 if(!targetCurrency) throw new Error("Trading opportunity currency is unavailable");
 const targetPreflightBalance=Number(preflightWallets.find(row=>String(row.currency).toUpperCase()===targetCurrency)?.availableMinor||0);
 const replayEvent=input.deliveryEventId===undefined?null:(await db.select({eventStatus:opportunityPopupEvents.eventStatus,tradeId:opportunityPopupEvents.tradeId})
   .from(opportunityPopupEvents).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId))).limit(1))[0]||null;
 const tradeFxRates=new Map<string,FxRateSnapshot>();
 const tradeFxConfigs=new Map<string,TradingFxConfig>();
 if(targetPreflightBalance<input.amountMinor && !(replayEvent?.eventStatus==="TRADED"&&Number(replayEvent.tradeId)>0)){
   const registryRows=await db.select({code:currencyRegistry.code,scale:currencyRegistry.scale,assetType:currencyRegistry.assetType,externalCode:currencyRegistry.externalCode})
     .from(currencyRegistry).where(eq(currencyRegistry.enabled,true));
   for(const row of registryRows) tradeFxConfigs.set(String(row.code).toUpperCase(),{
     code:String(row.code).toUpperCase(),scale:Number(row.scale),assetType:row.assetType,
     externalCode:row.externalCode?String(row.externalCode):null,
   });
   const codes=new Set<string>([targetCurrency,...preflightWallets.filter(row=>Number(row.availableMinor)>0).map(row=>String(row.currency).toUpperCase())]);
   const fetched=await Promise.all([...codes].map(async code=>{
     const config=tradeFxConfigs.get(code);
     if(!config) return [code,null] as const;
     try { return [code,await getFreshTradingFxRate(config)] as const; }
     catch { return [code,null] as const; }
   }));
   for(const [code,rate] of fetched) if(rate) tradeFxRates.set(code,rate);
   if(!tradeFxRates.has(targetCurrency)) throw new Error("A current exchange rate for " + targetCurrency + " is unavailable; no wallet funds were moved");
 }
 return db.transaction(async tx=>{
  // Serialize allocations for one customer. This makes daily caps and active-trade
  // checks safe when multiple workers attempt automatic trades concurrently.
  const userLock=await tx.execute(sql`SELECT id,loginMethod FROM users WHERE id=${userId} FOR UPDATE`) as any;
  const lockedUser=userLock?.[0]?.[0];
  if(!lockedUser||lockedUser.loginMethod==="closed") throw new Error("Customer account is missing or closed");
  // Lock and validate the popup event as an idempotency token before any wallet work.
  // If the original transaction committed but its response was lost, return that trade.
  let popupSnapshot:any=null;
  if(input.deliveryEventId!==undefined){
   await tx.execute(sql`SELECT id FROM opportunity_popup_events WHERE id=${input.deliveryEventId} AND userId=${userId} FOR UPDATE`);
   const event=(await tx.select({
     id:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,eventStatus:opportunityPopupEvents.eventStatus,tradeId:opportunityPopupEvents.tradeId,
     expectedRewardBps:opportunityPopupEvents.expectedRewardBps,configuredProfitRateBps:opportunityPopupEvents.configuredProfitRateBps,
     configuredDurationSeconds:opportunityPopupEvents.configuredDurationSeconds,configuredPopupDisplaySeconds:opportunityPopupEvents.configuredPopupDisplaySeconds,
     packagePolicyVersionSnapshot:opportunityPopupEvents.packagePolicyVersionSnapshot,packageBadgeLabel:opportunityPopupEvents.packageBadgeLabel,
     companyReferenceId:opportunityPopupEvents.companyReferenceId,companyDisplayName:opportunityPopupEvents.companyDisplayName,
     companyLogoUrl:opportunityPopupEvents.companyLogoUrl,companyReferenceMetadataJson:opportunityPopupEvents.companyReferenceMetadataJson,
     companyReferenceOnly:opportunityPopupEvents.companyReferenceOnly,executionLeaseToken:opportunityPopupEvents.executionLeaseToken,
   }).from(opportunityPopupEvents).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId))).limit(1))[0];
   if(!event) throw new Error("Opportunity delivery event not found for this customer");
   if(Number(event.offerId)!==input.offerId) throw new Error("Opportunity delivery event does not match this offer");
   if(input.executionLeaseToken && String(event.executionLeaseToken||"")!==input.executionLeaseToken) throw new Error("Opportunity execution lease was lost; stale worker fenced");
   popupSnapshot=event;
   if(event.eventStatus==="TRADED" && Number(event.tradeId)>0){
    const existing=(await tx.select().from(tradePositions).where(and(eq(tradePositions.id,Number(event.tradeId)),eq(tradePositions.userId,userId))).limit(1))[0];
    if(!existing) throw new Error("Previously allocated trade is missing; manual recovery review is required");
    // An idempotency token may replay the same request, but must not silently
    // accept a changed amount or package subscription as though it were applied.
    if(Number(existing.principalMinor)!==input.amountMinor) {
      throw new Error("Opportunity delivery event was already allocated with a different trade amount");
    }
    if(input.packageSubscriptionId!==undefined&&Number(existing.packageSubscriptionId)!==input.packageSubscriptionId) {
      throw new Error("Opportunity delivery event was already allocated under a different package subscription");
    }
    if(input.packageId!==undefined) {
      const subscription=(await tx.select({packageId:customerPackageSubscriptions.packageId})
        .from(customerPackageSubscriptions)
        .where(and(eq(customerPackageSubscriptions.id,Number(existing.packageSubscriptionId)),eq(customerPackageSubscriptions.userId,userId)))
        .limit(1))[0];
      if(!subscription||Number(subscription.packageId)!==input.packageId) {
        throw new Error("Opportunity delivery event was already allocated under a different package");
      }
    }
    const rate=(await tx.select({scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,updatedAt:currencyRegistry.updatedAt}).from(currencyRegistry).where(eq(currencyRegistry.code,existing.currency)).limit(1))[0];
    if(!rate || !Number.isFinite(Number(rate.usdRate)) || Number(rate.usdRate)<=0) throw new Error("Existing trade was found but its currency rate is unavailable for a safe retry response");
    const amountMinor=Number(existing.principalMinor);
    return {tradeId:Number(existing.id),rewardMinor:Number(existing.expectedRewardMinor),rewardBps:amountMinor>0?Math.floor(Number(existing.expectedRewardMinor)*10000/amountMinor):0,minimumMinor:0,calculationMethod:"idempotent-replay",settlesAt:existing.settlesAt,creditAt:existing.creditAt,currency:existing.currency,amountMinor,rateUsd:Number(rate.usdRate),rateUpdatedAt:rate.updatedAt,amountUsd:nativeMinorToUsd(amountMinor,Number(rate.scale),Number(rate.usdRate)),idempotentReplay:true};
   }
  }
  // Serialize every new allocation against the administrator's global pause.
  // Existing idempotent replays above remain readable while paused.
  const allocationSetting=(await tx.select({settingValue:appSettings.settingValue}).from(appSettings)
    .where(eq(appSettings.settingKey,"trading.allocations.paused")).limit(1).for("update"))[0];
  const allocationControls=parseTradeAllocationControls(allocationSetting?.settingValue);
  if(allocationControls.allocationsPaused) {
    throw new Error("New trading allocations are paused by an administrator: " + (allocationControls.reason || "system safety pause"));
  }

  const settlementPolicy=await getTradeSettlementPolicy();

  const totalWalletFunds=(await tx.select({availableMinor:sql`COALESCE(SUM(${customerBalances.availableMinor}),0)`}).from(customerBalances).where(eq(customerBalances.userId,userId)))[0]; if(Number(totalWalletFunds?.availableMinor||0)<=0) throw new Error("Trading is unavailable until at least one wallet has available funds");
  const offer=(await tx.select().from(opportunityOffers).where(and(eq(opportunityOffers.id,input.offerId),eq(opportunityOffers.status,"open"))).limit(1))[0];
  if(!offer || new Date(offer.closesAt).getTime()<=Date.now()) throw new Error("This opportunity is no longer open");
  const now=new Date();
  const today=new Date().toISOString().slice(0,10);
  const todayStartUtc=new Date(`${today}T00:00:00.000Z`);
  const tomorrowStartUtc=new Date(todayStartUtc.getTime()+24*60*60*1000);
  const activePackageSubscriptions=(await tx.select({
    subscriptionId:customerPackageSubscriptions.id,
    packageId:packages.id,
    packageName:packages.name,
    activationKey:customerPackageSubscriptions.activationKey,
    packageQuota:packages.opportunitiesPerDay,
    maxActiveInvestments:packages.maxActiveInvestments,
    termsVersion:packages.termsVersion,
    termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson,
  }).from(customerPackageSubscriptions)
    .innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(and(
      eq(customerPackageSubscriptions.userId,userId),
      eq(customerPackageSubscriptions.status,"active"),
      lte(customerPackageSubscriptions.startsAt,now),
      or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),
      or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
    )).orderBy(customerPackageSubscriptions.expiresAt).for("update"))
    .filter(subscription=>String(subscription.activationKey||"").startsWith("auto-tier:"));
  if(!activePackageSubscriptions.length) throw new Error("An automatically assigned eligible Trading tier is required");

  const packagePolicies=await tx.select().from(opportunityPackagePolicies)
    .where(inArray(opportunityPackagePolicies.packageName,activePackageSubscriptions.map(row=>row.packageName))).for("update");
  const policyByName=new Map<string,typeof packagePolicies[number]>();
  for(const row of packagePolicies) policyByName.set(row.packageName,row);
  const eligibleSubscriptions=activePackageSubscriptions.filter(subscription=>{
    const configured=policyByName.get(subscription.packageName);
    return Boolean(configured && configured.enabled && configured.automaticDelivery && configured.automaticTradingEnabled && hasConfiguredTradingOfferPolicy(configured));
  });
  if(!eligibleSubscriptions.length) throw new Error("New allocations are paused for all eligible Trading tier policies");
  const quotaRows=await tx.execute(sql`SELECT packageSubscriptionId,COUNT(*) AS used FROM trade_positions WHERE userId=${userId} AND packageSubscriptionId IS NOT NULL AND confirmedAt>=${todayStartUtc} AND confirmedAt<${tomorrowStartUtc} AND status<>'cancelled' GROUP BY packageSubscriptionId`) as any;
  const usedBySubscription=new Map<number,number>();
  for(const row of (quotaRows?.[0]||[])) usedBySubscription.set(Number(row.packageSubscriptionId),Number(row.used||0));
  const subscriptionsWithQuota=eligibleSubscriptions.filter(subscription=>{
    let snapshot:any={};
    try { snapshot=JSON.parse(String(subscription.termsSnapshotJson||"{}")); } catch { snapshot={}; }
    const dailyQuota=Number(snapshot.opportunitiesPerDay??subscription.packageQuota);
    const used=usedBySubscription.get(Number(subscription.subscriptionId))||0;
    return Number.isSafeInteger(dailyQuota)&&dailyQuota>0&&used<dailyQuota;
  });
  if(!subscriptionsWithQuota.length) throw new Error("All eligible Trading tier opportunity quotas have been used for today");
  const requestedSubscription=input.packageSubscriptionId
    ? subscriptionsWithQuota.find(subscription=>Number(subscription.subscriptionId)===input.packageSubscriptionId&&(!input.packageId||Number(subscription.packageId)===input.packageId))
    : undefined;
  const samePackageSubscription=input.packageId
    ? subscriptionsWithQuota.find(subscription=>Number(subscription.packageId)===input.packageId)
    : undefined;
  if((input.packageSubscriptionId||input.packageId)&&!requestedSubscription&&!samePackageSubscription) {
    throw new Error("The selected Trading tier has no remaining quota or is no longer eligible");
  }
  const activePackageSubscription=requestedSubscription||samePackageSubscription||(!input.packageSubscriptionId&&!input.packageId?subscriptionsWithQuota[0]:undefined);
  if(!activePackageSubscription) throw new Error("No eligible package subscription remains for this allocation");
  const selectedSubscriptionId=Number(activePackageSubscription.subscriptionId);
  const packagePolicy=policyByName.get(activePackageSubscription.packageName);
  let activeTermsSnapshot:any={};try{activeTermsSnapshot=JSON.parse(String(activePackageSubscription.termsSnapshotJson||"{}"))}catch{activeTermsSnapshot={}}
  const tierActiveLimit=Number(activeTermsSnapshot.maxActiveInvestments??activePackageSubscription.maxActiveInvestments??0);
  if(tierActiveLimit>0){
    const activePositions=await tx.select({id:tradePositions.id}).from(tradePositions)
      .where(and(eq(tradePositions.userId,userId),eq(tradePositions.packageSubscriptionId,selectedSubscriptionId),eq(tradePositions.status,"confirmed")))
      .limit(tierActiveLimit+1);
    if(activePositions.length>=tierActiveLimit) throw new Error("Package maximum active investments reached");
  }
  if(packagePolicy){
    const activeRows=await tx.select({id:tradePositions.id}).from(tradePositions)
      .where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed")))
      .limit(Math.max(1,Number(packagePolicy.maxConcurrentActiveTrades||1)+1));
    if(Number(packagePolicy.maxConcurrentActiveTrades||0)>0&&activeRows.length>=Number(packagePolicy.maxConcurrentActiveTrades)) throw new Error("Package maximum concurrent active trades reached");
    const attemptRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND confirmedAt>=${todayStartUtc} AND confirmedAt<${tomorrowStartUtc}`) as any;
    if(Number(packagePolicy.maxTradeAttemptsPerDay||0)>0&&Number(attemptRows?.[0]?.[0]?.count||0)>=Number(packagePolicy.maxTradeAttemptsPerDay)) throw new Error("Package daily trade-attempt limit reached");
    const successfulRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND status='settled' AND confirmedAt>=${todayStartUtc} AND confirmedAt<${tomorrowStartUtc}`) as any;
    if(Number(packagePolicy.maxSuccessfulTradesPerDay||0)>0&&Number(successfulRows?.[0]?.[0]?.count||0)>=Number(packagePolicy.maxSuccessfulTradesPerDay)) throw new Error("Package daily successful-trade limit reached");
  }
  const currencyRow=(await tx.select({scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,updatedAt:currencyRegistry.updatedAt}).from(currencyRegistry).where(eq(currencyRegistry.code,offer.currency)).limit(1))[0]; if(!currencyRow) throw new Error(`Currency ${offer.currency} is not configured`); const nativeFactor=Math.pow(10,Number(currencyRow.scale)); const nativeRate=Number(currencyRow.usdRate); if(!Number.isFinite(nativeRate)||nativeRate<=0) throw new Error(`Currency ${offer.currency} has no valid conversion rate`); const terms=calculateTradeTerms(userId,offer,input.amountMinor); const packageMinimumNative=packagePolicy?usdUnitsToNativeMinor(Number(packagePolicy.minimumTradeUnits),Number(currencyRow.scale),nativeRate):Number(offer.minimumMinor); const packageMaximumNative=packagePolicy?Math.max(packageMinimumNative,usdUnitsToNativeMinor(Number(packagePolicy.maximumTradeUnits),Number(currencyRow.scale),nativeRate)):Number.MAX_SAFE_INTEGER; assertTradeAmountWithinBounds(input.amountMinor,{minimumTradeMinor:Math.max(Number(offer.minimumMinor),Number(terms.minimumMinor),packageMinimumNative),maximumTradeMinor:packageMaximumNative},Number(offer.minimumMinor));
  const already=await tx.select({id:tradePositions.id}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.offerId,input.offerId))).limit(1);
  if(already[0]) throw new Error("This opportunity has already been allocated");
  // Lock all customer wallets in stable currency order. Conversion and reservation
  // are performed under the same transaction so partial funding cannot commit.
  await tx.execute(sql`SELECT id FROM customer_balances WHERE userId=${userId} ORDER BY currency FOR UPDATE`);
  let walletRows=await tx.select().from(customerBalances).where(eq(customerBalances.userId,userId)).orderBy(customerBalances.currency).for("update");
  let bal=walletRows.find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase());
  if(!bal){
    await tx.insert(customerBalances).values({userId,currency:offer.currency,availableMinor:0,lockedMinor:0,promotionalMinor:0,earnedMinor:0});
    walletRows=await tx.select().from(customerBalances).where(eq(customerBalances.userId,userId)).orderBy(customerBalances.currency).for("update");
    bal=walletRows.find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase());
  }
  if(!bal) throw new Error("Target currency wallet could not be initialized");
  const ref="trade-"+offer.id+"-"+userId+"-"+Date.now();
  let fundingPlan:ReturnType<typeof planCrossWalletFunding>|null=null;
  let convertedTargetMinor=0;
  if(Number(bal.availableMinor)<input.amountMinor){
    const targetRate=tradeFxRates.get(String(offer.currency).toUpperCase());
    if(!targetRate) throw new Error("Insufficient target-wallet balance and no fresh FX snapshot is available for cross-wallet funding");
    if(Number(targetRate.scale)!==Number(currencyRow.scale)) throw new Error("Target currency scale changed while the trade was being prepared; retry the opportunity");
    const sourceWallets=walletRows
      .filter(row=>String(row.currency).toUpperCase()!==String(offer.currency).toUpperCase())
      .map(row=>{
        const code=String(row.currency).toUpperCase();
        const rate=tradeFxRates.get(code)||null;
        const config=tradeFxConfigs.get(code);
        return {currency:code,scale:Number(rate?.scale??config?.scale??2),availableMinor:Number(row.availableMinor||0),rate};
      });
    fundingPlan=planCrossWalletFunding({
      requiredTargetMinor:input.amountMinor,
      targetAvailableMinor:Number(bal.availableMinor||0),
      targetRate,
      sourceWallets,
    });
    convertedTargetMinor=fundingPlan.targetCreditMinor;
  }
  const walletFundingPlanJson=JSON.stringify({
    targetCurrency:String(offer.currency).toUpperCase(),
    requiredTargetMinor:input.amountMinor,
    targetAvailableMinorBeforeConversion:Number(bal.availableMinor||0),
    convertedTargetMinor,
    sourceDebits:fundingPlan?.sourceDebits||[],
    targetRate:convertedTargetMinor>0?tradeFxRates.get(String(offer.currency).toUpperCase())||null:null,
    recordedAt:new Date().toISOString(),
  });
  // A delivered popup is the immutable source of its configured rate/duration.
  // A legacy event without these snapshots is not silently re-rated at allocation.
  const configuredRateBps=Number(popupSnapshot?.configuredProfitRateBps||0);
  const configuredDurationSeconds=Number(popupSnapshot?.configuredDurationSeconds||0);
  if(input.deliveryEventId!==undefined&&(
    !Number.isSafeInteger(configuredRateBps)||configuredRateBps<1||configuredRateBps>5000||
    !Number.isSafeInteger(configuredDurationSeconds)||configuredDurationSeconds<10||configuredDurationSeconds>86400
  )) throw new Error("This pop-up has no valid saved rate and duration snapshot. Refresh opportunities after the administrator saves its tier policy.");
  const effectiveRateBps=input.deliveryEventId!==undefined?configuredRateBps:Number(offer.expectedRewardBps||terms.rewardBps);
  const effectiveDurationSeconds=input.deliveryEventId!==undefined?configuredDurationSeconds:Number(offer.durationSeconds);
  if(!Number.isSafeInteger(effectiveRateBps)||effectiveRateBps<1||effectiveRateBps>5000) throw new Error("Selected Trading return rate is outside the supported policy bounds");
  if(!Number.isSafeInteger(effectiveDurationSeconds)||effectiveDurationSeconds<10||effectiveDurationSeconds>86400) throw new Error("Selected Trading duration is outside the supported policy bounds");
  if(!packagePolicy||!hasConfiguredTradingOfferPolicy(packagePolicy)) throw new Error("The selected tier has no complete saved Trading policy");
  if(effectiveRateBps<Number(packagePolicy.minimumPayoutRateBps)||effectiveRateBps>Number(packagePolicy.maximumPayoutRateBps)) throw new Error("Saved pop-up return rate is outside the tier's configured range");
  if(effectiveDurationSeconds<Number(packagePolicy.minimumTradeDurationSeconds)||effectiveDurationSeconds>Number(packagePolicy.maximumTradeDurationSeconds)) throw new Error("Saved pop-up duration is outside the tier's configured range");
  if(Number(packagePolicy.minimumRewardBps||0)>effectiveRateBps) throw new Error("Selected return rate is below the tier's minimum eligible reward rate");
  const uncappedReward=calculateConfiguredProfitMinor(input.amountMinor,effectiveRateBps);
  const reward=Number(packagePolicy.maxRewardPerTradeMinor||0)>0?Math.min(uncappedReward,Number(packagePolicy.maxRewardPerTradeMinor)):uncappedReward;
  if(reward<1) throw new Error("Configured capital and return rate do not produce a positive minor-unit reward");
  if (packagePolicy&&Number(packagePolicy.maxDailyRewardMinor||0)>0) {
    const reservationRows=await tx.execute(sql`SELECT COALESCE(SUM(reservedMinor),0) AS reserved FROM trade_reward_reservations WHERE userId=${userId} AND packageName=${activePackageSubscription.packageName} AND windowKey=${today} AND status='reserved'`) as any;
    // The daily reward ceiling counts realized net profit actually retained by the
    // customer, not gross profit before platform fees and not another package's trades.
    const creditedRows=await tx.execute(sql`SELECT COALESCE(SUM(tp.netProfitMinor),0) AS credited
      FROM trade_reward_reservations trr
      INNER JOIN trade_positions tp ON tp.id=trr.tradeId
      WHERE trr.userId=${userId} AND trr.packageName=${activePackageSubscription.packageName}
        AND trr.status='credited' AND tp.settlementStatus='completed'
        AND tp.settledAt>=${todayStartUtc} AND tp.settledAt<${tomorrowStartUtc}
        AND tp.netProfitMinor>0`) as any;
    const reserved=Number(reservationRows?.[0]?.[0]?.reserved||0), credited=Number(creditedRows?.[0]?.[0]?.credited||0);
    if (remainingRewardAllowance(Number(packagePolicy.maxDailyRewardMinor),credited,reserved)<reward) throw new Error("Daily reward cap reached for this package");
  }
  if(fundingPlan&&fundingPlan.sourceDebits.length){
    const targetRate=tradeFxRates.get(String(offer.currency).toUpperCase())!;
    await tx.insert(fxRateSnapshots).values({
      baseAsset:String(offer.currency).toUpperCase(),quoteAsset:"USD",rate:targetRate.rateUsdPerUnit,
      provider:targetRate.provider,sourceDate:targetRate.sourceDate,
      rawJson:JSON.stringify({purpose:"trade_cross_wallet_conversion",tradeReference:ref,fetchedAt:targetRate.fetchedAt.toISOString(),scale:targetRate.scale}),
    });
    for(const debit of fundingPlan.sourceDebits){
      const sourceBalance=walletRows.find(row=>String(row.currency).toUpperCase()===debit.currency);
      if(!sourceBalance) throw new Error("Source wallet " + debit.currency + " disappeared during funding");
      const sourceUpdate=await tx.update(customerBalances).set({
        availableMinor:sql`${customerBalances.availableMinor}-${debit.amountMinor}`,updatedAt:new Date(),
      }).where(and(eq(customerBalances.id,sourceBalance.id),gte(customerBalances.availableMinor,debit.amountMinor)));
      if(Number((sourceUpdate as any)[0]?.affectedRows||0)!==1) throw new Error("Insufficient spendable balance in " + debit.currency);
      const debitReference=ref+"-fx-"+debit.currency+"-debit";
      const creditReference=ref+"-fx-"+debit.currency+"-credit";
      await tx.insert(balanceLedger).values([
        {userId,currency:debit.currency,amountMinor:-debit.amountMinor,entryType:"trade_fx_conversion_debit",reference:debitReference,withdrawable:false},
        {userId,currency:offer.currency,amountMinor:debit.convertedTargetMinor,entryType:"trade_fx_conversion_credit",reference:creditReference,withdrawable:false},
      ]);
      await tx.insert(fxRateSnapshots).values({
        baseAsset:debit.currency,quoteAsset:"USD",rate:debit.rate.rateUsdPerUnit,
        provider:debit.rate.provider,sourceDate:debit.rate.sourceDate,
        rawJson:JSON.stringify({purpose:"trade_cross_wallet_conversion",tradeReference:ref,targetCurrency:offer.currency,
          targetCreditMinor:debit.convertedTargetMinor,sourceDebitMinor:debit.amountMinor,
          roundingExcessSourceMinor:debit.roundingExcessSourceMinor,roundingExcessUsdScaled:debit.roundingExcessUsdScaled,
          fetchedAt:debit.rate.fetchedAt.toISOString(),scale:debit.rate.scale}),
      });
    }
  }
  const minimumRequiredFromTarget=Math.max(0,input.amountMinor-convertedTargetMinor);
  const balanceUpdate=await tx.update(customerBalances).set({
    availableMinor:sql`${customerBalances.availableMinor}+${convertedTargetMinor}-${input.amountMinor}`,
    lockedMinor:sql`${customerBalances.lockedMinor}+${input.amountMinor}`,updatedAt:new Date(),
  }).where(and(eq(customerBalances.id,bal.id),gte(customerBalances.availableMinor,minimumRequiredFromTarget)));
  if(Number((balanceUpdate as any)[0]?.affectedRows||0)!==1) throw new Error("Insufficient available balance after FX conversion");
  await tx.insert(balanceLedger).values({userId,currency:offer.currency,amountMinor:-input.amountMinor,entryType:"trade_reservation",reference:ref,withdrawable:false});
  const settlementDelaySeconds=Math.max(Number(packagePolicy.minSettlementDelaySeconds||0),Math.min(Number(packagePolicy.maxSettlementDelaySeconds||settlementPolicy.delaySeconds),settlementPolicy.delaySeconds));
  const tradeStartedAt=new Date();
  const settlesAt=new Date(tradeStartedAt.getTime()+effectiveDurationSeconds*1000);
  const settlementReviewAt=new Date(settlesAt.getTime()+settlementDelaySeconds*1000);
  const creditAt=new Date(settlementReviewAt.getTime()+settlementPolicy.creditDelaySeconds*1000);
  const snapshotVersion=Number(popupSnapshot?.packagePolicyVersionSnapshot||packagePolicy.policyVersion||activePackageSubscription.termsVersion||1);
  const result=await tx.insert(tradePositions).values({userId,offerId:offer.id,packageSubscriptionId:selectedSubscriptionId,currency:offer.currency,principalMinor:input.amountMinor,expectedRewardMinor:reward,configuredProfitRateBps:effectiveRateBps,configuredDurationSeconds:effectiveDurationSeconds,packagePolicyVersionSnapshot:snapshotVersion,companyReferenceId:popupSnapshot?.companyReferenceId||null,companyDisplayName:popupSnapshot?.companyDisplayName||null,companyLogoUrl:popupSnapshot?.companyLogoUrl||null,companyReferenceMetadataJson:popupSnapshot?.companyReferenceMetadataJson||null,companyReferenceOnly:Boolean(popupSnapshot?.companyReferenceOnly??false),walletFundingPlanJson,transactionReference:ref,rewardReservedMinor:reward,settlesAt,settlementReviewAt,creditAt,lifecycleStage:"Trade Allocated",settlementStatus:"pending",policyVersion:snapshotVersion} as any);
  const tradeId=Number(result[0].insertId);
  await tx.insert(tradeLifecycleEvents).values({tradeId,userId,eventType:"trade_allocated",stage:"Trade Allocated",payloadJson:JSON.stringify({amountMinor:input.amountMinor,currency:offer.currency,packageSubscriptionId:selectedSubscriptionId,packageId:Number(activePackageSubscription.packageId),termsVersion:Number(activePackageSubscription.termsVersion||1),policyVersion:snapshotVersion,configuredProfitRateBps:effectiveRateBps,configuredDurationSeconds:effectiveDurationSeconds,companyReferenceId:popupSnapshot?.companyReferenceId||null,companyDisplayName:popupSnapshot?.companyDisplayName||null})});
  if(input.deliveryEventId!==undefined) await tx.update(opportunityPopupEvents).set({tradeId,eventStatus:"TRADED",executionStatus:"SUCCEEDED",executionRetryAfter:null,executionLastErrorCode:null,tradedAt:new Date(),updatedAt:new Date()}).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.offerId,offer.id)));
  else await tx.execute(sql`UPDATE opportunity_popup_events SET tradeId=${tradeId},eventStatus='TRADED',executionStatus='SUCCEEDED',executionRetryAfter=NULL,executionLastErrorCode=NULL,deliveryStatus=CASE WHEN deliveryStatus='failed' THEN deliveryStatus ELSE 'rendered' END,tradedAt=COALESCE(tradedAt,CURRENT_TIMESTAMP),updatedAt=CURRENT_TIMESTAMP WHERE userId=${userId} AND offerId=${offer.id} ORDER BY deliveredAt DESC LIMIT 1`);
  await tx.insert(tradeRewardReservations).values({userId,tradeId,packageName:activePackageSubscription.packageName,windowKey:today,currency:offer.currency,reservedMinor:reward,status:"reserved"});
  return {tradeId,rewardMinor:reward,rewardBps:effectiveRateBps,minimumMinor:terms.minimumMinor,calculationMethod:"saved-tier-policy",configuredDurationSeconds:effectiveDurationSeconds,packagePolicyVersionSnapshot:snapshotVersion,settlesAt,settlementReviewAt,creditAt,currency:offer.currency,amountMinor:input.amountMinor,rateUsd:nativeRate,rateUpdatedAt:currencyRow.updatedAt,amountUsd:nativeMinorToUsd(input.amountMinor,Number(currencyRow.scale),nativeRate)};
 });
}
export async function listTrades(userId:number){
  const db=await getDb();
  if(!db)throw new Error("Database is not available");
  const rows=await db.select({
    id:tradePositions.id,
    userId:tradePositions.userId,
    offerId:tradePositions.offerId,
    currency:tradePositions.currency,
    principalMinor:tradePositions.principalMinor,
    expectedRewardMinor:tradePositions.expectedRewardMinor,
    configuredProfitRateBps:tradePositions.configuredProfitRateBps,
    configuredDurationSeconds:tradePositions.configuredDurationSeconds,
    packagePolicyVersionSnapshot:tradePositions.packagePolicyVersionSnapshot,
    companyReferenceId:tradePositions.companyReferenceId,
    companyDisplayName:tradePositions.companyDisplayName,
    companyLogoUrl:tradePositions.companyLogoUrl,
    companyReferenceMetadataJson:tradePositions.companyReferenceMetadataJson,
    companyReferenceOnly:tradePositions.companyReferenceOnly,
    rewardCreditedMinor:tradePositions.rewardCreditedMinor,
    realizedGrossProfitMinor:tradePositions.realizedGrossProfitMinor,
    platformFeeMinor:tradePositions.platformFeeMinor,
    netProfitMinor:tradePositions.netProfitMinor,
    settlementOutcome:tradePositions.settlementOutcome,
    feePolicyVersion:tradePositions.feePolicyVersion,
    platformFeeRateBps:tradePositions.platformFeeRateBps,
    platformFeeRoundingMode:tradePositions.platformFeeRoundingMode,
    settlementReference:tradePositions.settlementReference,
    settlementConfirmedAt:tradePositions.settlementConfirmedAt,
    status:tradePositions.status,
    settlementStatus:tradePositions.settlementStatus,
    lifecycleStage:tradePositions.lifecycleStage,
    walletUpdatedAt:tradePositions.walletUpdatedAt,
    transactionReference:tradePositions.transactionReference,
    completionAt:tradePositions.completionAt,
    confirmedAt:tradePositions.confirmedAt,
    settlesAt:tradePositions.settlesAt,
    settlementReviewAt:tradePositions.settlementReviewAt,
    creditAt:tradePositions.creditAt,
    settledAt:tradePositions.settledAt,
    symbol:opportunityOffers.symbol,
    venueFrom:opportunityOffers.venueFrom,
    venueTo:opportunityOffers.venueTo,
  }).from(tradePositions)
    .leftJoin(opportunityOffers,eq(opportunityOffers.id,tradePositions.offerId))
    .where(eq(tradePositions.userId,userId))
    .orderBy(desc(tradePositions.confirmedAt));
  return rows.map(row=>{
    const settled=row.status==="settled";
    const pending=row.status==="pending";
    const hasActualBreakdown=Boolean(row.settlementConfirmedAt)&&row.settlementOutcome!=="legacy_unrecorded";
    const stage=settled?"Trade Completed":row.lifecycleStage||(pending?"Trade Allocated":new Date(row.settlesAt).getTime()<=Date.now()?"Awaiting Settlement Confirmation":"Trade Executing");
    return {
      ...row,
      tradeReference:`trade-${row.id}`,
      opportunityReference:`opportunity-${row.offerId}`,
      stage,
      settlementStatus:row.settlementStatus,
      rewardCredited:Boolean(row.walletUpdatedAt),
      creditedRewardMinor:hasActualBreakdown&&row.walletUpdatedAt?Math.max(0,Number(row.netProfitMinor||0)):null,
      walletUpdated:Boolean(row.walletUpdatedAt),
      completionAt:row.completionAt,
      transactionReference:row.transactionReference,
      hasActualBreakdown,
    };
  });
}
export async function markDueTradesAwaitingConfirmation(userId:number){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const due=await db.select({id:tradePositions.id}).from(tradePositions).where(and(
    eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed"),
    eq(tradePositions.settlementStatus,"pending"),or(lte(tradePositions.settlementReviewAt,now),and(isNull(tradePositions.settlementReviewAt),or(lte(tradePositions.creditAt,now),and(isNull(tradePositions.creditAt),lte(tradePositions.settlesAt,now))))),
  )).orderBy(tradePositions.settlementReviewAt,tradePositions.settlesAt);
  let marked=0;
  for(const item of due){
    const markedOne=await db.transaction(async tx=>{
      const trade=(await tx.select().from(tradePositions).where(and(eq(tradePositions.id,item.id),eq(tradePositions.userId,userId))).limit(1).for("update"))[0];
      if(!trade||trade.status!=="confirmed"||trade.settlementStatus!=="pending") return false;
      const dueAt=trade.settlementReviewAt||trade.creditAt||trade.settlesAt;
      if(!dueAt||new Date(dueAt).getTime()>now.getTime()) return false;
      if(trade.lifecycleStage==="Awaiting Settlement Confirmation") return false;

      // Elapsed time is not execution evidence. Record only a lifecycle status;
      // principal, earnings, fees and losses stay untouched until actual settlement is confirmed.
      const stateUpdate=await tx.update(tradePositions).set({
        lifecycleStage:"Awaiting Settlement Confirmation",
      }).where(and(eq(tradePositions.id,trade.id),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending")));
      assertExactlyOneAffectedRow(stateUpdate,"Due trade awaiting-confirmation transition");
      await tx.insert(tradeLifecycleEvents).values({
        tradeId:trade.id,
        userId,
        eventType:"settlement_due_waiting_for_confirmation",
        stage:"Awaiting Settlement Confirmation",
        payloadJson:JSON.stringify({dueAt:new Date(dueAt).toISOString(),reason:"Scheduled time elapsed; actual settlement confirmation is still required."}),
      });
      return true;
    });
    if(markedOne) marked++;
  }
  return marked;
}
export async function reconcileAllDueTradesAwaitingConfirmation(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const due=await db.select({id:tradePositions.id}).from(tradePositions).where(and(
    eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending"),
    or(isNull(tradePositions.lifecycleStage),notInArray(tradePositions.lifecycleStage,["Awaiting Settlement Confirmation"])),
    or(lte(tradePositions.settlementReviewAt,now),and(isNull(tradePositions.settlementReviewAt),or(lte(tradePositions.creditAt,now),and(isNull(tradePositions.creditAt),lte(tradePositions.settlesAt,now))))),
  )).orderBy(tradePositions.settlementReviewAt,tradePositions.settlesAt).limit(1000);
  let marked=0;
  for(const item of due){
    const markedOne=await db.transaction(async tx=>{
      const trade=(await tx.select().from(tradePositions).where(eq(tradePositions.id,item.id)).limit(1).for("update"))[0];
      if(!trade||trade.status!=="confirmed"||trade.settlementStatus!=="pending") return false;
      const dueAt=trade.settlementReviewAt||trade.creditAt||trade.settlesAt;
      if(!dueAt||new Date(dueAt).getTime()>now.getTime()) return false;
      if(trade.lifecycleStage==="Awaiting Settlement Confirmation") return false;
      const stateUpdate=await tx.update(tradePositions).set({
        lifecycleStage:"Awaiting Settlement Confirmation",
      }).where(and(eq(tradePositions.id,trade.id),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending")));
      assertExactlyOneAffectedRow(stateUpdate,"Global due-trade awaiting-confirmation transition");
      await tx.insert(tradeLifecycleEvents).values({
        tradeId:trade.id,
        userId:trade.userId,
        eventType:"settlement_due_waiting_for_confirmation",
        stage:"Awaiting Settlement Confirmation",
        payloadJson:JSON.stringify({dueAt:new Date(dueAt).toISOString(),reason:"Global reconciliation sweep found the scheduled time elapsed; actual settlement confirmation is still required."}),
      });
      return true;
    });
    if(markedOne) marked++;
  }
  return {scanned:due.length,marked,limit:1000,asOf:now.toISOString()};
}
export async function listPendingSettlements(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.select({
    id:tradePositions.id, userId:tradePositions.userId, offerId:tradePositions.offerId,
    packageSubscriptionId:tradePositions.packageSubscriptionId,
    currency:tradePositions.currency, principalMinor:tradePositions.principalMinor,
    expectedRewardMinor:tradePositions.expectedRewardMinor, rewardReservedMinor:tradePositions.rewardReservedMinor,
    status:tradePositions.status, settlementStatus:tradePositions.settlementStatus,
    lifecycleStage:tradePositions.lifecycleStage,
    confirmedAt:tradePositions.confirmedAt, settlesAt:tradePositions.settlesAt, settlementReviewAt:tradePositions.settlementReviewAt, creditAt:tradePositions.creditAt,
    settlementConfirmedAt:tradePositions.settlementConfirmedAt, settlementConfirmedBy:tradePositions.settlementConfirmedBy,
    settlementReference:tradePositions.settlementReference, walletUpdatedAt:tradePositions.walletUpdatedAt,
    settlementOutcome:tradePositions.settlementOutcome, realizedGrossProfitMinor:tradePositions.realizedGrossProfitMinor,
    platformFeeMinor:tradePositions.platformFeeMinor, netProfitMinor:tradePositions.netProfitMinor,
    reservationStatus:tradeRewardReservations.status,
    reservationPackageName:tradeRewardReservations.packageName,
    reservationAmountMinor:tradeRewardReservations.reservedMinor,
    symbol:opportunityOffers.symbol, packageName:users.packageName, customerName:users.name, customerEmail:users.email
  }).from(tradePositions)
    .leftJoin(opportunityOffers,eq(opportunityOffers.id,tradePositions.offerId))
    .leftJoin(users,eq(users.id,tradePositions.userId))
    .leftJoin(tradeRewardReservations,eq(tradeRewardReservations.tradeId,tradePositions.id))
    .where(and(eq(tradePositions.status,"confirmed"),or(eq(tradePositions.settlementStatus,"pending"),eq(tradePositions.settlementStatus,"confirmed_awaiting_credit")))).orderBy(desc(tradePositions.confirmedAt));
}
/**
 * Read-only reconciliation queue for settlement records whose persisted state
 * cannot be trusted without a human financial review. This function never
 * changes wallet, ledger, trade, or reservation state.
 */
export async function listTradeSettlementIntegrityIssues(input?: { limit?: number; beforeTradeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const safeLimit = Math.max(1, Math.min(1000, Number.isSafeInteger(input?.limit) ? Number(input?.limit) : 250));
  const statusIssues = or(
    and(eq(tradePositions.status, "settled"), eq(tradePositions.settlementOutcome, "legacy_unrecorded")),
    and(eq(tradePositions.status, "settled"), isNull(tradePositions.settlementReference)),
    and(eq(tradePositions.status, "settled"), isNull(tradeSettlementReferenceClaims.tradeId)),
    and(eq(tradePositions.status, "settled"), isNotNull(tradePositions.settlementReference), isNotNull(tradeSettlementReferenceClaims.settlementReference), sql`${tradePositions.settlementReference} <> ${tradeSettlementReferenceClaims.settlementReference}`),
    and(eq(tradePositions.status, "settled"), sql`${tradePositions.settlementStatus} <> 'completed'`),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "pending"), isNull(tradeRewardReservations.id), gt(tradePositions.rewardReservedMinor, 0)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "pending"), eq(tradeRewardReservations.status, "credited")),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "pending"), eq(tradeRewardReservations.status, "released")),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), isNull(tradePositions.settlementReference)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), isNull(tradeSettlementReferenceClaims.tradeId)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), isNull(tradePositions.settlementConfirmedAt)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), isNotNull(tradePositions.walletUpdatedAt)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), isNull(tradeRewardReservations.id), gt(tradePositions.rewardReservedMinor, 0)),
    and(eq(tradePositions.status, "confirmed"), eq(tradePositions.settlementStatus, "confirmed_awaiting_credit"), or(eq(tradeRewardReservations.status, "credited"), eq(tradeRewardReservations.status, "released"))),
    and(eq(tradePositions.status, "settled"), eq(tradePositions.settlementStatus, "completed"), eq(tradeRewardReservations.status, "reserved")),
    and(isNotNull(tradeRewardReservations.id), sql`(${tradeRewardReservations.userId} <> ${tradePositions.userId} OR ${tradeRewardReservations.currency} <> ${tradePositions.currency} OR ${tradeRewardReservations.reservedMinor} <> ${tradePositions.rewardReservedMinor})`)
  );
  const whereClause = input?.beforeTradeId
    ? and(statusIssues, lt(tradePositions.id, input.beforeTradeId))
    : statusIssues;
  const rows = await db.select({
    tradeId: tradePositions.id,
    userId: tradePositions.userId,
    currency: tradePositions.currency,
    principalMinor: tradePositions.principalMinor,
    status: tradePositions.status,
    settlementStatus: tradePositions.settlementStatus,
    lifecycleStage: tradePositions.lifecycleStage,
    settlementOutcome: tradePositions.settlementOutcome,
    settlementReference: tradePositions.settlementReference,
    settlementConfirmedAt: tradePositions.settlementConfirmedAt,
    walletUpdatedAt: tradePositions.walletUpdatedAt,
    realizedGrossProfitMinor: tradePositions.realizedGrossProfitMinor,
    platformFeeMinor: tradePositions.platformFeeMinor,
    netProfitMinor: tradePositions.netProfitMinor,
    rewardReservedMinor: tradePositions.rewardReservedMinor,
    rewardCreditedMinor: tradePositions.rewardCreditedMinor,
    settledAt: tradePositions.settledAt,
    reservationId: tradeRewardReservations.id,
    reservationUserId: tradeRewardReservations.userId,
    reservationCurrency: tradeRewardReservations.currency,
    reservationAmountMinor: tradeRewardReservations.reservedMinor,
    reservationStatus: tradeRewardReservations.status,
    claimReference: tradeSettlementReferenceClaims.settlementReference,
    claimTradeId: tradeSettlementReferenceClaims.tradeId,
  }).from(tradePositions)
    .leftJoin(tradeRewardReservations, eq(tradeRewardReservations.tradeId, tradePositions.id))
    .leftJoin(tradeSettlementReferenceClaims, eq(tradeSettlementReferenceClaims.tradeId, tradePositions.id))
    .where(whereClause)
    .orderBy(desc(tradePositions.id))
    .limit(safeLimit + 1);

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const issues = pageRows.map((row) => {
    const flags: string[] = [];
    if (row.status === "settled" && row.settlementOutcome === "legacy_unrecorded") flags.push("historical_settlement_without_recorded_result");
    if (row.status === "settled" && !row.settlementReference) flags.push("settled_trade_missing_reference");
    if (row.status === "settled" && !row.claimTradeId) flags.push("settled_trade_missing_reference_claim");
    if (row.claimTradeId !== null && row.claimTradeId !== undefined && row.claimTradeId !== row.tradeId) flags.push("settlement_reference_claim_trade_mismatch");
    if (row.claimReference && row.settlementReference && row.claimReference !== row.settlementReference) flags.push("settlement_reference_claim_value_mismatch");
    if (row.status === "confirmed" && row.settlementStatus === "pending" && !row.reservationId && Number(row.rewardReservedMinor) > 0) flags.push("pending_trade_missing_reward_reservation");
    if (row.status === "confirmed" && row.settlementStatus === "pending" && (row.reservationStatus === "credited" || row.reservationStatus === "released")) flags.push("pending_trade_reservation_not_reserved");
    if (row.status === "confirmed" && row.settlementStatus === "confirmed_awaiting_credit" && !row.settlementReference) flags.push("confirmed_trade_missing_settlement_reference");
    if (row.status === "confirmed" && row.settlementStatus === "confirmed_awaiting_credit" && !row.claimTradeId) flags.push("confirmed_trade_missing_reference_claim");
    if (row.status === "confirmed" && row.settlementStatus === "confirmed_awaiting_credit" && !row.settlementConfirmedAt) flags.push("confirmed_trade_missing_confirmation_timestamp");
    if (row.status === "confirmed" && row.settlementStatus === "confirmed_awaiting_credit" && row.walletUpdatedAt) flags.push("awaiting_credit_trade_wallet_already_updated");
    if (row.status === "confirmed" && row.settlementStatus === "confirmed_awaiting_credit" && (row.reservationStatus === "credited" || row.reservationStatus === "released")) flags.push("confirmed_trade_reservation_not_reserved");
    if (row.status === "settled" && row.settlementStatus === "completed" && row.reservationStatus === "reserved") flags.push("settled_trade_reservation_still_reserved");
    if (row.reservationId && (row.reservationUserId !== row.userId || row.reservationCurrency !== row.currency || Number(row.reservationAmountMinor) !== Number(row.rewardReservedMinor))) flags.push("trade_reward_reservation_identity_or_amount_mismatch");
    if (row.status === "settled" && row.settlementStatus !== "completed") flags.push("settled_trade_status_not_completed");
    return { ...row, issues: flags };
  }).filter((row) => row.issues.length > 0);

  return {
    issues,
    scan: {
      limit: safeLimit,
      candidatesExamined: pageRows.length,
      hasMore,
      nextBeforeTradeId: hasMore && pageRows.length ? Number(pageRows[pageRows.length - 1].tradeId) : null,
    },
  };
}

export async function listWalletLedgerReconciliation(input?: {
  limit?: number;
  afterUserId?: number;
  afterCurrency?: string;
  beforeTradeId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
  const safeLimit = Math.max(1, Math.min(1000, Number.isSafeInteger(input?.limit) ? Number(input?.limit) : 250));
  if ((input?.afterUserId === undefined) !== (input?.afterCurrency === undefined)) {
    throw new Error("Wallet reconciliation cursor requires both customer ID and currency");
  }
  const walletCursor = input?.afterUserId === undefined ? sql`1=1` : or(
    gt(customerBalances.userId, input.afterUserId),
    and(eq(customerBalances.userId, input.afterUserId), gt(customerBalances.currency, input.afterCurrency!))
  );
  const ledgerCursor = input?.afterUserId === undefined ? sql`1=1` : or(
    gt(balanceLedger.userId, input.afterUserId),
    and(eq(balanceLedger.userId, input.afterUserId), gt(balanceLedger.currency, input.afterCurrency!))
  );
  const tradeCursor = input?.afterUserId === undefined ? sql`1=1` : or(
    gt(tradePositions.userId, input.afterUserId),
    and(eq(tradePositions.userId, input.afterUserId), gt(tradePositions.currency, input.afterCurrency!))
  );
  const payoutCursor = input?.afterUserId === undefined ? sql`1=1` : or(
    gt(payoutRequests.userId, input.afterUserId),
    and(eq(payoutRequests.userId, input.afterUserId), gt(payoutRequests.currency, input.afterCurrency!))
  );

  const [walletGroups, ledgerGroups, tradeGroups, payoutGroups] = await Promise.all([
    tx.select({
      userId: customerBalances.userId,
      currency: customerBalances.currency,
      walletCount: count(),
      availableMinor: sql<string>`COALESCE(SUM(${customerBalances.availableMinor}), 0)`,
      lockedMinor: sql<string>`COALESCE(SUM(${customerBalances.lockedMinor}), 0)`,
    }).from(customerBalances).where(walletCursor)
      .groupBy(customerBalances.userId, customerBalances.currency)
      .orderBy(customerBalances.userId, customerBalances.currency).limit(safeLimit + 1),
    tx.select({
      userId: balanceLedger.userId,
      currency: balanceLedger.currency,
      ledgerEntryCount: count(),
      ledgerNetMinor: sql<string>`COALESCE(SUM(${balanceLedger.amountMinor}), 0)`,
    }).from(balanceLedger).where(ledgerCursor)
      .groupBy(balanceLedger.userId, balanceLedger.currency)
      .orderBy(balanceLedger.userId, balanceLedger.currency).limit(safeLimit + 1),
    tx.select({
      userId: tradePositions.userId,
      currency: tradePositions.currency,
      activeTradeCount: count(),
      knownActiveTradePrincipalMinor: sql<string>`COALESCE(SUM(${tradePositions.principalMinor}), 0)`,
    }).from(tradePositions).where(and(
      tradeCursor,
      inArray(tradePositions.status, ["confirmed"]),
      eq(tradePositions.settlementStatus, "pending")
    )).groupBy(tradePositions.userId, tradePositions.currency)
      .orderBy(tradePositions.userId, tradePositions.currency).limit(safeLimit + 1),
    tx.select({
      userId: payoutRequests.userId,
      currency: payoutRequests.currency,
      pendingPayoutCount: count(),
      pendingPayoutMinor: sql<string>`COALESCE(SUM(${payoutRequests.amountMinor}), 0)`,
    }).from(payoutRequests).where(and(payoutCursor, eq(payoutRequests.status, "pending")))
      .groupBy(payoutRequests.userId, payoutRequests.currency)
      .orderBy(payoutRequests.userId, payoutRequests.currency).limit(safeLimit + 1),
  ]);

  const keyFor = (userId: number, currency: string) => String(userId) + "\u0000" + currency;
  const candidateKeys = new Map<string, { userId: number; currency: string }>();
  for (const row of [...walletGroups, ...ledgerGroups, ...tradeGroups, ...payoutGroups]) {
    const userId = Number(row.userId);
    const currency = String(row.currency);
    candidateKeys.set(keyFor(userId, currency), { userId, currency });
  }
  const allGroups = Array.from(candidateKeys.values()).sort((a, b) => a.userId - b.userId || a.currency.localeCompare(b.currency));
  const groups = allGroups.slice(0, safeLimit);
  const hasMoreWalletGroups = allGroups.length > safeLimit;
  const walletMap = new Map(walletGroups.map((row) => [keyFor(Number(row.userId), String(row.currency)), row]));
  const ledgerMap = new Map(ledgerGroups.map((row) => [keyFor(Number(row.userId), String(row.currency)), row]));
  const tradeMap = new Map(tradeGroups.map((row) => [keyFor(Number(row.userId), String(row.currency)), row]));
  const payoutMap = new Map(payoutGroups.map((row) => [keyFor(Number(row.userId), String(row.currency)), row]));

  const walletIssues = groups.map((group) => {
    const key = keyFor(group.userId, group.currency);
    const wallet = walletMap.get(key);
    const ledger = ledgerMap.get(key);
    const trades = tradeMap.get(key);
    const payouts = payoutMap.get(key);
    return inspectWalletLedgerSnapshot({
      userId: group.userId,
      currency: group.currency,
      walletCount: wallet?.walletCount ?? 0,
      availableMinor: wallet?.availableMinor ?? 0,
      lockedMinor: wallet?.lockedMinor ?? 0,
      ledgerEntryCount: ledger?.ledgerEntryCount ?? 0,
      ledgerNetMinor: ledger?.ledgerNetMinor ?? 0,
      activeTradeCount: trades?.activeTradeCount ?? 0,
      knownActiveTradePrincipalMinor: trades?.knownActiveTradePrincipalMinor ?? 0,
      pendingPayoutCount: payouts?.pendingPayoutCount ?? 0,
      pendingPayoutMinor: payouts?.pendingPayoutMinor ?? 0,
    });
  }).filter((row) => row.issues.length > 0);

  const tradeWhere = input?.beforeTradeId
    ? and(eq(tradePositions.status, "settled"), lt(tradePositions.id, input.beforeTradeId))
    : eq(tradePositions.status, "settled");
  const candidateTrades = await tx.select({
    tradeId: tradePositions.id,
    userId: tradePositions.userId,
    currency: tradePositions.currency,
    principalMinor: tradePositions.principalMinor,
    status: tradePositions.status,
    settlementStatus: tradePositions.settlementStatus,
    settlementOutcome: tradePositions.settlementOutcome,
    settlementReference: tradePositions.settlementReference,
    settlementConfirmedAt: tradePositions.settlementConfirmedAt,
    walletUpdatedAt: tradePositions.walletUpdatedAt,
    realizedGrossProfitMinor: tradePositions.realizedGrossProfitMinor,
    platformFeeMinor: tradePositions.platformFeeMinor,
    netProfitMinor: tradePositions.netProfitMinor,
    rewardCreditedMinor: tradePositions.rewardCreditedMinor,
    platformFeeRateBps: tradePositions.platformFeeRateBps,
    platformFeeRoundingMode: tradePositions.platformFeeRoundingMode,
    feePolicyVersion: tradePositions.feePolicyVersion,
  }).from(tradePositions).where(tradeWhere)
    .orderBy(desc(tradePositions.id)).limit(safeLimit + 1);
  const hasMoreSettledTrades = candidateTrades.length > safeLimit;
  const trades = candidateTrades.slice(0, safeLimit);
  const candidateReferences = buildSettlementLedgerCandidateReferences(trades.map((trade) => ({
    tradeId: Number(trade.tradeId),
    settlementReference: trade.settlementReference,
  })));
  const ledgerEntryLimit = Math.min(10000, safeLimit * 16);
  const candidateLedgerRows = candidateReferences.length
    ? await tx.select({
        id: balanceLedger.id,
        userId: balanceLedger.userId,
        currency: balanceLedger.currency,
        amountMinor: balanceLedger.amountMinor,
        entryType: balanceLedger.entryType,
        reference: balanceLedger.reference,
      }).from(balanceLedger).where(inArray(balanceLedger.reference, candidateReferences))
        .orderBy(balanceLedger.id).limit(ledgerEntryLimit + 1)
    : [];
  const ledgerEntriesTruncated = candidateLedgerRows.length > ledgerEntryLimit;
  const ledgerRows = candidateLedgerRows.slice(0, ledgerEntryLimit);
  const settlementIssues = trades.map((trade) => inspectSettlementLedgerPostings({
    ...trade,
    tradeId: Number(trade.tradeId),
    userId: Number(trade.userId),
    principalMinor: trade.principalMinor,
    realizedGrossProfitMinor: trade.realizedGrossProfitMinor,
    platformFeeMinor: trade.platformFeeMinor,
    netProfitMinor: trade.netProfitMinor,
    rewardCreditedMinor: trade.rewardCreditedMinor,
    platformFeeRateBps: trade.platformFeeRateBps,
    feePolicyVersion: trade.feePolicyVersion,
    platformFeeRoundingMode: trade.platformFeeRoundingMode,
  }, ledgerRows as Array<{
    id: number; userId: number; currency: string; amountMinor: number | string;
    entryType: string; reference: string;
  }>, !ledgerEntriesTruncated)).filter((row) => row.issues.length > 0);

  const lastWalletGroup = groups[groups.length - 1];
  const lastSettlementTrade = trades[trades.length - 1];
  return {
    generatedAt: new Date().toISOString(),
    walletIssues,
    walletScan: {
      limit: safeLimit,
      groupsExamined: groups.length,
      hasMore: hasMoreWalletGroups,
      nextCursor: hasMoreWalletGroups && lastWalletGroup
        ? { afterUserId: lastWalletGroup.userId, afterCurrency: lastWalletGroup.currency }
        : null,
    },
    settlementIssues,
    settlementScan: {
      limit: safeLimit,
      tradesExamined: trades.length,
      hasMore: hasMoreSettledTrades,
      nextBeforeTradeId: hasMoreSettledTrades && lastSettlementTrade ? Number(lastSettlementTrade.tradeId) : null,
      ledgerEntriesExamined: ledgerRows.length,
      ledgerEntriesTruncated,
    },
  };
  });
}

export async function manuallySettleTrade(tradeId:number, adminId:number, input:{grossProfitMinor:number; settlementReference:string; notes?:string}){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  if(!Number.isSafeInteger(input.grossProfitMinor)) throw new Error("Actual gross profit or loss must be a signed safe integer");
  const reference=input.settlementReference.trim();
  if(reference.length<3) throw new Error("Settlement reference must contain at least 3 characters");
  if(reference.length>160) throw new Error("Settlement reference must not exceed 160 characters");
  if(input.notes!==undefined&&input.notes.trim().length>2000) throw new Error("Settlement notes must not exceed 2000 characters");
  const result=await db.transaction(async tx=>{
    const trade=(await tx.select().from(tradePositions).where(eq(tradePositions.id,tradeId)).limit(1).for("update"))[0];
    if(!trade) throw new Error("Trade not found");
    // Replaying an already committed reference/result is safe and never posts again.
    if((trade.status==="settled"&&trade.settlementStatus==="completed"||trade.status==="confirmed"&&trade.settlementStatus==="confirmed_awaiting_credit")&&trade.settlementReference===reference){
      if(trade.settlementOutcome==="legacy_unrecorded") throw new Error("This historical settlement has no recorded gross-profit result; replay requires manual financial review.");
      if(Number(trade.realizedGrossProfitMinor)!==input.grossProfitMinor) throw new Error("Settlement reference was already used with a different actual result");
      return {tradeId,userId:trade.userId,offerId:trade.offerId,currency:trade.currency,principalMinor:Number(trade.principalMinor),grossProfitMinor:Number(trade.realizedGrossProfitMinor),platformFeeMinor:Number(trade.platformFeeMinor),netProfitMinor:Number(trade.netProfitMinor),rewardMinor:Math.max(0,Number(trade.netProfitMinor)),totalMinor:Number(trade.principalMinor)+Number(trade.netProfitMinor),feeRateBps:Number(trade.platformFeeRateBps),roundingMode:String(trade.platformFeeRoundingMode) as FeeRoundingMode,feePolicyVersion:Number(trade.feePolicyVersion),outcome:String(trade.settlementOutcome),reference,legacyUnrecorded:false,walletCreditPending:trade.status!=="settled",creditAt:trade.creditAt||trade.settlementReviewAt||trade.settlesAt};
    }
    if(trade.status!=="confirmed"||trade.settlementStatus!=="pending") throw new Error("Trade is not pending manual settlement");
    // The saved review timestamp includes the configured settlement delay.
    // creditAt separately includes the wallet-credit delay after review becomes due.
    const settlementDueAt=trade.settlementReviewAt||trade.creditAt||trade.settlesAt;
    if(!settlementDueAt||!Number.isFinite(new Date(settlementDueAt).getTime())||new Date(settlementDueAt).getTime()>Date.now()) {
      throw new Error("Trade is not yet due for settlement confirmation");
    }

    // A trade tied to a package subscription must still resolve to that exact owner/package.
    // Settlement does not depend on the subscription remaining active, only on its identity.
    let packageName:string|null=null;
    if(trade.packageSubscriptionId!==null) {
      const subscription=(await tx.select({userId:customerPackageSubscriptions.userId,packageId:customerPackageSubscriptions.packageId})
        .from(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.id,trade.packageSubscriptionId)).limit(1).for("update"))[0];
      if(!subscription||subscription.userId!==trade.userId) throw new Error("Trade package subscription identity is inconsistent");
      const packageRow=(await tx.select({name:packages.name}).from(packages).where(eq(packages.id,subscription.packageId)).limit(1))[0];
      if(!packageRow?.name) throw new Error("Trade package identity cannot be resolved");
      packageName=packageRow.name;
    }

    // Lock the active fee policy so this result uses one auditable, stable version.
    const feeSettings=await tx.select().from(appSettings).where(inArray(appSettings.settingKey,[...TRADE_FEE_SETTING_KEYS])).for("update");
    const feeByKey=new Map<string,string>();
    for(const row of feeSettings) feeByKey.set(row.settingKey,row.settingValue);
    const feePolicy=normalizeTradeFeePolicy({
      feeRateBps:feeByKey.get("trade.platformFeeBps")??String(DEFAULT_TRADE_FEE_POLICY.feeRateBps),
      roundingMode:feeByKey.get("trade.feeRoundingMode")??DEFAULT_TRADE_FEE_POLICY.roundingMode,
      policyVersion:feeByKey.get("trade.feePolicyVersion")??String(DEFAULT_TRADE_FEE_POLICY.policyVersion),
    });
    const principal=Number(trade.principalMinor);
    const accounting=calculateRealizedProfitSettlement({
      principalMinor:principal,
      grossProfitMinor:input.grossProfitMinor,
      feeRateBps:feePolicy.feeRateBps,
      roundingMode:feePolicy.roundingMode,
    });

    const duplicate=(await tx.select({id:tradePositions.id}).from(tradePositions).where(eq(tradePositions.settlementReference,reference)).limit(1))[0];
    if(duplicate) throw new Error("Settlement reference has already been used");
    // The unique claim is acquired before ledger mutation. Same reference across
    // different trades cannot reach the financial postings concurrently.
    try {
      await tx.insert(tradeSettlementReferenceClaims).values({settlementReference:reference,tradeId});
    } catch(error) {
      const code=error&&typeof error==="object"&&"code" in error?String((error as {code:unknown}).code):"";
      if(code==="ER_DUP_ENTRY") throw new Error("Settlement reference has already been used");
      throw error;
    }
    const reservation=(await tx.select().from(tradeRewardReservations).where(eq(tradeRewardReservations.tradeId,tradeId)).limit(1).for("update"))[0];
    const reservedMinor=Number(trade.rewardReservedMinor||0);
    if(reservation) {
      if(reservation.userId!==trade.userId||reservation.currency!==trade.currency||reservation.tradeId!==trade.id) {
        throw new Error("Trade reward reservation identity does not match the trade");
      }
      if(packageName!==null&&reservation.packageName!==packageName) throw new Error("Trade reward reservation package does not match the trade subscription");
      if(reservation.status!=="reserved") throw new Error("Trade reward reservation is not pending while the trade is awaiting settlement");
      if(!Number.isSafeInteger(reservedMinor)||reservedMinor<0||Number(reservation.reservedMinor)!==reservedMinor) {
        throw new Error("Trade reward reservation amount is inconsistent with the trade");
      }
    } else if(!Number.isSafeInteger(reservedMinor)||reservedMinor!==0) {
      throw new Error("Trade has a reserved reward amount but its reservation record is missing");
    }

    const wallet=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,trade.userId),eq(customerBalances.currency,trade.currency))).limit(1).for("update"))[0];
    if(!wallet) throw new Error("Customer settlement wallet is not configured");
    const lockedMinor=Number(wallet.lockedMinor);
    if(!Number.isSafeInteger(lockedMinor)||lockedMinor<principal) {
      throw new Error("Settlement wallet locked balance is inconsistent with the trade principal");
    }

    const now=new Date();
    const settlementUpdate=await tx.update(tradePositions).set({
      lifecycleStage:"Settlement Confirmed — Awaiting Wallet Credit",
      settlementStatus:"confirmed_awaiting_credit",
      realizedGrossProfitMinor:accounting.grossProfitMinor,
      platformFeeMinor:accounting.platformFeeMinor,
      netProfitMinor:accounting.netProfitMinor,
      feePolicyVersion:feePolicy.policyVersion,
      platformFeeRateBps:feePolicy.feeRateBps,
      platformFeeRoundingMode:feePolicy.roundingMode,
      settlementOutcome:accounting.outcome,
      transactionReference:reference.length<=120?reference:`trade-${tradeId}-${crypto.createHash("sha256").update(reference).digest("hex").slice(0,32)}`,
      settlementReference:reference,
      settlementConfirmedAt:now,
      settlementConfirmedBy:adminId,
      settlementNotes:input.notes?.trim()||null,
    }).where(and(eq(tradePositions.id,tradeId),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending")));
    // Evidence-backed confirmation does not post money. Principal stays locked,
    // and the reward reservation remains reserved until the saved creditAt.
    assertExactlyOneAffectedRow(settlementUpdate,"Manual trade result confirmation transition");
    await tx.insert(tradeLifecycleEvents).values({
      tradeId,userId:trade.userId,eventType:"manual_settlement_confirmed",stage:"Settlement Confirmed — Awaiting Wallet Credit",
      payloadJson:JSON.stringify({principalMinor:principal,grossProfitMinor:accounting.grossProfitMinor,platformFeeMinor:accounting.platformFeeMinor,netProfitMinor:accounting.netProfitMinor,feeRateBps:feePolicy.feeRateBps,roundingMode:feePolicy.roundingMode,feePolicyVersion:feePolicy.policyVersion,outcome:accounting.outcome,reference,adminId,creditAt:trade.creditAt||trade.settlementReviewAt||trade.settlesAt}),
    });
    if(accounting.netProfitMinor>Number(trade.rewardReservedMinor||0)){
      await tx.insert(tradeLifecycleEvents).values({
        tradeId,userId:trade.userId,eventType:"realized_reward_exceeded_reservation",stage:"Settlement Reconciliation Required",
        payloadJson:JSON.stringify({reservedMinor:Number(trade.rewardReservedMinor||0),actualNetProfitMinor:accounting.netProfitMinor,reference,reason:"Actual realized result exceeded the opportunity reward reservation; actual settlement was recorded without capping or fabricating the result."}),
      });
    }
    return {
      tradeId,userId:trade.userId,offerId:trade.offerId,currency:trade.currency,
      principalMinor:principal,grossProfitMinor:accounting.grossProfitMinor,
      platformFeeMinor:accounting.platformFeeMinor,netProfitMinor:accounting.netProfitMinor,
      rewardMinor:Math.max(0,accounting.netProfitMinor),totalMinor:accounting.totalReturnedMinor,
      feeRateBps:feePolicy.feeRateBps,roundingMode:feePolicy.roundingMode,
      feePolicyVersion:feePolicy.policyVersion,outcome:accounting.outcome,reference,legacyUnrecorded:false,
      walletCreditPending:true,creditAt:trade.creditAt||trade.settlementReviewAt||trade.settlesAt,
    };
  });
  // Popup completion is recorded only after the separate wallet-credit worker commits.
  return result;
}

export async function processConfirmedTradeCredits(input?: { limit?: number }) {
  const db=await getDb();
  if(!db) throw new Error("Database is not available");
  const requestedLimit=input?.limit;
  const limit=Math.max(1,Math.min(250,Number.isSafeInteger(requestedLimit)?Number(requestedLimit):100));
  const now=new Date();
  const due=await db.select({id:tradePositions.id}).from(tradePositions).where(and(
    eq(tradePositions.status,"confirmed"),
    eq(tradePositions.settlementStatus,"confirmed_awaiting_credit"),
    or(lte(tradePositions.creditAt,now),and(isNull(tradePositions.creditAt),or(lte(tradePositions.settlementReviewAt,now),and(isNull(tradePositions.settlementReviewAt),lte(tradePositions.settlesAt,now))))),
  )).orderBy(tradePositions.creditAt,tradePositions.settlementReviewAt,tradePositions.settlesAt).limit(limit);
  let credited=0;
  let skipped=0;
  for(const item of due){
    const posted=await db.transaction(async tx=>{
      const trade=(await tx.select().from(tradePositions).where(eq(tradePositions.id,item.id)).limit(1).for("update"))[0];
      if(!trade||trade.status!=="confirmed"||trade.settlementStatus!=="confirmed_awaiting_credit"||trade.walletUpdatedAt) return null;
      const creditDueAt=trade.creditAt||trade.settlementReviewAt||trade.settlesAt;
      if(!creditDueAt||new Date(creditDueAt).getTime()>now.getTime()) return null;
      if(!trade.settlementConfirmedAt||!trade.settlementConfirmedBy||!trade.settlementReference||trade.settlementOutcome==="legacy_unrecorded") {
        throw new Error("Confirmed trade is missing its evidence-backed settlement record");
      }
      const claim=(await tx.select().from(tradeSettlementReferenceClaims).where(eq(tradeSettlementReferenceClaims.tradeId,trade.id)).limit(1))[0];
      if(!claim||claim.settlementReference!==trade.settlementReference) throw new Error("Confirmed trade settlement reference claim is missing or inconsistent");
      const principal=Number(trade.principalMinor);
      const grossProfit=Number(trade.realizedGrossProfitMinor);
      const savedFee=Number(trade.platformFeeMinor);
      const savedNet=Number(trade.netProfitMinor);
      if(![principal,grossProfit,savedFee,savedNet].every(Number.isSafeInteger)||principal<=0||savedFee<0) {
        throw new Error("Confirmed trade contains unsafe saved settlement amounts");
      }
      const accounting=calculateRealizedProfitSettlement({
        principalMinor:principal,
        grossProfitMinor:grossProfit,
        feeRateBps:Number(trade.platformFeeRateBps),
        roundingMode:String(trade.platformFeeRoundingMode) as FeeRoundingMode,
      });
      if(accounting.platformFeeMinor!==savedFee||accounting.netProfitMinor!==savedNet||accounting.outcome!==trade.settlementOutcome) {
        throw new Error("Saved confirmed settlement amounts do not match the immutable fee-policy calculation");
      }
      if(!Number.isSafeInteger(accounting.totalReturnedMinor)||accounting.totalReturnedMinor<0) {
        throw new Error("Confirmed settlement would produce an invalid wallet credit");
      }
      const reservation=(await tx.select().from(tradeRewardReservations).where(eq(tradeRewardReservations.tradeId,trade.id)).limit(1).for("update"))[0];
      const reservedMinor=Number(trade.rewardReservedMinor||0);
      if(reservation) {
        if(reservation.userId!==trade.userId||reservation.currency!==trade.currency||reservation.tradeId!==trade.id||
          reservation.status!=="reserved"||!Number.isSafeInteger(reservedMinor)||reservedMinor<0||Number(reservation.reservedMinor)!==reservedMinor) {
          throw new Error("Confirmed trade reward reservation is inconsistent");
        }
      } else if(!Number.isSafeInteger(reservedMinor)||reservedMinor!==0) {
        throw new Error("Confirmed trade is missing its reserved reward record");
      }
      const wallet=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,trade.userId),eq(customerBalances.currency,trade.currency))).limit(1).for("update"))[0];
      if(!wallet) throw new Error("Customer settlement wallet is not configured");
      const lockedMinor=Number(wallet.lockedMinor);
      if(!Number.isSafeInteger(lockedMinor)||lockedMinor<principal) {
        throw new Error("Settlement wallet locked balance is inconsistent with the confirmed trade principal");
      }
      const availableMinor=Number(wallet.availableMinor);
      const earnedMinor=Number(wallet.earnedMinor);
      if(!Number.isSafeInteger(availableMinor)||availableMinor<0||!Number.isSafeInteger(earnedMinor)||
        !Number.isSafeInteger(availableMinor+accounting.totalReturnedMinor)||
        !Number.isSafeInteger(earnedMinor+accounting.netProfitMinor)) {
        throw new Error("Settlement wallet totals are outside the safe minor-unit range");
      }
      const reference=trade.settlementReference;
      const ledgerBase=reference.length<=60?reference:`trade-${trade.id}-${crypto.createHash("sha256").update(reference).digest("hex").slice(0,24)}`;
      await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:principal,entryType:"trade_principal_release",reference:`${ledgerBase}:principal`,withdrawable:false});
      if(grossProfit>0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:grossProfit,entryType:"trade_reward",reference:`${ledgerBase}:gross-profit`,withdrawable:false});
      if(savedFee>0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:-savedFee,entryType:"trade_platform_fee",reference:`${ledgerBase}:platform-fee`,withdrawable:false});
      if(grossProfit<0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:grossProfit,entryType:"trade_loss",reference:`${ledgerBase}:loss`,withdrawable:false});
      const walletUpdate=await tx.update(customerBalances).set({
        availableMinor:sql`${customerBalances.availableMinor}+${accounting.totalReturnedMinor}`,
        lockedMinor:sql`${customerBalances.lockedMinor}-${principal}`,
        earnedMinor:sql`${customerBalances.earnedMinor}+${accounting.netProfitMinor}`,
        updatedAt:now,
      }).where(and(eq(customerBalances.id,wallet.id),gte(customerBalances.lockedMinor,principal)));
      assertExactlyOneAffectedRow(walletUpdate,"Confirmed trade wallet credit");
      const stateUpdate=await tx.update(tradePositions).set({
        status:"settled",
        settledAt:now,
        lifecycleStage:"Trade Completed",
        settlementStatus:"completed",
        rewardCreditedMinor:accounting.rewardCreditedMinor,
        walletUpdatedAt:now,
        completionAt:now,
      }).where(and(eq(tradePositions.id,trade.id),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"confirmed_awaiting_credit"),isNull(tradePositions.walletUpdatedAt)));
      assertExactlyOneAffectedRow(stateUpdate,"Confirmed trade wallet-credit state transition");
      if(reservation) {
        const reservationUpdate=await tx.update(tradeRewardReservations).set({
          status:accounting.netProfitMinor>0?"credited":"released",
          updatedAt:now,
        }).where(and(eq(tradeRewardReservations.id,reservation.id),eq(tradeRewardReservations.status,"reserved")));
        assertExactlyOneAffectedRow(reservationUpdate,"Confirmed trade reward reservation posting");
      }
      await tx.insert(tradeLifecycleEvents).values([
        {tradeId:trade.id,userId:trade.userId,eventType:"wallet_credit_posted",stage:"Wallet Updated",payloadJson:JSON.stringify({principalMinor:principal,grossProfitMinor:grossProfit,platformFeeMinor:savedFee,netProfitMinor:savedNet,reference,confirmedAt:trade.settlementConfirmedAt,creditedAt:now.toISOString()})},
        {tradeId:trade.id,userId:trade.userId,eventType:"trade_completed",stage:"Trade Completed",payloadJson:JSON.stringify({reference,outcome:trade.settlementOutcome,realizedGrossProfitMinor:grossProfit,platformFeeMinor:savedFee,netProfitMinor:savedNet})},
      ]);
      return {userId:trade.userId,offerId:trade.offerId,tradeId:trade.id,currency:trade.currency,principalMinor:principal,rewardMinor:Math.max(0,accounting.netProfitMinor),grossProfitMinor:grossProfit,platformFeeMinor:savedFee,netProfitMinor:savedNet,outcome:String(trade.settlementOutcome)};
    });
    if(posted){
      credited++;
      try { await updatePopupLifecycleForOffer(posted.userId,posted.offerId,"settled"); }
      catch(error){ console.error("[TradeCreditPosting] popup lifecycle update failed after committed wallet credit",error instanceof Error?error.message:"unknown error"); }
      const notices=buildTradeSettlementNotices({
        tradeId:posted.tradeId,currency:posted.currency,principalMinor:posted.principalMinor,
        rewardMinor:posted.rewardMinor,grossProfitMinor:posted.grossProfitMinor,
        platformFeeMinor:posted.platformFeeMinor,netProfitMinor:posted.netProfitMinor,outcome:posted.outcome,
      });
      const notificationResults=await Promise.allSettled(notices.map(notice=>createNotification(posted.userId,notice.title,notice.body,{
        eventKey:notice.eventKey,category:notice.category,priority:notice.priority,
      })));
      if(notificationResults.some(result=>result.status==="rejected")) console.error("[Notifications] One or more trade settlement notices failed after wallet credit commit.");
    } else skipped++;
  }
  return {scanned:due.length,credited,skipped,limit,asOf:now.toISOString()};
}

export async function createOpportunityOffer(input:{symbol:string;venueFrom:string;venueTo:string;currency:"USD"|"EUR"|"GBP"|"BTC"|"ETH";minimumMinor:number;expectedRewardBps:number;durationSeconds:number}){const db=await getDb();if(!db)throw new Error("Database is not available");const now=new Date();const closesAt=new Date(now.getTime()+input.durationSeconds*1000);const result=await db.insert(opportunityOffers).values({...input,opensAt:now,closesAt,rewardAt:closesAt,status:"open"});return {id:Number(result[0].insertId),...input,opensAt:now,closesAt,rewardAt:closesAt};}

export async function bulkCreateOpportunityOffers(inputs:{symbol:string;venueFrom:string;venueTo:string;currency:"USD"|"EUR"|"GBP"|"BTC"|"ETH";minimumMinor:number;expectedRewardBps:number;durationSeconds:number;opensAt?:Date;closesAt?:Date;rewardAt?:Date}[]) { const db=await getDb(); if(!db) throw new Error("Database is not available"); if(!inputs.length) return {created:0}; const rows=inputs.map(input=>{const opensAt=input.opensAt||new Date(); const closesAt=input.closesAt||new Date(opensAt.getTime()+input.durationSeconds*1000); return {...input,opensAt,closesAt,rewardAt:input.rewardAt||closesAt,status:"open" as const};}); await db.insert(opportunityOffers).values(rows); return {created:rows.length}; }


export async function listAdminRecentLedgerActivity(limit = 150) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  return db.select({
    id: balanceLedger.id,
    userId: balanceLedger.userId,
    customerName: users.name,
    customerEmail: users.email,
    currency: balanceLedger.currency,
    amountMinor: balanceLedger.amountMinor,
    entryType: balanceLedger.entryType,
    withdrawable: balanceLedger.withdrawable,
    createdAt: balanceLedger.createdAt,
  }).from(balanceLedger)
    .leftJoin(users, eq(users.id, balanceLedger.userId))
    .orderBy(desc(balanceLedger.createdAt))
    .limit(safeLimit);
}
