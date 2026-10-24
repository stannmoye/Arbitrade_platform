import crypto from "node:crypto";
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { InsertUser, appSettings, authEmailTokens, customerBalances, customerEmailPreferences, customerNotifications, customerPackageSubscriptions, packages, customerSessions, customerTotpAuthenticators, customerWalletPreferences, currencyRegistry, customerControls, emailOutbox, kycProfiles, payoutRequests, notificationCampaigns, notificationCampaignDeliveries, customerOpportunityRules, opportunityDeliveryEvents, opportunityOffers, opportunityPackagePolicies, opportunityPopupEvents, balanceLedger, stakePositions, tradePositions, tradeRewardReservations, tradeSettlementReferenceClaims, tradeLifecycleEvents, users, v5AuditEvents, v5Wallets, missedOpportunities } from "../drizzle/schema";
import { ENV } from './_core/env';
import { consumeTotpRecoveryCode, decryptTotpSecret, encryptTotpSecret, generateTotpRecoveryCodes, generateTotpSecret, hashTotpRecoveryCode, totpProvisioningUri, verifyTotpCode } from "./modules/totp";
import { calculateTradeSettlement } from "./modules/trade-settlement";
import { calculateRealizedProfitSettlement, type FeeRoundingMode } from "./modules/realized-profit-accounting";
import { addCalendarMonths, calculateQualifyingBalanceUsdMinor, parsePackageQualificationPolicy, type PackageQualificationPolicy, type EligibleWalletBalance } from "./modules/trading-package-activation";
import { ensurePopupDeliveries, updatePopupLifecycleForOffer } from "./opportunityLifecycle";
import { assertTradeAmountWithinBounds, chooseSecureTradeAmount } from "./modules/package-trade-allocation";
import { fetchCryptoRates, fetchFiatRates, fetchMostActiveStocks } from "./marketProviders";
import { nativeMinorToUsd, usdUnitsToNativeMinor } from "../shared/money";
import { validatePackageAutomationPolicy, remainingRewardAllowance } from "./modules/advanced-auto-trading";
import { isWithinDailyAllocationLimit } from "./modules/daily-allocation";
import { normalizeTicketUploadPolicy } from "./modules/ticket-upload-policy";
import { isAllowedAttachmentRequest, isSupportAttachmentStorageKeyForTicket, isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy";
import { assertNotificationPayloadMatches, buildNotificationEventKey, filterNotificationCategories, filterVisibleNotificationEventCursor, normalizeBroadcastTargetUserId, normalizeNotificationHref, normalizeNotificationText, partitionNotificationRecipients, NOTIFICATION_CATEGORIES, type AdminBroadcastCategory, type NotificationCategory, type NotificationPriority } from "./modules/notification-events";
import { isCustomerOpportunityAllowed, isWithinQuietHours } from "./opportunityEligibility";
import { assertExactlyOneAffectedRow } from "./db-mutation-guards";
import { isCustomerAutoTradeExplicitlyEnabled } from "./modules/customer-auto-trade";
let _db: MySql2Database<Record<string, unknown>> | null = null;

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
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
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
  return rows.filter(row=>isValidSupportAttachmentStorageKey(row.storageKey)).map(({storageKey,...row})=>({...row,url:`/manus-storage/${storageKey}`}));
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
import { opportunityPackagePolicies } from "../drizzle/schema";

// Legacy Starter/Growth/Pro/Institutional defaults are no longer seeded.
// Trading entitlements now come from the canonical package catalogue and subscriptions.
const DEFAULT_OPPORTUNITY_PACKAGE_POLICIES: readonly any[] = [];

export async function provisionSignupCredit(userId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const amount=Number(await getAppSetting("signup.autoCreditMinor"));
  const currency=(await getAppSetting("signup.autoCreditCurrency")) || "USD";
  if(!Number.isFinite(amount) || amount<=0) return;
  const existing=await db.select().from(balanceLedger).where(and(eq(balanceLedger.userId,userId),eq(balanceLedger.entryType,"signup_credit"))).limit(1);
  // Retry the notice on repeated provisioning calls if the ledger write succeeded
  // but notification persistence failed on the first attempt. The stable event key
  // makes this safe when the notification already exists.
  const notifySignupCredit=async(creditedAmount:number,creditedCurrency:string)=>{
    try {
      await createNotification(userId,"Signup credit added",`A signup credit of ${creditedAmount} minor units was added to your ${creditedCurrency} wallet. This credit is not withdrawable.`,{
        eventKey:`signup-credit:${userId}`,category:"ledger_credit",priority:"normal",
      });
    } catch(error) {
      console.error("[Notifications] Signup credit notice failed after ledger persistence:",error instanceof Error?error.name:"UnknownError");
    }
  };
  if(existing[0]) {
    await notifySignupCredit(Number(existing[0].amountMinor),String(existing[0].currency));
    return;
  }
  const balance=(await db.select().from(customerBalances).where(and(eq(customerBalances.userId,userId),eq(customerBalances.currency,currency))).limit(1))[0];
  if(balance) await db.update(customerBalances).set({availableMinor:balance.availableMinor+amount,promotionalMinor:balance.promotionalMinor+amount}).where(eq(customerBalances.id,balance.id));
  else await db.insert(customerBalances).values({userId,currency,availableMinor:amount,promotionalMinor:amount,earnedMinor:0});
  await db.insert(balanceLedger).values({userId,currency,amountMinor:amount,entryType:"signup_credit",reference:`signup-${userId}`,withdrawable:false});
  await notifySignupCredit(amount,currency);
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

export async function ensureCustomerControls(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");let row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];if(!row){await db.insert(customerControls).values({userId,autoTradeEnabled:false,autoTradeMode:"disabled",autoTradeMinRewardBps:0});row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];}return row;}
export async function getCustomerAutoTradeSettings(userId:number){const c=await ensureCustomerControls(userId);const autoTradeEnabled=isCustomerAutoTradeExplicitlyEnabled(c.autoTradeMode);return {autoTradeEnabled,autoTradeMode:c.autoTradeMode,autoTradeMinRewardBps:c.autoTradeMinRewardBps,tradingEnabled:c.tradingEnabled,opportunitiesEnabled:c.opportunitiesEnabled,accountStatus:c.accountStatus};}
export async function listAdminCustomers(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({id:users.id,name:users.name,email:users.email,packageName:users.packageName,role:users.role,createdAt:users.createdAt}).from(users).orderBy(desc(users.createdAt));
  const controls=await db.select().from(customerControls); const byUser=new Map(controls.map(row=>[row.userId,row]));
  return rows.filter(row=>row.role!=="admin").map(row=>{const c=byUser.get(row.id); const autoTradeMode=c?.autoTradeMode||"disabled"; const autoTradeEffectiveEnabled=isCustomerAutoTradeExplicitlyEnabled(autoTradeMode); return {id:row.id,name:row.name||row.email||"Customer",email:row.email||"",package:row.packageName,group:row.packageName,status:c?.accountStatus||"active",accountState:c?.accountStatus||"active",opportunities:"Database delivery",opportunitiesEnabled:c?.opportunitiesEnabled??true,autoTradeMode,autoTradeEnabled:autoTradeEffectiveEnabled,autoTradeEffectiveEnabled,kyc:c?.kycRequired??true,withdrawals:c?.withdrawalsEnabled??false,twofa:c?.twoFactorRequired??false,facial:false,tradingEnabled:c?.tradingEnabled??true,emailVerified:c?.emailVerified??false,riskTier:c?.riskTier||"standard",adminNote:c?.adminNote||"",createdAt:row.createdAt};});
}
export async function createAdminCustomer(input:{name:string;email:string;password:string;packageName:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();if(!(await listOpportunityPackagePolicies()).some(p=>p.packageName===input.packageName&&p.enabled))throw new Error("Package is not configured or enabled");if(input.password.length<10)throw new Error("Customer password must be at least 10 characters");const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing)throw new Error("A customer with this email already exists");const salt=crypto.randomBytes(16).toString("hex");const digest=crypto.scryptSync(input.password,salt,32).toString("hex");const result=await db.insert(users).values({openId:`local:customer:${crypto.randomUUID()}`,name:input.name.trim(),email,loginMethod:"password",role:"user",passwordHash:`scrypt$${salt}$${digest}`,packageName:input.packageName});const id=Number(result[0].insertId);await db.insert(customerControls).values({userId:id});return {id,email,name:input.name.trim(),packageName:input.packageName};}
export async function updateAdminCustomer(input:{id:number;name:string;email:string;packageName:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();if(!(await listOpportunityPackagePolicies()).some(p=>p.packageName===input.packageName&&p.enabled))throw new Error("Package is not configured or enabled");const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing&&existing.id!==input.id)throw new Error("That email is already used by another account");await db.update(users).set({name:input.name.trim(),email,packageName:input.packageName}).where(and(eq(users.id,input.id),eq(users.role,"user")));return {success:true};}
export async function updateCustomerControls(adminId:number,input:{userId:number;accountStatus?:"active"|"suspended"|"restricted";tradingEnabled?:boolean;opportunitiesEnabled?:boolean;autoTradeEnabled?:boolean;autoTradeMode?:"enabled"|"disabled";autoTradeMinRewardBps?:number;withdrawalsEnabled?:boolean;kycRequired?:boolean;twoFactorRequired?:boolean;emailVerified?:boolean;riskTier?:string;adminNote?:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const existing=(await db.select().from(customerControls).where(eq(customerControls.userId,input.userId)).limit(1))[0];const values:any={...input};delete values.userId;if(values.autoTradeEnabled!==undefined&&values.autoTradeMode===undefined) values.autoTradeMode=values.autoTradeEnabled?"enabled":"disabled";if(values.autoTradeMode!==undefined) values.autoTradeEnabled=values.autoTradeMode==="enabled";if(existing)await db.update(customerControls).set({...values,updatedBy:adminId}).where(eq(customerControls.userId,input.userId));else await db.insert(customerControls).values({userId:input.userId,updatedBy:adminId,...values});return {success:true};}
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
      accountStatus: "restricted" as const, tradingEnabled: false, opportunitiesEnabled: false,
      autoTradeEnabled: false, autoTradeMode: "disabled" as const, withdrawalsEnabled: false, updatedBy: adminId,
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
export async function adjustCustomerBalance(adminId:number,input:{userId:number;currency:string;amountMinor:number;mode:"credit"|"debit";reason:string}){const db=await getDb();if(!db)throw new Error("Database is not available");if(input.amountMinor<=0)throw new Error("Amount must be positive");const ledgerReference=`admin-${adminId}-${input.userId}-${crypto.randomUUID()}`;const result=await db.transaction(async tx=>{const user=(await tx.select({id:users.id,role:users.role,loginMethod:users.loginMethod}).from(users).where(input.userId===adminId?eq(users.id,input.userId):and(eq(users.id,input.userId),eq(users.role,"user"))).limit(1).for("update"))[0];if(!user)throw new Error("Customer account not found");if(user.role==="user"&&user.loginMethod==="closed")throw new Error("Cannot adjust the wallet of a closed customer account");if(user.role==="admin"&&user.id!==adminId)throw new Error("Administrators may adjust only their own wallet");const currency=(await tx.select().from(currencyRegistry).where(and(eq(currencyRegistry.code,input.currency.toUpperCase()),eq(currencyRegistry.enabled,true))).limit(1))[0];if(!currency)throw new Error(`Currency ${input.currency} is not enabled. Add it in Currency registry first.`);const balance=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1))[0];const current=balance?.availableMinor||0;const next=input.mode==="credit"?current+input.amountMinor:current-input.amountMinor;if(next<0)throw new Error("Debit exceeds available wallet balance");if(balance)await tx.update(customerBalances).set({availableMinor:next,promotionalMinor:input.mode==="credit"?balance.promotionalMinor+input.amountMinor:balance.promotionalMinor}).where(eq(customerBalances.id,balance.id));else await tx.insert(customerBalances).values({userId:input.userId,currency:currency.code,availableMinor:input.amountMinor,promotionalMinor:input.mode==="credit"?input.amountMinor:0,earnedMinor:0});await tx.insert(balanceLedger).values({userId:input.userId,currency:currency.code,amountMinor:input.mode==="credit"?input.amountMinor:-input.amountMinor,entryType:`admin_${input.mode}`,reference:ledgerReference,withdrawable:false});return {success:true,newAvailableMinor:next,currency:currency.code,amountMinor:input.amountMinor,ledgerReference,rateUsd:Number(currency.usdRate),rateUpdatedAt:currency.updatedAt,amountUsd:nativeMinorToUsd(input.amountMinor,Number(currency.scale),Number(currency.usdRate))};}); try { await createNotification(input.userId,`Wallet ${input.mode==="credit"?"credited":"debited"}`,`An administrator ${input.mode}ed ${input.amountMinor} native ledger units to your ${input.currency.toUpperCase()} wallet. Reason: ${input.reason}`,{eventKey:`wallet-adjustment:${result.ledgerReference}`,category:input.mode==="credit"?"ledger_credit":"ledger_debit",priority:"normal"}); } catch(error) { console.error("[Notifications] Wallet adjustment notice failed after ledger commit:",error instanceof Error?error.name:"UnknownError"); } try { const { enqueueWalletAdjustmentEmail } = await import("./emailQueue"); await enqueueWalletAdjustmentEmail(input.userId,input.mode,input.amountMinor,input.currency,`admin-ledger:${adminId}:${input.userId}:${Date.now()}`); } catch(error) { console.error("[Email] Wallet alert enqueue failed:",error instanceof Error?error.name:"UnknownError"); } return result; }
export async function listOpenOffers(){const db=await getDb();if(!db)throw new Error("Database is not available");const now=new Date();return db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt);}
const TRADE_MATH_METHODS = ["session entropy", "amount elasticity", "route volatility", "liquidity depth", "customer risk curve", "rotation index", "weighted ensemble"] as const;
function calculateTradeTerms(userId:number, offer:any, amountMinor:number) {
  const seed=crypto.createHash("sha256").update(`${userId}:${offer.id}:${amountMinor}:${offer.symbol}:${offer.currency}`).digest();
  const unit=(offset:number)=>seed[offset]/255;
  const rotation=(userId+Number(offer.id))%TRADE_MATH_METHODS.length;
  const amountCurve=Math.min(1,Math.sqrt(Math.max(0,amountMinor)/100000));
  const sessionEntropy=unit(0), routeVolatility=unit(1), liquidityDepth=unit(2), customerRisk=unit(3), rotationIndex=unit(4);
  const methodScore=(sessionEntropy*.18)+(amountCurve*.24)+((1-routeVolatility)*.14)+(liquidityDepth*.12)+((1-customerRisk)*.12)+(rotationIndex*.08)+(unit(5)*.12);
  const rewardBps=Math.max(1000,Math.min(3500,1000+Math.floor(methodScore*2500)));
  const minimumMinor=Math.max(Number(offer.minimumMinor||10000),10000+((seed[6]+rotation*7)%26)*1000);
  return { minimumMinor, rewardBps, method:TRADE_MATH_METHODS[rotation], rotation, factors:{sessionEntropy,amountCurve,routeVolatility,liquidityDepth,customerRisk,rotationIndex} };
}
function packageUsdUnitsToNativeMinor(usdUnits:number, currency:string, currencies:any[]):number { const row=currencies.find((item:any)=>item.code===currency); if(!row) throw new Error(`Currency ${currency} is not configured`); return usdUnitsToNativeMinor(usdUnits,Number(row.scale),Number(row.usdRate)); }
const PACKAGE_ACTIVATION_SETTING_KEYS = [
  "trading.packageQualification.eligibleCurrencies",
  "trading.packageQualification.combineEligibleWallets",
  "trading.packagePurchase.repeatAllowed",
  "trading.packagePurchase.maxCopies",
  "trading.packagePurchase.repeatRestriction",
  "trading.packagePurchase.cooldownSeconds",
] as const;

function packageActivationPolicyFromRows(rows: Array<{settingKey:string;settingValue:string}>): PackageQualificationPolicy {
  const values:Record<string,string>={};
  for(const row of rows) values[row.settingKey]=row.settingValue;
  return parsePackageQualificationPolicy(values);
}
async function getPackageActivationPolicyInTransaction(tx:any) {
  const rows=await tx.select({settingKey:appSettings.settingKey,settingValue:appSettings.settingValue})
    .from(appSettings).where(inArray(appSettings.settingKey,[...PACKAGE_ACTIVATION_SETTING_KEYS])).for("update");
  return packageActivationPolicyFromRows(rows);
}
function packageQualificationWalletRows(rows:any[]): EligibleWalletBalance[] {
  return rows.map(row=>({
    currency:String(row.currency),
    availableMinor:Number(row.availableMinor),
    scale:Number(row.scale),
    usdRate:Number(row.usdRate),
  }));
}

export async function getPackageActivationPolicy() {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({settingKey:appSettings.settingKey,settingValue:appSettings.settingValue})
    .from(appSettings).where(inArray(appSettings.settingKey,[...PACKAGE_ACTIVATION_SETTING_KEYS]));
  const policy=packageActivationPolicyFromRows(rows);
  return {...policy,qualifyingBalanceCurrency:"USD"};
}

export async function setPackageActivationPolicy(updatedBy:number,input:{
  eligibleCurrencies:string[];
  combineEligibleWallets:boolean;
  repeatAllowed:boolean;
  maxCopies:number;
  repeatRestriction:"active_only"|"all_history";
  cooldownSeconds:number;
}) {
  const currencies=[...new Set(input.eligibleCurrencies.map(value=>value.trim().toUpperCase()))];
  if(!currencies.length||currencies.some(value=>!/^[A-Z0-9._-]{2,32}$/.test(value))) throw new Error("Select at least one valid eligible wallet currency");
  if(!Number.isSafeInteger(input.maxCopies)||input.maxCopies<0) throw new Error("Maximum package copies must be a non-negative integer");
  if(!Number.isSafeInteger(input.cooldownSeconds)||input.cooldownSeconds<0||input.cooldownSeconds>31536000) throw new Error("Package activation cooldown must be between 0 and 31536000 seconds");
  if(!["active_only","all_history"].includes(input.repeatRestriction)) throw new Error("Invalid package repeat restriction");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const configured=await db.select({code:currencyRegistry.code}).from(currencyRegistry).where(and(inArray(currencyRegistry.code,currencies),eq(currencyRegistry.enabled,true)));
  const configuredCodes=new Set(configured.map(row=>row.code.toUpperCase()));
  const unknown=currencies.filter(code=>!configuredCodes.has(code));
  if(unknown.length) throw new Error("These eligible currencies are not enabled: "+unknown.join(", "));
  const values:Record<string,string>={
    "trading.packageQualification.eligibleCurrencies":JSON.stringify(currencies),
    "trading.packageQualification.combineEligibleWallets":String(input.combineEligibleWallets),
    "trading.packagePurchase.repeatAllowed":String(input.repeatAllowed),
    "trading.packagePurchase.maxCopies":String(input.maxCopies),
    "trading.packagePurchase.repeatRestriction":input.repeatRestriction,
    "trading.packagePurchase.cooldownSeconds":String(input.cooldownSeconds),
  };
  return db.transaction(async tx=>{
    const current=await tx.select({settingKey:appSettings.settingKey,settingValue:appSettings.settingValue})
      .from(appSettings).where(inArray(appSettings.settingKey,[...PACKAGE_ACTIVATION_SETTING_KEYS])).for("update");
    const previous:Record<string,string>={};
    for(const row of current) previous[row.settingKey]=row.settingValue;
    for(const [settingKey,settingValue] of Object.entries(values)){
      if(Object.prototype.hasOwnProperty.call(previous,settingKey)){
        await tx.update(appSettings).set({settingValue,updatedBy,updatedAt:new Date()}).where(eq(appSettings.settingKey,settingKey));
      }else{
        await tx.insert(appSettings).values({settingKey,settingValue,updatedBy});
      }
    }
    await tx.insert(v5AuditEvents).values({
      actorUserId:updatedBy,action:"trading_package_activation_policy_updated",
      entityType:"trading_package_activation_policy",entityId:"global",
      reason:"Administrator updated package qualification and repeat-activation policy.",
      reference:"trading-package-activation-policy:"+crypto.randomUUID(),
      metadataJson:JSON.stringify({old:previous,new:values}),
    });
    return {...parsePackageQualificationPolicy(values),qualifyingBalanceCurrency:"USD"};
  });
}

export async function listAdminTradingPackages() {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.select().from(packages).orderBy(packages.minimumQualifyingBalanceUsdMinor,packages.id);
}
export async function updateAdminTradingPackage(updatedBy:number,input:{
  id:number; name:string; minimumQualifyingBalanceUsdMinor:number; durationMonths:number;
  opportunitiesPerDay:number; enabled:boolean;
}) {
  if(!Number.isSafeInteger(input.id)||input.id<=0) throw new Error("Package ID is invalid");
  if(!input.name.trim()||input.name.trim().length>80) throw new Error("Package name must contain 1–80 characters");
  if(!Number.isSafeInteger(input.minimumQualifyingBalanceUsdMinor)||input.minimumQualifyingBalanceUsdMinor<=0) throw new Error("Minimum qualifying balance must be a positive USD minor-unit integer");
  if(!Number.isSafeInteger(input.durationMonths)||input.durationMonths<1||input.durationMonths>1200) throw new Error("Package duration must be 1–1200 calendar months");
  if(!Number.isSafeInteger(input.opportunitiesPerDay)||input.opportunitiesPerDay<1||input.opportunitiesPerDay>10000) throw new Error("Daily opportunity quota must be between 1 and 10000");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.transaction(async tx=>{
    const current=(await tx.select().from(packages).where(eq(packages.id,input.id)).limit(1).for("update"))[0];
    if(!current) throw new Error("Trading package not found");
    const conflicting=(await tx.select({id:packages.id}).from(packages).where(eq(packages.name,input.name.trim())).limit(1))[0];
    if(conflicting&&conflicting.id!==input.id) throw new Error("A package with this name already exists");
    const nextVersion=Number(current.termsVersion||1)+1;
    if(!Number.isSafeInteger(nextVersion)) throw new Error("Package terms version has reached its limit");
    await tx.update(packages).set({
      name:input.name.trim(),
      minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,
      durationMonths:input.durationMonths,
      opportunitiesPerDay:input.opportunitiesPerDay,
      enabled:input.enabled,
      termsVersion:nextVersion,
    }).where(eq(packages.id,input.id));
    await tx.insert(v5AuditEvents).values({
      actorUserId:updatedBy,action:"trading_package_terms_updated",
      entityType:"trading_package",entityId:String(input.id),
      reason:"Administrator updated package terms. Existing subscription snapshots remain unchanged.",
      reference:"trading-package-terms:"+input.id+":"+nextVersion,
      metadataJson:JSON.stringify({old:{name:current.name,minimumQualifyingBalanceUsdMinor:Number(current.minimumQualifyingBalanceUsdMinor),durationMonths:current.durationMonths,opportunitiesPerDay:current.opportunitiesPerDay,enabled:current.enabled,termsVersion:current.termsVersion},new:{...input,name:input.name.trim(),termsVersion:nextVersion}}),
    });
    return {id:input.id,name:input.name.trim(),minimumQualifyingBalanceUsdMinor:input.minimumQualifyingBalanceUsdMinor,durationMonths:input.durationMonths,opportunitiesPerDay:input.opportunitiesPerDay,enabled:input.enabled,termsVersion:nextVersion};
  });
}

export async function listCustomerTradingPackages(userId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  await db.update(customerPackageSubscriptions).set({status:"expired"}).where(and(
    eq(customerPackageSubscriptions.userId,userId),eq(customerPackageSubscriptions.status,"active"),
    isNotNull(customerPackageSubscriptions.expiresAt),lte(customerPackageSubscriptions.expiresAt,now),
  ));
  const settingRows=await db.select({settingKey:appSettings.settingKey,settingValue:appSettings.settingValue})
    .from(appSettings).where(inArray(appSettings.settingKey,[...PACKAGE_ACTIVATION_SETTING_KEYS]));
  const policy=packageActivationPolicyFromRows(settingRows);
  const walletRows=await db.select({
    currency:customerBalances.currency,availableMinor:customerBalances.availableMinor,
    scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,
  }).from(customerBalances).innerJoin(currencyRegistry,eq(customerBalances.currency,currencyRegistry.code))
    .where(and(eq(customerBalances.userId,userId),eq(currencyRegistry.enabled,true),inArray(currencyRegistry.code,policy.eligibleCurrencies)));
  const qualifyingBalanceUsdMinor=calculateQualifyingBalanceUsdMinor(packageQualificationWalletRows(walletRows),policy);
  const catalog=await db.select().from(packages).where(and(
    eq(packages.enabled,true),or(isNull(packages.startsAt),lte(packages.startsAt,now)),
    or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
  )).orderBy(packages.minimumQualifyingBalanceUsdMinor,packages.id);
  const owned=await db.select({
    id:customerPackageSubscriptions.id,packageId:customerPackageSubscriptions.packageId,
    packageName:packages.name,status:customerPackageSubscriptions.status,
    activatedAt:customerPackageSubscriptions.activatedAt,startsAt:customerPackageSubscriptions.startsAt,
    expiresAt:customerPackageSubscriptions.expiresAt,termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson,
  }).from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(eq(customerPackageSubscriptions.userId,userId)).orderBy(desc(customerPackageSubscriptions.activatedAt));
  const latestActivation=owned.reduce<Date|null>((latest,row)=>{
    const activated=row.activatedAt?new Date(row.activatedAt):null;
    return activated&&(!latest||activated>latest)?activated:latest;
  },null);
  const cooldownEndsAt=latestActivation?new Date(latestActivation.getTime()+policy.cooldownSeconds*1000):null;
  const cooldownRemainingSeconds=cooldownEndsAt&&cooldownEndsAt>now?Math.ceil((cooldownEndsAt.getTime()-now.getTime())/1000):0;
  const subscriptions=owned.filter(row=>row.status==="active"&&(!row.expiresAt||new Date(row.expiresAt)>now));
  return {
    qualifyingBalanceUsdMinor,qualifyingCurrencies:policy.eligibleCurrencies,
    combineEligibleWallets:policy.combineEligibleWallets,repeatAllowed:policy.repeatAllowed,
    maxCopies:policy.maxCopies,repeatRestriction:policy.repeatRestriction,
    cooldownSeconds:policy.cooldownSeconds,cooldownRemainingSeconds,
    subscriptions,
    packages:catalog.map(pkg=>{
      const history=owned.filter(row=>row.packageId===pkg.id);
      const ownership=policy.repeatRestriction==="all_history"?history:history.filter(row=>row.status==="active"&&(!row.expiresAt||new Date(row.expiresAt)>now));
      const activeOwnership=history.filter(row=>row.status==="active"&&(!row.expiresAt||new Date(row.expiresAt)>now));
      const copyLimitReached=policy.maxCopies>0&&ownership.length>=policy.maxCopies;
      const duplicateBlocked=!policy.repeatAllowed&&ownership.length>0;
      const insufficient=qualifyingBalanceUsdMinor<Number(pkg.minimumQualifyingBalanceUsdMinor);
      const cooling=cooldownRemainingSeconds>0;
      const blockReason=insufficient?"insufficient_balance":duplicateBlocked?"same_package_owned":copyLimitReached?"max_copies_reached":cooling?"activation_cooldown":null;
      return {
        id:pkg.id,name:pkg.name,minimumQualifyingBalanceUsdMinor:Number(pkg.minimumQualifyingBalanceUsdMinor),
        durationMonths:pkg.durationMonths,opportunitiesPerDay:pkg.opportunitiesPerDay,
        termsVersion:pkg.termsVersion,enabled:pkg.enabled,qualifyingBalanceUsdMinor,
        shortfallUsdMinor:Math.max(0,Number(pkg.minimumQualifyingBalanceUsdMinor)-qualifyingBalanceUsdMinor),
        canActivate:!blockReason,blockReason,activeCopies:activeOwnership.length,
      };
    }),
  };
}

export async function activateCustomerTradingPackage(userId:number,input:{packageId:number;idempotencyKey:string}) {
  if(!Number.isSafeInteger(input.packageId)||input.packageId<=0) throw new Error("Trading package is invalid");
  const idempotencyKey=input.idempotencyKey.trim();
  if(idempotencyKey.length<8||idempotencyKey.length>128) throw new Error("Package activation key must contain 8–128 characters");
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const result=await db.transaction(async tx=>{
    const lockedUsers=await tx.execute(sql`SELECT id,role,loginMethod FROM users WHERE id=${userId} FOR UPDATE`) as any;
    const user=lockedUsers?.[0]?.[0];
    if(!user||user.role!=="user"||user.loginMethod==="closed") throw new Error("Customer account is missing or closed");
    const replay=(await tx.select().from(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.activationKey,idempotencyKey)).limit(1).for("update"))[0];
    if(replay){
      if(Number(replay.userId)!==userId) throw new Error("Package activation key has already been used");
      return {subscriptionId:Number(replay.id),packageId:Number(replay.packageId),activatedAt:replay.activatedAt,expiresAt:replay.expiresAt,qualifyingBalanceUsdMinor:Number(replay.qualifyingBalanceUsdMinor),termsSnapshotJson:replay.termsSnapshotJson,replayed:true,packageName:null as string|null};
    }
    const policy=await getPackageActivationPolicyInTransaction(tx);
    const now=new Date();
    const pkg=(await tx.select().from(packages).where(and(
      eq(packages.id,input.packageId),eq(packages.enabled,true),
      or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)),
    )).limit(1).for("update"))[0];
    if(!pkg) throw new Error("Trading package is unavailable");
    const walletRows=await tx.select({
      currency:customerBalances.currency,availableMinor:customerBalances.availableMinor,
      scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,
    }).from(customerBalances).innerJoin(currencyRegistry,eq(customerBalances.currency,currencyRegistry.code))
      .where(and(eq(customerBalances.userId,userId),eq(currencyRegistry.enabled,true),inArray(currencyRegistry.code,policy.eligibleCurrencies))).for("update");
    const qualifyingBalanceUsdMinor=calculateQualifyingBalanceUsdMinor(packageQualificationWalletRows(walletRows),policy);
    if(qualifyingBalanceUsdMinor<Number(pkg.minimumQualifyingBalanceUsdMinor)){
      throw new Error("Your available balance is not sufficient to activate this package. Minimum qualifying balance: USD "+(Number(pkg.minimumQualifyingBalanceUsdMinor)/100).toFixed(2)+".");
    }
    const ownershipRows=await tx.select().from(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId,userId)).for("update");
    const priorForPackage=ownershipRows.filter(row=>Number(row.packageId)===Number(pkg.id));
    const countedOwnership=policy.repeatRestriction==="all_history"
      ? priorForPackage
      : priorForPackage.filter(row=>row.status==="active"&&(!row.expiresAt||new Date(row.expiresAt)>now));
    if(!policy.repeatAllowed&&countedOwnership.length>0) throw new Error("This package cannot be activated again under the current repeat-purchase policy");
    if(policy.maxCopies>0&&countedOwnership.length>=policy.maxCopies) throw new Error("The maximum number of copies of this package has been reached");
    const latestActivation=ownershipRows.reduce<Date|null>((latest,row)=>{
      const activated=row.activatedAt?new Date(row.activatedAt):null;
      return activated&&(!latest||activated>latest)?activated:latest;
    },null);
    if(latestActivation&&now.getTime()-latestActivation.getTime()<policy.cooldownSeconds*1000){
      const remaining=Math.ceil((policy.cooldownSeconds*1000-(now.getTime()-latestActivation.getTime()))/1000);
      throw new Error("Package activation cooldown is active for another "+remaining+" seconds");
    }
    const expiresAt=addCalendarMonths(now,Number(pkg.durationMonths));
    const snapshot={
      packageId:Number(pkg.id),packageName:pkg.name,
      minimumQualifyingBalanceUsdMinor:Number(pkg.minimumQualifyingBalanceUsdMinor),
      durationMonths:Number(pkg.durationMonths),opportunitiesPerDay:Number(pkg.opportunitiesPerDay),
      termsVersion:Number(pkg.termsVersion),activatedAt:now.toISOString(),
      qualification:{eligibleCurrencies:policy.eligibleCurrencies,combineEligibleWallets:policy.combineEligibleWallets,qualifyingBalanceUsdMinor},
      repeatPolicy:{repeatAllowed:policy.repeatAllowed,maxCopies:policy.maxCopies,repeatRestriction:policy.repeatRestriction,cooldownSeconds:policy.cooldownSeconds},
    };
    const inserted=await tx.insert(customerPackageSubscriptions).values({
      userId,packageId:pkg.id,startsAt:now,expiresAt,status:"active",activationKey:idempotencyKey,
      termsSnapshotJson:JSON.stringify(snapshot),qualifyingBalanceUsdMinor,
      packageTermsVersion:Number(pkg.termsVersion),activatedAt:now,createdAt:now,
    });
    const subscriptionId=Number(inserted[0].insertId);
    await tx.update(users).set({packageName:pkg.name}).where(eq(users.id,userId));
    await tx.insert(v5AuditEvents).values({
      actorUserId:userId,action:"trading_package_activated",
      entityType:"customer_package_subscription",entityId:String(subscriptionId),
      reason:"Free trading package activated after qualifying-wallet-balance validation.",
      reference:"trading-package-activation:"+idempotencyKey,
      metadataJson:JSON.stringify({subscriptionId,userId,packageId:Number(pkg.id),packageName:pkg.name,qualifyingBalanceUsdMinor,minimumQualifyingBalanceUsdMinor:Number(pkg.minimumQualifyingBalanceUsdMinor),termsVersion:Number(pkg.termsVersion),expiresAt:expiresAt.toISOString()}),
    });
    return {subscriptionId,packageId:Number(pkg.id),packageName:pkg.name,activatedAt:now,expiresAt,qualifyingBalanceUsdMinor,termsSnapshotJson:JSON.stringify(snapshot),replayed:false};
  });
  let immediateCycle:any=null;
  if(!result.replayed){
    try { immediateCycle=await listCustomerOpportunities(userId,{consumeDelivery:false}); }
    catch(error) { console.error("[AutoTrade] Immediate post-activation cycle failed:",error instanceof Error?error.message:"UnknownError"); }
  }
  return {
    ...result,
    packageName:result.packageName??String((await db.select({name:packages.name}).from(packages).where(eq(packages.id,result.packageId)).limit(1))[0]?.name||""),
    immediateCycle:immediateCycle?{autoTrades:immediateCycle.autoTrades||[],missed:immediateCycle.missed||[]}:null,
  };
}

export async function listOpportunityPackagePolicies() { const db=await getDb(); if(!db) throw new Error("Database is not available"); const existing=await db.select().from(opportunityPackagePolicies); const names=new Set(existing.map(row=>row.packageName)); for(const policy of DEFAULT_OPPORTUNITY_PACKAGE_POLICIES) if(!names.has(policy.packageName)) await db.insert(opportunityPackagePolicies).values(policy); return db.select().from(opportunityPackagePolicies); }
export async function updateOpportunityPackagePolicies(updatedBy:number, policies:any[]) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  for (const policy of policies) {
    if(policy.minHourlyTarget>policy.normalHourlyTarget) throw new Error(`Minimum hourly target cannot exceed normal target for ${policy.packageName}`);
    if(policy.normalHourlyTarget*24>policy.maxPopupsPerDay && policy.maxPopupsPerDay>0) throw new Error(`Normal hourly target exceeds daily quota for ${policy.packageName}`);
    if(!Number.isSafeInteger(policy.minimumTradeUnits)||!Number.isSafeInteger(policy.maximumTradeUnits)||policy.minimumTradeUnits<1||policy.maximumTradeUnits<policy.minimumTradeUnits) throw new Error(`Trade amount bounds are invalid for ${policy.packageName}`);
    const automation={packageName:policy.packageName,automaticDelivery:policy.automaticDelivery??true,dailyPopupTarget:policy.dailyPopupTarget??policy.maxPopupsPerDay,schedulingPeriod:policy.schedulingPeriod??"rolling_24h",minIntervalSeconds:policy.minIntervalSeconds??45,maxIntervalSeconds:policy.maxIntervalSeconds??3600,randomizationEnabled:policy.randomizationEnabled??true,popupDisplayTargetSeconds:policy.popupDisplayTargetSeconds??120,completionDisplaySeconds:policy.completionDisplaySeconds??8,postCompletionIntervalSeconds:policy.postCompletionIntervalSeconds??30,maxPendingDeliveries:policy.maxPendingDeliveries??3,maxDeliveryAttempts:policy.maxDeliveryAttempts??3,automaticTradingEnabled:policy.automaticTradingEnabled??true,maxTradeAttemptsPerDay:policy.maxTradeAttemptsPerDay??5,maxSuccessfulTradesPerDay:policy.maxSuccessfulTradesPerDay??5,maxConcurrentActiveTrades:policy.maxConcurrentActiveTrades??1,requirePreviousSettlement:policy.requirePreviousSettlement??true,minSettlementDelaySeconds:policy.minSettlementDelaySeconds??900,maxSettlementDelaySeconds:policy.maxSettlementDelaySeconds??900,minimumRewardBps:policy.minimumRewardBps??0,maxDailyRewardMinor:policy.maxDailyRewardMinor??0,maxRewardPerTradeMinor:policy.maxRewardPerTradeMinor??0,closePolicy:policy.closePolicy??"after_final_display"};
    validatePackageAutomationPolicy(automation);
    const values:any={...policy,...automation,updatedBy};
    delete values.id; delete values.updatedAt;
    await db.insert(opportunityPackagePolicies).values(values).onDuplicateKeyUpdate({set:values});
  }
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
async function markOpportunityExecuted(userId:number,offerId:number){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  await db.update(missedOpportunities).set({status:"EXECUTED",updatedAt:new Date()})
    .where(and(eq(missedOpportunities.userId,userId),eq(missedOpportunities.offerId,offerId)));
}
async function autoTradeOpenOpportunities(userId:number,offers:any[],controls:any){
  const executed:any[]=[];
  if(controls.accountStatus!=="active") return {executed,missed:await listMissedOpportunities(userId)};
  const existingTrades:any[]=await listTrades(userId);
  const existingMisses=await listMissedOpportunities(userId);
  const missedOfferIds=new Set(existingMisses.map((row:any)=>Number(row.offerId)));
  for(const offer of offers){
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
    try{
      const result=await createTrade(userId,{
        offerId:offer.id,amountMinor:requestedAmount,
        packageSubscriptionId:Number(offer.packageSubscriptionId||0)||undefined,
      });
      await markOpportunityExecuted(userId,offer.id);
      executed.push({...result,offerId:offer.id,symbol:offer.symbol,amountMinor:requestedAmount,rewardBps:terms.rewardBps,calculationMethod:terms.method});
      existingTrades.push({offerId:offer.id,confirmedAt:new Date()});
      break;
    }catch(error){
      if(error instanceof Error&&/already been allocated|duplicate/i.test(error.message)) continue;
      await markMissedOpportunity(userId,offer,requestedAmount,error instanceof Error?error.message:"AUTO_TRADE_REJECTED");
      missedOfferIds.add(Number(offer.id));
    }
  }
  return {executed,missed:await listMissedOpportunities(userId)};
}
export async function listCustomerOpportunities(userId:number, options:{consumeDelivery?:boolean}={}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const quotaDay=now.toISOString().slice(0,10);
  const settled:Array<{tradeId:number;rewardMinor:number;currency:string;totalMinor:number}>=[];
  await markDueTradesAwaitingConfirmation(userId);
  const controls=await ensureCustomerControls(userId);
  const emptyResult=async (delivery:any)=>({offers:[],missed:await listMissedOpportunities(userId),autoTrades:[],settled,delivery});
  if(controls.accountStatus!=="active") return emptyResult({packageName:"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,accountInactive:true,popupPolicy:{}});
  const subscriptions=await db.select({
    subscriptionId:customerPackageSubscriptions.id,packageId:packages.id,packageName:packages.name,
    packageQuota:packages.opportunitiesPerDay,termsVersion:packages.termsVersion,termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson,
    expiresAt:customerPackageSubscriptions.expiresAt,startsAt:customerPackageSubscriptions.startsAt,
  }).from(customerPackageSubscriptions).innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))
    .where(and(eq(customerPackageSubscriptions.userId,userId),eq(customerPackageSubscriptions.status,"active"),
      lte(customerPackageSubscriptions.startsAt,now),or(isNull(customerPackageSubscriptions.expiresAt),gt(customerPackageSubscriptions.expiresAt,now)),
      eq(packages.enabled,true),or(isNull(packages.startsAt),lte(packages.startsAt,now)),
      or(isNull(packages.expiresAt),gt(packages.expiresAt,now)))).orderBy(customerPackageSubscriptions.expiresAt);
  if(!subscriptions.length) return emptyResult({packageName:"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,noPackage:true,popupPolicy:{}});
  const packagePolicies=await listOpportunityPackagePolicies();
  const policyByName=new Map<string,typeof packagePolicies[number]>();
  for(const policyRow of packagePolicies) policyByName.set(policyRow.packageName,policyRow);
  const eligibleSubscriptions=subscriptions.filter(subscription=>{
    const configured=policyByName.get(subscription.packageName);
    return !configured||(Boolean(configured.enabled)&&configured.automaticDelivery!==false);
  });
  if(!eligibleSubscriptions.length) return emptyResult({packageName:subscriptions.map(row=>row.packageName).join(", "),maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,packageDeliveryDisabled:true,popupPolicy:{}});
  const quotaFor=(subscription:any)=>{
    try { const snapshot=JSON.parse(String(subscription.termsSnapshotJson||"{}")); const value=Number(snapshot.opportunitiesPerDay??subscription.packageQuota); return Number.isSafeInteger(value)&&value>0?value:0; }
    catch { const value=Number(subscription.packageQuota); return Number.isSafeInteger(value)&&value>0?value:0; }
  };
  const quotaByPackage=new Map<string,number>();
  for(const subscription of eligibleSubscriptions) quotaByPackage.set(subscription.packageName,(quotaByPackage.get(subscription.packageName)||0)+quotaFor(subscription));
  const combinedQuota=[...quotaByPackage.values()].reduce((sum,value)=>sum+value,0);
  if(combinedQuota<=0) return emptyResult({packageName:eligibleSubscriptions.map(row=>row.packageName).join(", "),maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,packageQuotaExhausted:true,popupPolicy:{}});
  const currencyRows=await listCurrencies();
  const configuredPolicies=eligibleSubscriptions.map(subscription=>policyByName.get(subscription.packageName)).filter((row:any)=>row&&row.enabled&&row.automaticDelivery!==false);
  const policy=configuredPolicies[0]||null;
  const packageName=[...new Set(eligibleSubscriptions.map(row=>row.packageName))].join(", ");
  const adminDeliveryCap=eligibleSubscriptions.reduce((sum,subscription)=>{const row=policyByName.get(subscription.packageName);return sum+(row?Math.max(0,Number(row.maxPopupsPerDay)||0):quotaFor(subscription));},0);
  const adminVisibleCap=eligibleSubscriptions.reduce((sum,subscription)=>{const row=policyByName.get(subscription.packageName);return sum+(row?Math.max(0,Number(row.maxVisibleOffers)||0):quotaFor(subscription));},0);
  const maxPopupsPerDay=Math.min(combinedQuota,adminDeliveryCap||combinedQuota);
  const maxVisibleOffers=Math.min(combinedQuota,adminVisibleCap||combinedQuota);
  const drainMode=(await getAppSetting("opportunity.drainMode"))==="true";
  const popupPolicy={
    popupMinGapSeconds:Math.max(0,Number(policy?.minIntervalSeconds||0)),
    popupDisplaySeconds:Math.max(1,Number(policy?.popupDisplayTargetSeconds||120)),
    popupMaxPerHour:maxPopupsPerDay,
    popupPreAlertProbabilityBps:0,popupPreAlertSeconds:0,popupWithdrawalProbabilityBps:0,
    popupJitterSeconds:Math.max(0,Number(policy?.maxIntervalSeconds||0)-Number(policy?.minIntervalSeconds||0)),
  };
  const offerRows=await db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt).limit(5000);
  const tradeHistory=await listTrades(userId);
  const tradeOfferIds=new Set(tradeHistory.map((row:any)=>Number(row.offerId)));
  const missedHistory=await listMissedOpportunities(userId);
  const missedOfferIds=new Set(missedHistory.map((row:any)=>Number(row.offerId)));
  const deliveredToday=await db.select({offerId:opportunityDeliveryEvents.offerId}).from(opportunityDeliveryEvents).where(and(eq(opportunityDeliveryEvents.userId,userId),eq(opportunityDeliveryEvents.quotaDay,quotaDay)));
  const deliveredOfferIds=new Set(deliveredToday.map(row=>Number(row.offerId)));
  const usedPackageRows=await db.select({packageName:opportunityPopupEvents.packageName}).from(opportunityPopupEvents).where(and(eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.quotaDay,quotaDay)));
  const usedByPackage=new Map<string,number>();
  for(const row of usedPackageRows) usedByPackage.set(row.packageName,(usedByPackage.get(row.packageName)||0)+1);
  const activePopupRows=await db.select({
    eventId:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,packageName:opportunityPopupEvents.packageName,
    symbol:opportunityPopupEvents.symbol,currency:opportunityPopupEvents.currency,popupMinimumMinor:opportunityPopupEvents.minimumMinor,
    expectedRewardBps:opportunityPopupEvents.expectedRewardBps,balanceAvailableMinor:opportunityPopupEvents.balanceAvailableMinor,
    balanceStatus:opportunityPopupEvents.balanceStatus,eventStatus:opportunityPopupEvents.eventStatus,quotaDay:opportunityPopupEvents.quotaDay,
    deliveredAt:opportunityPopupEvents.deliveredAt,venueFrom:opportunityOffers.venueFrom,venueTo:opportunityOffers.venueTo,
    offerStatus:opportunityOffers.status,offerMinimumMinor:opportunityOffers.minimumMinor,opensAt:opportunityOffers.opensAt,
    closesAt:opportunityOffers.closesAt,rewardAt:opportunityOffers.rewardAt,durationSeconds:opportunityOffers.durationSeconds,
    marketObservedAt:opportunityOffers.marketObservedAt,marketSnapshotId:opportunityOffers.marketSnapshotId,
    sector:opportunityOffers.sector,industry:opportunityOffers.industry,listingStatus:opportunityOffers.listingStatus,
  }).from(opportunityPopupEvents).leftJoin(opportunityOffers,eq(opportunityPopupEvents.offerId,opportunityOffers.id))
    .where(and(eq(opportunityPopupEvents.userId,userId),notInArray(opportunityPopupEvents.eventStatus,["TRADED","SETTLED","WITHDRAWN"])))
    .orderBy(desc(opportunityPopupEvents.deliveredAt));
  const activePopupOfferIds=new Set(activePopupRows.map(row=>Number(row.offerId)));
  const lastDelivery=Number(policy?.postCompletionIntervalSeconds||0)>0?(await db.select({deliveredAt:opportunityDeliveryEvents.deliveredAt}).from(opportunityDeliveryEvents).where(eq(opportunityDeliveryEvents.userId,userId)).orderBy(desc(opportunityDeliveryEvents.deliveredAt)).limit(1))[0]:undefined;
  const formulaReadyAt=lastDelivery?new Date(new Date(lastDelivery.deliveredAt).getTime()+Number(policy?.postCompletionIntervalSeconds||0)*1000):null;
  const formulaCooling=Boolean(formulaReadyAt&&formulaReadyAt.getTime()>now.getTime());
  const dailyCap=Math.min(maxPopupsPerDay,maxVisibleOffers);
  let remainingQuota=Math.max(0,dailyCap-deliveredToday.length);
  const balancesSnapshot=await listBalances(userId);
  const newlyEligible:any[]=[];
  if(!drainMode&&!formulaCooling&&remainingQuota>0){
    for(const offer of offerRows){
      if(remainingQuota<=0) break;
      const offerId=Number(offer.id);
      if(deliveredOfferIds.has(offerId)||activePopupOfferIds.has(offerId)||tradeOfferIds.has(offerId)||missedOfferIds.has(offerId)) continue;
      const subscription=eligibleSubscriptions.find(item=>(usedByPackage.get(item.packageName)||0)<(quotaByPackage.get(item.packageName)||0));
      if(!subscription) break;
      const configured=policyByName.get(subscription.packageName);
      const currencyRow=currencyRows.find((row:any)=>String(row.code).toUpperCase()===String(offer.currency).toUpperCase());
      if(!currencyRow) continue;
      const configuredMinimum=configured?packageUsdUnitsToNativeMinor(Number(configured.minimumTradeUnits),String(offer.currency),currencyRows):Number(offer.minimumMinor);
      const configuredMaximum=configured?Math.max(configuredMinimum,packageUsdUnitsToNativeMinor(Number(configured.maximumTradeUnits),String(offer.currency),currencyRows)):Number.MAX_SAFE_INTEGER;
      const terms=calculateTradeTerms(userId,offer,Math.max(Number(offer.minimumMinor),configuredMinimum));
      const minimumMinor=Math.max(Number(offer.minimumMinor),Number(terms.minimumMinor||0),configuredMinimum);
      if(!Number.isSafeInteger(minimumMinor)||minimumMinor<=0||minimumMinor>configuredMaximum) continue;
      newlyEligible.push({...offer,packageName:subscription.packageName,packageSubscriptionId:Number(subscription.subscriptionId),
        minimumMinor,packageMinimumTradeMinor:configuredMinimum,packageMaximumTradeMinor:configuredMaximum,
        currencyRateUsd:Number(currencyRow.usdRate||0),currencyRateUpdatedAt:currencyRow.updatedAt||null,
        expectedRewardBps:terms.rewardBps,calculationMethod:terms.method});
      usedByPackage.set(subscription.packageName,(usedByPackage.get(subscription.packageName)||0)+1);
      remainingQuota--;
    }
  }
  if(newlyEligible.length){
    await db.insert(opportunityDeliveryEvents).values(newlyEligible.map(offer=>({userId,offerId:offer.id,quotaDay,policyVersion:Number(policyByName.get(offer.packageName)?.policyVersion||1)}))).onDuplicateKeyUpdate({set:{deliveredAt:new Date()}});
    const lifecycleIds=await ensurePopupDeliveries(newlyEligible.map(offer=>{
      const available=Math.max(0,Number(balancesSnapshot.find((row:any)=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase())?.availableMinor||0));
      return {userId,offerId:offer.id,quotaDay,packageName:offer.packageName,symbol:offer.symbol,currency:offer.currency,minimumMinor:Number(offer.minimumMinor),
        expectedRewardBps:Number(offer.expectedRewardBps),balanceAvailableMinor:available,balanceStatus:available>=Number(offer.minimumMinor)?"sufficient":"insufficient",
        marketObservedAt:offer.marketObservedAt,marketSnapshotJson:JSON.stringify({symbol:offer.symbol,venueFrom:offer.venueFrom,venueTo:offer.venueTo,marketValueUsd:offer.marketValueUsd,sector:offer.sector,industry:offer.industry,listingStatus:offer.listingStatus,observedAt:offer.marketObservedAt})};
    }));
    for(const offer of newlyEligible){offer.deliveryEventId=lifecycleIds.get(userId+":"+offer.id+":"+quotaDay)||null; deliveredOfferIds.add(Number(offer.id));}
  }
  const popupRows=await db.select({
    eventId:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,packageName:opportunityPopupEvents.packageName,
    symbol:opportunityPopupEvents.symbol,currency:opportunityPopupEvents.currency,popupMinimumMinor:opportunityPopupEvents.minimumMinor,
    expectedRewardBps:opportunityPopupEvents.expectedRewardBps,balanceAvailableMinor:opportunityPopupEvents.balanceAvailableMinor,
    balanceStatus:opportunityPopupEvents.balanceStatus,eventStatus:opportunityPopupEvents.eventStatus,quotaDay:opportunityPopupEvents.quotaDay,
    deliveredAt:opportunityPopupEvents.deliveredAt,venueFrom:opportunityOffers.venueFrom,venueTo:opportunityOffers.venueTo,
    offerStatus:opportunityOffers.status,offerMinimumMinor:opportunityOffers.minimumMinor,opensAt:opportunityOffers.opensAt,
    closesAt:opportunityOffers.closesAt,rewardAt:opportunityOffers.rewardAt,durationSeconds:opportunityOffers.durationSeconds,
    marketObservedAt:opportunityOffers.marketObservedAt,marketSnapshotId:opportunityOffers.marketSnapshotId,
    sector:opportunityOffers.sector,industry:opportunityOffers.industry,listingStatus:opportunityOffers.listingStatus,
  }).from(opportunityPopupEvents).leftJoin(opportunityOffers,eq(opportunityPopupEvents.offerId,opportunityOffers.id))
    .where(and(eq(opportunityPopupEvents.userId,userId),notInArray(opportunityPopupEvents.eventStatus,["TRADED","SETTLED","WITHDRAWN"])))
    .orderBy(desc(opportunityPopupEvents.deliveredAt));
  const tradeCandidates=popupRows.filter(row=>row.offerStatus==="open"&&row.closesAt&&new Date(row.closesAt).getTime()>now.getTime()).map(row=>{
    const subscription=eligibleSubscriptions.find(item=>item.packageName===row.packageName)||eligibleSubscriptions[0];
    const configured=policyByName.get(subscription.packageName);
    const currencyRow=currencyRows.find((item:any)=>String(item.code).toUpperCase()===String(row.currency).toUpperCase());
    const offerMinimum=Number(row.offerMinimumMinor??row.popupMinimumMinor);
    const configuredMinimum=configured&&currencyRow?packageUsdUnitsToNativeMinor(Number(configured.minimumTradeUnits),String(row.currency),currencyRows):offerMinimum;
    const configuredMaximum=configured&&currencyRow?Math.max(configuredMinimum,packageUsdUnitsToNativeMinor(Number(configured.maximumTradeUnits),String(row.currency),currencyRows)):Number.MAX_SAFE_INTEGER;
    return {id:Number(row.offerId),offerId:Number(row.offerId),deliveryEventId:Number(row.eventId),packageName:subscription.packageName,packageSubscriptionId:Number(subscription.subscriptionId),
      symbol:row.symbol,venueFrom:row.venueFrom||"",venueTo:row.venueTo||"",currency:row.currency,minimumMinor:Math.max(offerMinimum,Number(row.popupMinimumMinor||0),configuredMinimum),
      packageMinimumTradeMinor:configuredMinimum,packageMaximumTradeMinor:configuredMaximum,expectedRewardBps:Number(row.expectedRewardBps||0),
      opensAt:row.opensAt,closesAt:row.closesAt,rewardAt:row.rewardAt,durationSeconds:Number(row.durationSeconds||0),marketObservedAt:row.marketObservedAt,
      marketSnapshotId:row.marketSnapshotId,sector:row.sector,industry:row.industry,listingStatus:row.listingStatus,popupEligible:["DELIVERED","NOTICED"].includes(row.eventStatus),eventStatus:row.eventStatus};
  });
  const autoTradeCandidates=tradeCandidates.filter(offer=>{const configured=policyByName.get(offer.packageName);return !configured||Boolean(configured.automaticTradingEnabled);});
  const effectiveControls={...controls,autoTradeEnabled:true,tradingEnabled:true,autoTradeMinRewardBps:0};
  const auto=await autoTradeOpenOpportunities(userId,autoTradeCandidates,effectiveControls);
  const executedByOffer=new Map(auto.executed.map((trade:any)=>[Number(trade.offerId),trade]));
  const enrichedOffers=popupRows.map(row=>{
    const base=tradeCandidates.find(offer=>Number(offer.offerId)===Number(row.offerId))||{};
    const executed=executedByOffer.get(Number(row.offerId))||null;
    return {...base,id:Number(row.offerId),offerId:Number(row.offerId),deliveryEventId:Number(row.eventId),packageName:row.packageName,
      symbol:row.symbol,currency:row.currency,minimumMinor:Number(row.popupMinimumMinor),balanceAvailableMinor:Number(row.balanceAvailableMinor),
      balanceStatus:row.balanceStatus,expectedRewardBps:Number(row.expectedRewardBps),eventStatus:row.eventStatus,deliveredAt:row.deliveredAt,
      venueFrom:row.venueFrom||base.venueFrom||"",venueTo:row.venueTo||base.venueTo||"",opensAt:row.opensAt,closesAt:row.closesAt,rewardAt:row.rewardAt,
      durationSeconds:Number(row.durationSeconds||base.durationSeconds||0),marketObservedAt:row.marketObservedAt,sector:row.sector,industry:row.industry,
      listingStatus:row.listingStatus,popupEligible:["DELIVERED","NOTICED"].includes(row.eventStatus),automaticTrade:executed};
  });
  return {offers:enrichedOffers,missed:auto.missed,autoTrades:auto.executed,settled,delivery:{packageName,maxPopupsPerDay:dailyCap,maxVisibleOffers:maxVisibleOffers,drainMode,formulaCooling,formulaReadyAt,nextPopupFormulaDelaySeconds:Number(policy?.postCompletionIntervalSeconds||0),rateProfile:{minHourlyTarget:Number(policy?.minHourlyTarget||0),normalHourlyTarget:Number(policy?.normalHourlyTarget||0),marketInfluenceBps:Number(policy?.marketInfluenceBps||0),burstEnabled:Boolean(policy?.burstEnabled),maxBurstSize:Number(policy?.maxBurstSize||0)},enabled:true,autoTradeEnabled:true,popupPolicy}};
}
export async function runAutoTradeCycle(){const db=await getDb();if(!db)throw new Error("Database is not available");const customers=await db.select({id:users.id}).from(users).where(eq(users.role,"user"));let allocations=0;for(const customer of customers){try{const result=await listCustomerOpportunities(customer.id,{consumeDelivery:false});allocations+=result.autoTrades.length;}catch(error){console.error(`[AutoTrade] Customer ${customer.id} cycle failed:`,error instanceof Error?error.message:error);}}return {customers:customers.length,allocations};}
export async function setCustomerPackage(email:string, packageName:string) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const normalized=email.trim().toLowerCase(); const user=(await db.select().from(users).where(eq(users.email,normalized)).limit(1))[0]; if(!user) throw new Error("Customer account not found"); await db.update(users).set({packageName}).where(eq(users.id,user.id)); return {id:user.id,email:user.email,packageName}; }
export async function createTrade(userId:number,input:{offerId:number;amountMinor:number;deliveryEventId?:number;packageSubscriptionId?:number}){
 const db=await getDb();if(!db)throw new Error("Database is not available");
 return db.transaction(async tx=>{
  // Serialize allocations for one customer. This makes daily caps and active-trade
  // checks safe when multiple workers attempt automatic trades concurrently.
  const userLock=await tx.execute(sql`SELECT id,loginMethod FROM users WHERE id=${userId} FOR UPDATE`) as any;
  const lockedUser=userLock?.[0]?.[0];
  if(!lockedUser||lockedUser.loginMethod==="closed") throw new Error("Customer account is missing or closed");
  // Lock and validate the popup event as an idempotency token before any wallet work.
  // If the original transaction committed but its response was lost, return that trade.
  if(input.deliveryEventId!==undefined){
   await tx.execute(sql`SELECT id FROM opportunity_popup_events WHERE id=${input.deliveryEventId} AND userId=${userId} FOR UPDATE`);
   const event=(await tx.select({id:opportunityPopupEvents.id,offerId:opportunityPopupEvents.offerId,eventStatus:opportunityPopupEvents.eventStatus,tradeId:opportunityPopupEvents.tradeId}).from(opportunityPopupEvents).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId))).limit(1))[0];
   if(!event) throw new Error("Opportunity delivery event not found for this customer");
   if(Number(event.offerId)!==input.offerId) throw new Error("Opportunity delivery event does not match this offer");
   if(event.eventStatus==="TRADED" && Number(event.tradeId)>0){
    const existing=(await tx.select().from(tradePositions).where(and(eq(tradePositions.id,Number(event.tradeId)),eq(tradePositions.userId,userId))).limit(1))[0];
    if(!existing) throw new Error("Previously allocated trade is missing; manual recovery review is required");
    const rate=(await tx.select({scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,updatedAt:currencyRegistry.updatedAt}).from(currencyRegistry).where(eq(currencyRegistry.code,existing.currency)).limit(1))[0];
    if(!rate || !Number.isFinite(Number(rate.usdRate)) || Number(rate.usdRate)<=0) throw new Error("Existing trade was found but its currency rate is unavailable for a safe retry response");
    const amountMinor=Number(existing.principalMinor);
    return {tradeId:Number(existing.id),rewardMinor:Number(existing.expectedRewardMinor),rewardBps:amountMinor>0?Math.floor(Number(existing.expectedRewardMinor)*10000/amountMinor):0,minimumMinor:0,calculationMethod:"idempotent-replay",settlesAt:existing.settlesAt,creditAt:existing.creditAt,currency:existing.currency,amountMinor,rateUsd:Number(rate.usdRate),rateUpdatedAt:rate.updatedAt,amountUsd:nativeMinorToUsd(amountMinor,Number(rate.scale),Number(rate.usdRate)),idempotentReplay:true};
   }
  }
  const settlementPolicy=await getTradeSettlementPolicy();

  const totalWalletFunds=(await tx.select({availableMinor:sql`COALESCE(SUM(${customerBalances.availableMinor}),0)`}).from(customerBalances).where(eq(customerBalances.userId,userId)))[0]; if(Number(totalWalletFunds?.availableMinor||0)<=0) throw new Error("Trading is unavailable until at least one wallet has available funds");
  const offer=(await tx.select().from(opportunityOffers).where(and(eq(opportunityOffers.id,input.offerId),eq(opportunityOffers.status,"open"))).limit(1))[0];
  if(!offer || new Date(offer.closesAt).getTime()<=Date.now()) throw new Error("This opportunity is no longer open");
  const now=new Date();
  const today=new Date().toISOString().slice(0,10);
  const activePackageSubscriptions=await tx.select({
    subscriptionId:customerPackageSubscriptions.id,
    packageId:packages.id,
    packageName:packages.name,
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
    )).orderBy(customerPackageSubscriptions.expiresAt).for("update");
  if(!activePackageSubscriptions.length) throw new Error("An eligible active trading package subscription is required");

  const packagePolicies=await tx.select().from(opportunityPackagePolicies)
    .where(inArray(opportunityPackagePolicies.packageName,activePackageSubscriptions.map(row=>row.packageName))).for("update");
  const policyByName=new Map<string,typeof packagePolicies[number]>();
  for(const row of packagePolicies) policyByName.set(row.packageName,row);
  const eligibleSubscriptions=activePackageSubscriptions.filter(subscription=>{
    const configured=policyByName.get(subscription.packageName);
    return !configured||(Boolean(configured.enabled)&&configured.automaticTradingEnabled!==false);
  });
  if(!eligibleSubscriptions.length) throw new Error("New allocations are paused for all active package policies");
  const quotaRows=await tx.execute(sql`SELECT packageSubscriptionId,COUNT(*) AS used FROM trade_positions WHERE userId=${userId} AND packageSubscriptionId IS NOT NULL AND DATE(confirmedAt)=${today} AND status<>'cancelled' GROUP BY packageSubscriptionId`) as any;
  const usedBySubscription=new Map<number,number>();
  for(const row of (quotaRows?.[0]||[])) usedBySubscription.set(Number(row.packageSubscriptionId),Number(row.used||0));
  const subscriptionsWithQuota=eligibleSubscriptions.filter(subscription=>{
    let snapshot:any={};
    try { snapshot=JSON.parse(String(subscription.termsSnapshotJson||"{}")); } catch { snapshot={}; }
    const dailyQuota=Number(snapshot.opportunitiesPerDay??subscription.packageQuota);
    const used=usedBySubscription.get(Number(subscription.subscriptionId))||0;
    return Number.isSafeInteger(dailyQuota)&&dailyQuota>0&&used<dailyQuota;
  });
  if(!subscriptionsWithQuota.length) throw new Error("All active package opportunity quotas have been used for today");
  const requestedSubscription=input.packageSubscriptionId
    ? subscriptionsWithQuota.find(subscription=>Number(subscription.subscriptionId)===input.packageSubscriptionId)
    : undefined;
  const activePackageSubscription=requestedSubscription||subscriptionsWithQuota[0];
  const selectedSubscriptionId=Number(activePackageSubscription.subscriptionId);
  const packagePolicy=policyByName.get(activePackageSubscription.packageName);
  if(activePackageSubscription.maxActiveInvestments>0){
    const activePositions=await tx.select({id:tradePositions.id}).from(tradePositions)
      .where(and(eq(tradePositions.userId,userId),eq(tradePositions.packageSubscriptionId,selectedSubscriptionId),eq(tradePositions.status,"confirmed")))
      .limit(Number(activePackageSubscription.maxActiveInvestments)+1);
    if(activePositions.length>=Number(activePackageSubscription.maxActiveInvestments)) throw new Error("Package maximum active investments reached");
  }
  if(packagePolicy){
    const activeRows=await tx.select({id:tradePositions.id}).from(tradePositions)
      .where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed")))
      .limit(Math.max(1,Number(packagePolicy.maxConcurrentActiveTrades||1)+1));
    if(Number(packagePolicy.maxConcurrentActiveTrades||0)>0&&activeRows.length>=Number(packagePolicy.maxConcurrentActiveTrades)) throw new Error("Package maximum concurrent active trades reached");
    const attemptRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND DATE(confirmedAt)=${today}`) as any;
    if(Number(packagePolicy.maxTradeAttemptsPerDay||0)>0&&Number(attemptRows?.[0]?.[0]?.count||0)>=Number(packagePolicy.maxTradeAttemptsPerDay)) throw new Error("Package daily trade-attempt limit reached");
    const successfulRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND status='settled' AND DATE(confirmedAt)=${today}`) as any;
    if(Number(packagePolicy.maxSuccessfulTradesPerDay||0)>0&&Number(successfulRows?.[0]?.[0]?.count||0)>=Number(packagePolicy.maxSuccessfulTradesPerDay)) throw new Error("Package daily successful-trade limit reached");
  }
  const currencyRow=(await tx.select({scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,updatedAt:currencyRegistry.updatedAt}).from(currencyRegistry).where(eq(currencyRegistry.code,offer.currency)).limit(1))[0]; if(!currencyRow) throw new Error(`Currency ${offer.currency} is not configured`); const nativeFactor=Math.pow(10,Number(currencyRow.scale)); const nativeRate=Number(currencyRow.usdRate); if(!Number.isFinite(nativeRate)||nativeRate<=0) throw new Error(`Currency ${offer.currency} has no valid conversion rate`); const terms=calculateTradeTerms(userId,offer,input.amountMinor); const packageMinimumNative=packagePolicy?usdUnitsToNativeMinor(Number(packagePolicy.minimumTradeUnits),Number(currencyRow.scale),nativeRate):Number(offer.minimumMinor); const packageMaximumNative=packagePolicy?Math.max(packageMinimumNative,usdUnitsToNativeMinor(Number(packagePolicy.maximumTradeUnits),Number(currencyRow.scale),nativeRate)):Number.MAX_SAFE_INTEGER; assertTradeAmountWithinBounds(input.amountMinor,{minimumTradeMinor:Math.max(Number(offer.minimumMinor),Number(terms.minimumMinor),packageMinimumNative),maximumTradeMinor:packageMaximumNative},Number(offer.minimumMinor));
  const already=await tx.select({id:tradePositions.id}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.offerId,input.offerId))).limit(1);
  if(already[0]) throw new Error("This opportunity has already been allocated");
  // Lock the relevant wallet row as a second line of defence against concurrent
  // debits, including writers that do not participate in the user-level lock.
  const walletLock=await tx.execute(sql`SELECT id FROM customer_balances WHERE userId=${userId} AND currency=${offer.currency} FOR UPDATE`) as any;
  const bal=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,userId),eq(customerBalances.currency,offer.currency))).limit(1))[0];
  if(!walletLock?.[0]?.length || !bal || bal.availableMinor<input.amountMinor) throw new Error("Insufficient available balance");
  // Customer-editable smart rules do not gate the approved automatic package lifecycle.
  const uncappedReward=Math.floor(input.amountMinor*terms.rewardBps/10000);
  const reward=packagePolicy&&Number(packagePolicy.maxRewardPerTradeMinor||0)>0?Math.min(uncappedReward,Number(packagePolicy.maxRewardPerTradeMinor)):uncappedReward;
  if (packagePolicy&&Number(packagePolicy.minimumRewardBps||0)>terms.rewardBps) throw new Error("Opportunity reward rate is below the package minimum");
  if (packagePolicy&&Number(packagePolicy.maxDailyRewardMinor||0)>0) {
    const reservationRows=await tx.execute(sql`SELECT COALESCE(SUM(reservedMinor),0) AS reserved FROM trade_reward_reservations WHERE userId=${userId} AND windowKey=${today} AND status='reserved'`) as any;
    const creditedRows=await tx.execute(sql`SELECT COALESCE(SUM(amountMinor),0) AS credited FROM balance_ledger WHERE userId=${userId} AND entryType='trade_reward' AND DATE(createdAt)=${today}`) as any;
    const reserved=Number(reservationRows?.[0]?.[0]?.reserved||0), credited=Number(creditedRows?.[0]?.[0]?.credited||0);
    if (remainingRewardAllowance(Number(packagePolicy.maxDailyRewardMinor),credited,reserved)<reward) throw new Error("Daily reward cap reached for this package");
  }
  const balanceUpdate=await tx.update(customerBalances).set({availableMinor:sql`${customerBalances.availableMinor}-${input.amountMinor}`,lockedMinor:sql`${customerBalances.lockedMinor}+${input.amountMinor}`,updatedAt:new Date()}).where(and(eq(customerBalances.id,bal.id),gte(customerBalances.availableMinor,input.amountMinor)));
  if(Number((balanceUpdate as any)[0]?.affectedRows||0)!==1) throw new Error("Insufficient available balance");
  const ref=`trade-${offer.id}-${userId}-${Date.now()}`;
  await tx.insert(balanceLedger).values({userId,currency:offer.currency,amountMinor:-input.amountMinor,entryType:"trade_reservation",reference:ref,withdrawable:false});
  const settlementDelaySeconds=Math.max(Number(packagePolicy?.minSettlementDelaySeconds||0),Math.min(Number(packagePolicy?.maxSettlementDelaySeconds||settlementPolicy.delaySeconds),settlementPolicy.delaySeconds)); const creditAt=new Date(Date.now()+(settlementDelaySeconds+settlementPolicy.creditDelaySeconds)*1000); const settlesAt=new Date(Date.now()+settlementDelaySeconds*1000); const result=await tx.insert(tradePositions).values({userId,offerId:offer.id,packageSubscriptionId:selectedSubscriptionId,currency:offer.currency,principalMinor:input.amountMinor,expectedRewardMinor:reward,rewardReservedMinor:reward,settlesAt,creditAt,lifecycleStage:"Trade Allocated",settlementStatus:"pending",policyVersion:Number(packagePolicy?.policyVersion||activePackageSubscription.termsVersion||1)} as any);
  const tradeId=Number(result[0].insertId);
  await tx.insert(tradeLifecycleEvents).values({tradeId,userId,eventType:"trade_allocated",stage:"Trade Allocated",payloadJson:JSON.stringify({amountMinor:input.amountMinor,currency:offer.currency,packageSubscriptionId:selectedSubscriptionId,packageId:Number(activePackageSubscription.packageId),termsVersion:Number(activePackageSubscription.termsVersion||1),policyVersion:Number(packagePolicy?.policyVersion||activePackageSubscription.termsVersion||1)})});
  if(input.deliveryEventId!==undefined) await tx.update(opportunityPopupEvents).set({tradeId,eventStatus:"TRADED",tradedAt:new Date(),updatedAt:new Date()}).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.offerId,offer.id)));
  else await tx.execute(sql`UPDATE opportunity_popup_events SET tradeId=${tradeId},eventStatus='TRADED',deliveryStatus=CASE WHEN deliveryStatus='failed' THEN deliveryStatus ELSE 'rendered' END,tradedAt=COALESCE(tradedAt,CURRENT_TIMESTAMP),updatedAt=CURRENT_TIMESTAMP WHERE userId=${userId} AND offerId=${offer.id} ORDER BY deliveredAt DESC LIMIT 1`);
  await tx.insert(tradeRewardReservations).values({userId,tradeId,packageName:activePackageSubscription.packageName,windowKey:today,currency:offer.currency,reservedMinor:reward,status:"reserved"});
  return {tradeId,rewardMinor:reward,rewardBps:terms.rewardBps,minimumMinor:terms.minimumMinor,calculationMethod:terms.method,settlesAt,creditAt,currency:offer.currency,amountMinor:input.amountMinor,rateUsd:nativeRate,rateUpdatedAt:currencyRow.updatedAt,amountUsd:nativeMinorToUsd(input.amountMinor,Number(currencyRow.scale),nativeRate)};
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
    confirmedAt:tradePositions.confirmedAt,
    settlesAt:tradePositions.settlesAt,
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
    const hasActualBreakdown=settled&&row.settlementOutcome!=="legacy_unrecorded";
    const stage=settled?"Trade Completed":pending?"Trade Allocated":new Date(row.settlesAt).getTime()<=Date.now()?"Awaiting Settlement Confirmation":"Trade Executing";
    return {
      ...row,
      tradeReference:`trade-${row.id}`,
      opportunityReference:`opportunity-${row.offerId}`,
      stage,
      settlementStatus:settled?"completed":row.status,
      rewardCredited:settled,
      creditedRewardMinor:hasActualBreakdown?Math.max(0,Number(row.netProfitMinor||0)):null,
      walletUpdated:settled,
      completionAt:settled?row.settledAt:null,
      transactionReference:settled?row.settlementReference:null,
      hasActualBreakdown,
    };
  });
}
export async function markDueTradesAwaitingConfirmation(userId:number){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const now=new Date();
  const due=await db.select({id:tradePositions.id}).from(tradePositions).where(and(
    eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed"),
    eq(tradePositions.settlementStatus,"pending"),or(lte(tradePositions.creditAt,now),and(isNull(tradePositions.creditAt),lte(tradePositions.settlesAt,now))),
  )).orderBy(tradePositions.creditAt);
  let marked=0;
  for(const item of due){
    const markedOne=await db.transaction(async tx=>{
      const trade=(await tx.select().from(tradePositions).where(and(eq(tradePositions.id,item.id),eq(tradePositions.userId,userId))).limit(1).for("update"))[0];
      if(!trade||trade.status!=="confirmed"||trade.settlementStatus!=="pending") return false;
      const dueAt=trade.creditAt||trade.settlesAt;
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
export async function listPendingSettlements(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  return db.select({
    id:tradePositions.id, userId:tradePositions.userId, offerId:tradePositions.offerId,
    currency:tradePositions.currency, principalMinor:tradePositions.principalMinor,
    expectedRewardMinor:tradePositions.expectedRewardMinor, rewardReservedMinor:tradePositions.rewardReservedMinor,
    status:tradePositions.status, settlementStatus:tradePositions.settlementStatus,
    confirmedAt:tradePositions.confirmedAt, settlesAt:tradePositions.settlesAt,
    symbol:opportunityOffers.symbol, packageName:users.packageName, customerName:users.name, customerEmail:users.email
  }).from(tradePositions).leftJoin(opportunityOffers,eq(opportunityOffers.id,tradePositions.offerId)).leftJoin(users,eq(users.id,tradePositions.userId))
    .where(and(eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending"))).orderBy(desc(tradePositions.confirmedAt));
}
export async function manuallySettleTrade(tradeId:number, adminId:number, input:{grossProfitMinor:number; settlementReference:string; notes?:string}){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  if(!Number.isSafeInteger(input.grossProfitMinor)) throw new Error("Actual gross profit or loss must be a signed safe integer");
  const reference=input.settlementReference.trim();
  if(!reference) throw new Error("A settlement reference is required");
  if(reference.length>160) throw new Error("Settlement reference must not exceed 160 characters");
  const result=await db.transaction(async tx=>{
    const trade=(await tx.select().from(tradePositions).where(eq(tradePositions.id,tradeId)).limit(1).for("update"))[0];
    if(!trade) throw new Error("Trade not found");
    // Replaying an already committed reference/result is safe and never posts again.
    if(trade.status==="settled"&&trade.settlementStatus==="completed"&&trade.settlementReference===reference){
      if(trade.settlementOutcome==="legacy_unrecorded") throw new Error("This historical settlement has no recorded gross-profit result; replay requires manual financial review.");
      if(Number(trade.realizedGrossProfitMinor)!==input.grossProfitMinor) throw new Error("Settlement reference was already used with a different actual result");
      return {tradeId,userId:trade.userId,offerId:trade.offerId,currency:trade.currency,principalMinor:Number(trade.principalMinor),grossProfitMinor:Number(trade.realizedGrossProfitMinor),platformFeeMinor:Number(trade.platformFeeMinor),netProfitMinor:Number(trade.netProfitMinor),rewardMinor:Math.max(0,Number(trade.netProfitMinor)),totalMinor:Number(trade.principalMinor)+Number(trade.netProfitMinor),feeRateBps:Number(trade.platformFeeRateBps),roundingMode:String(trade.platformFeeRoundingMode) as FeeRoundingMode,feePolicyVersion:Number(trade.feePolicyVersion),outcome:String(trade.settlementOutcome),reference,legacyUnrecorded:false};
    }
    if(trade.status!=="confirmed"||trade.settlementStatus!=="pending") throw new Error("Trade is not pending manual settlement");

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
    const wallet=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,trade.userId),eq(customerBalances.currency,trade.currency))).limit(1).for("update"))[0];
    if(!wallet) throw new Error("Customer settlement wallet is not configured");

    // Keep ledger references within balance_ledger.reference's 80-character limit.
    // Short references retain their existing readable form for audit/recovery tools.
    const ledgerBase=reference.length<=60?reference:`trade-${tradeId}-${crypto.createHash("sha256").update(reference).digest("hex").slice(0,24)}`;
    await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:principal,entryType:"trade_principal_release",reference:`${ledgerBase}:principal`,withdrawable:false});
    if(accounting.grossProfitMinor>0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:accounting.grossProfitMinor,entryType:"trade_reward",reference:`${ledgerBase}:gross-profit`,withdrawable:false});
    if(accounting.platformFeeMinor>0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:-accounting.platformFeeMinor,entryType:"trade_platform_fee",reference:`${ledgerBase}:platform-fee`,withdrawable:false});
    if(accounting.grossProfitMinor<0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:accounting.grossProfitMinor,entryType:"trade_loss",reference:`${ledgerBase}:loss`,withdrawable:false});

    const walletUpdate=await tx.update(customerBalances).set({
      availableMinor:sql`${customerBalances.availableMinor}+${accounting.totalReturnedMinor}`,
      lockedMinor:sql`GREATEST(${customerBalances.lockedMinor}-${principal},0)`,
      earnedMinor:sql`${customerBalances.earnedMinor}+${accounting.netProfitMinor}`,
      updatedAt:new Date(),
    }).where(eq(customerBalances.id,wallet.id));
    assertExactlyOneAffectedRow(walletUpdate,"Manual settlement wallet update");
    const now=new Date();
    const settlementUpdate=await tx.update(tradePositions).set({
      status:"settled",
      settledAt:now,
      lifecycleStage:"Trade Completed",
      settlementStatus:"completed",
      rewardCreditedMinor:accounting.rewardCreditedMinor,
      realizedGrossProfitMinor:accounting.grossProfitMinor,
      platformFeeMinor:accounting.platformFeeMinor,
      netProfitMinor:accounting.netProfitMinor,
      feePolicyVersion:feePolicy.policyVersion,
      platformFeeRateBps:feePolicy.feeRateBps,
      platformFeeRoundingMode:feePolicy.roundingMode,
      settlementOutcome:accounting.outcome,
      rewardReservedMinor:0,
      walletUpdatedAt:now,
      completionAt:now,
      transactionReference:reference,
      settlementReference:reference,
      settlementConfirmedAt:now,
      settlementConfirmedBy:adminId,
      settlementNotes:input.notes?.trim()||null,
    }).where(and(eq(tradePositions.id,tradeId),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending")));
    // If another settlement won the race, roll back wallet and ledger mutations together.
    assertExactlyOneAffectedRow(settlementUpdate,"Manual trade settlement state transition");
    // Preserve the original reserved estimate as audit evidence. Only its state changes.
    await tx.update(tradeRewardReservations).set({
      status:accounting.netProfitMinor>0?"credited":"released",
      updatedAt:now,
    }).where(and(eq(tradeRewardReservations.tradeId,tradeId),eq(tradeRewardReservations.status,"reserved")));
    await tx.insert(tradeLifecycleEvents).values({
      tradeId,userId:trade.userId,eventType:"manual_settlement_confirmed",stage:"Wallet Updated",
      payloadJson:JSON.stringify({principalMinor:principal,grossProfitMinor:accounting.grossProfitMinor,platformFeeMinor:accounting.platformFeeMinor,netProfitMinor:accounting.netProfitMinor,feeRateBps:feePolicy.feeRateBps,roundingMode:feePolicy.roundingMode,feePolicyVersion:feePolicy.policyVersion,outcome:accounting.outcome,reference,adminId}),
    });
    if(accounting.netProfitMinor>Number(trade.rewardReservedMinor||0)){
      await tx.insert(tradeLifecycleEvents).values({
        tradeId,userId:trade.userId,eventType:"realized_reward_exceeded_reservation",stage:"Settlement Reconciliation Required",
        payloadJson:JSON.stringify({reservedMinor:Number(trade.rewardReservedMinor||0),actualNetProfitMinor:accounting.netProfitMinor,reference,reason:"Actual realized result exceeded the opportunity reward reservation; actual settlement was recorded without capping or fabricating the result."}),
      });
    }
    await tx.insert(tradeLifecycleEvents).values({
      tradeId,userId:trade.userId,eventType:"trade_completed",stage:"Trade Completed",
      payloadJson:JSON.stringify({reference,outcome:accounting.outcome,realizedGrossProfitMinor:accounting.grossProfitMinor,platformFeeMinor:accounting.platformFeeMinor,netProfitMinor:accounting.netProfitMinor}),
    });
    return {
      tradeId,userId:trade.userId,offerId:trade.offerId,currency:trade.currency,
      principalMinor:principal,grossProfitMinor:accounting.grossProfitMinor,
      platformFeeMinor:accounting.platformFeeMinor,netProfitMinor:accounting.netProfitMinor,
      rewardMinor:accounting.rewardCreditedMinor,totalMinor:accounting.totalReturnedMinor,
      feeRateBps:feePolicy.feeRateBps,roundingMode:feePolicy.roundingMode,
      feePolicyVersion:feePolicy.policyVersion,outcome:accounting.outcome,reference,legacyUnrecorded:false,
    };
  });
  await updatePopupLifecycleForOffer(result.userId,result.offerId,"settled");
  // Notification delivery is performed by the API router after this durable transaction commits.
  return result;
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
