import crypto from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { InsertUser, appSettings, customerBalances, currencyRegistry, customerControls, customerNotifications, customerSessions, customerWalletPreferences, customerOpportunityRules, opportunityDeliveryEvents, opportunityOffers, opportunityPopupEvents, balanceLedger, tradePositions, tradeRewardReservations, tradeLifecycleEvents, users, missedOpportunities, v5AuditEvents } from "../drizzle/schema";
import { ENV } from './_core/env';
import { calculateTradeSettlement } from "./modules/trade-settlement";
import { ensurePopupDeliveries, updatePopupLifecycleForOffer } from "./opportunityLifecycle";
import { assertTradeAmountWithinBounds, chooseSecureTradeAmount } from "./modules/package-trade-allocation";
import { fetchCryptoRates, fetchFiatRates, fetchMostActiveStocks } from "./marketProviders";
import { nativeMinorToUsd, usdUnitsToNativeMinor } from "../shared/money";
import { validatePackageAutomationPolicy, remainingRewardAllowance } from "./modules/advanced-auto-trading";
import { isWithinDailyAllocationLimit } from "./modules/daily-allocation";
import { normalizeTicketUploadPolicy } from "./modules/ticket-upload-policy";
import { isAllowedAttachmentRequest, isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy";
import { buildNotificationEventKey, filterNotificationCategories, normalizeNotificationHref, normalizeNotificationText, NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPriority } from "./modules/notification-events";
import { isCustomerOpportunityAllowed, isWithinQuietHours } from "./opportunityEligibility";
import { assertExactlyOneAffectedRow } from "./db-mutation-guards";
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
export async function getAutoTradePolicy() {
  const globalEnabled = (await getAppSetting("autoTrade.globalEnabled")) === "true";
  return { globalEnabled };
}

export async function setAutoTradePolicy(globalEnabled: boolean, updatedBy: number) {
  await setAppSetting("autoTrade.globalEnabled", String(globalEnabled), updatedBy);
  return getAutoTradePolicy();
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
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

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
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
      ...admins.map(admin=>createNotification(admin.id,"New customer support ticket",`${ticketNumber}: ${subject}`,{eventKey:`support-ticket-created:${ticketId}`,category:"support",priority:input.priority==="urgent"?"urgent":input.priority==="high"?"high":"normal"})),
      createNotification(userId,subject,`${ticketNumber}: Your support ticket was created and is now in the support centre.`,{eventKey:`support-ticket-created-customer:${ticketId}`,category:"support",priority:input.priority==="urgent"?"urgent":input.priority==="high"?"high":"normal"}),
    ]);
    if(notificationResults.some(result=>result.status==="rejected")) console.error("[Notifications] One or more ticket-created notices failed after ticket persistence.");
  } catch(error) {
    console.error("[Notifications] Ticket-created notices failed after ticket persistence:",error instanceof Error?error.name:"UnknownError");
  }
  return {ticketId,ticketNumber};
 }
export async function listCustomerTickets(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(supportTickets).where(eq(supportTickets.customerId,userId)).orderBy(desc(supportTickets.updatedAt)); }
export async function listAllTickets() { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:supportTickets.id,ticketNumber:supportTickets.ticketNumber,customerId:supportTickets.customerId,subject:supportTickets.subject,category:supportTickets.category,priority:supportTickets.priority,status:supportTickets.status,createdAt:supportTickets.createdAt,updatedAt:supportTickets.updatedAt,customerName:users.name,customerEmail:users.email}).from(supportTickets).leftJoin(users,eq(users.id,supportTickets.customerId)).orderBy(desc(supportTickets.updatedAt)); }
export async function getCustomerTicket(userId:number,ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return (await db.select().from(supportTickets).where(and(eq(supportTickets.id,ticketId),eq(supportTickets.customerId,userId))).limit(1))[0] ?? null; }
export async function addTicketMessage(actorId:number,ticketId:number,body:string,status?:"open"|"answered"|"resolved"|"closed") {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  // Keep the message and ticket status in one transaction: a failed status
  // update must not leave a committed reply with stale inbox state.
  const committed=await db.transaction(async tx=>{
    const ticket=(await tx.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1))[0];
    if(!ticket) throw new Error("Ticket not found");
    const actor=(await tx.select({role:users.role}).from(users).where(eq(users.id,actorId)).limit(1))[0];
    if(!actor) throw new Error("Message author not found");
    const isAdmin=actor.role==="admin";
    if(!isAdmin && ticket.customerId!==actorId) throw new Error("You do not have access to this ticket");
    const normalizedBody=normalizeNotificationText(body,20000,"ticket message");
    if(!isAdmin && ticket.status==="closed") throw new Error("Closed tickets cannot receive customer replies; open a new ticket");
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
      await Promise.allSettled(admins.map(admin=>createNotification(admin.id,"Customer replied to a support ticket",`${committed.ticket.ticketNumber}: ${committed.normalizedBody.slice(0,240)}`,{eventKey:`support-ticket:${ticketId}:message:${committed.messageId}`,category:"support",priority:committed.ticket.priority==="urgent"?"urgent":committed.ticket.priority==="high"?"high":"normal"})));
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
  await db.update(supportTickets).set({status:"open",updatedAt:new Date()}).where(eq(supportTickets.id,ticketId));
  const eventKey=`support-ticket:${ticketId}:reopened:${previousUpdatedAt}`;
  const notice=isAdmin
    ? createNotification(ticket.customerId,"Your support ticket was reopened",`${ticket.ticketNumber}: support has reopened this case and the conversation is available again.`,{eventKey,category:"support",priority:ticket.priority==="urgent"?"urgent":"normal"})
    : (async()=>{const admins=await db.select({id:users.id}).from(users).where(eq(users.role,"admin"));await Promise.all(admins.map(admin=>createNotification(admin.id,"Customer reopened a support ticket",`${ticket.ticketNumber}: the customer reopened this case.`,{eventKey:`${eventKey}:admin:${admin.id}`,category:"support",priority:ticket.priority==="urgent"?"urgent":"normal"})));})();
  try { await notice; } catch(error) { console.error("[Notifications] Ticket reopen notice failed after status commit:",error instanceof Error?error.name:"UnknownError"); }
  return {success:true,changed:true,status:"open" as const};
}
export async function listTicketMessages(ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:supportMessages.id,ticketId:supportMessages.ticketId,authorId:supportMessages.authorId,authorName:users.name,authorRole:users.role,body:supportMessages.body,createdAt:supportMessages.createdAt}).from(supportMessages).leftJoin(users,eq(users.id,supportMessages.authorId)).where(eq(supportMessages.ticketId,ticketId)).orderBy(supportMessages.createdAt); }
export async function createNotification(userId:number,title:string,body:string,options:{eventKey?:string|null;category?:NotificationCategory;priority?:NotificationPriority;href?:string|null}={}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const safeTitle=normalizeNotificationText(title,200,"title");
  const safeBody=normalizeNotificationText(body,10000,"body");
  const eventKey=buildNotificationEventKey(userId,options.eventKey);
  const href=normalizeNotificationHref(options.href);
  const values={userId,title:safeTitle,body:safeBody,eventKey,category:options.category||"account",priority:options.priority||"normal",href};
  let notificationId=0;
  if(eventKey){
    const inserted=await db.insert(customerNotifications).values(values).onDuplicateKeyUpdate({set:{eventKey}});
    notificationId=Number(inserted[0].insertId)||0;
    if(!notificationId){
      const existing=(await db.select({id:customerNotifications.id}).from(customerNotifications).where(eq(customerNotifications.eventKey,eventKey)).limit(1))[0];
      notificationId=existing?.id||0;
    }
  } else {
    const inserted=await db.insert(customerNotifications).values(values);
    notificationId=Number(inserted[0].insertId)||0;
  }
  // Email delivery is keyed by the persisted notification ID; duplicate event
  // retries therefore reuse the same outbox idempotency key.
  if(notificationId){
    try { const { enqueueSystemNotificationEmail }=await import("./emailQueue"); await enqueueSystemNotificationEmail(userId,safeTitle,safeBody,`notification:${notificationId}`); }
    catch(error) { console.error("[Email] System notification enqueue failed:",error instanceof Error?error.name:"UnknownError"); }
  }
}
export async function broadcastCustomerNotification(adminId:number,input:{title:string;body:string;eventKey:string;category:NotificationCategory;priority:NotificationPriority;href?:string|null;targetUserId?:number|null}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const title=normalizeNotificationText(input.title,200,"title");
  const body=normalizeNotificationText(input.body,10000,"body");
  const eventKey=normalizeNotificationText(input.eventKey,120,"event key");
  const href=normalizeNotificationHref(input.href);
  const recipients=input.targetUserId
    ? await db.select({id:users.id}).from(users).where(and(eq(users.id,input.targetUserId),eq(users.role,"user"))).limit(1)
    : await db.select({id:users.id}).from(users).where(eq(users.role,"user"));
  if(input.targetUserId && !recipients.length) throw new Error("Selected customer account was not found");
  const deliveries=await Promise.allSettled(recipients.map(recipient=>createNotification(recipient.id,title,body,{eventKey:`admin-broadcast:${adminId}:${eventKey}`,category:input.category,priority:input.priority,href})));
  const recipientCount=deliveries.filter(result=>result.status==="fulfilled").length;
  const failedCount=deliveries.length-recipientCount;
  if(failedCount) console.error(`[Notifications] Admin broadcast ${eventKey} failed for ${failedCount} recipient(s).`);
  return {recipientCount,totalRecipientCount:recipients.length,failedCount,eventKey,targetUserId:input.targetUserId??null};
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
export async function listCustomerNotifications(userId:number) {
  const [rows,visibility]=await Promise.all([listNotifications(userId),getNotificationCategoryVisibility()]);
  return filterNotificationCategories(rows,visibility);
}
export async function listNotifications(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(customerNotifications).where(eq(customerNotifications.userId,userId)).orderBy(desc(customerNotifications.createdAt)); }
export async function listNotificationEventCursor(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select({id:customerNotifications.id,category:customerNotifications.category,readAt:customerNotifications.readAt}).from(customerNotifications).where(eq(customerNotifications.userId,userId)).orderBy(desc(customerNotifications.createdAt)).limit(500); }
export async function markCustomerNotificationsRead(userId:number, notificationId?:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const condition=notificationId ? and(eq(customerNotifications.userId,userId),eq(customerNotifications.id,notificationId)) : and(eq(customerNotifications.userId,userId),sql`${customerNotifications.readAt} IS NULL`); await db.update(customerNotifications).set({readAt:new Date()}).where(condition); return listCustomerNotifications(userId); }
export async function getCustomerWalletPreferences(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); let row=(await db.select().from(customerWalletPreferences).where(eq(customerWalletPreferences.userId,userId)).limit(1))[0]; if(!row){await db.insert(customerWalletPreferences).values({userId}); row=(await db.select().from(customerWalletPreferences).where(eq(customerWalletPreferences.userId,userId)).limit(1))[0];} return row; }
export async function updateCustomerWalletPreferences(userId:number,input:{tradingCurrency?:string;swapCurrency?:string;autoTopUpEnabled?:boolean;withdrawalWhitelistEnabled?:boolean}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await getCustomerWalletPreferences(userId); const values:any={...input}; if(values.tradingCurrency) values.tradingCurrency=values.tradingCurrency.toUpperCase(); if(values.swapCurrency) values.swapCurrency=values.swapCurrency.toUpperCase(); await db.update(customerWalletPreferences).set(values).where(eq(customerWalletPreferences.userId,userId)); return getCustomerWalletPreferences(userId); }
export async function getCustomerOpportunityRules(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); let row=(await db.select().from(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId)).limit(1))[0]; if(!row){await db.insert(customerOpportunityRules).values({userId}); row=(await db.select().from(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId)).limit(1))[0];} return row; }
export async function updateCustomerOpportunityRules(userId:number,input:{enabled?:boolean;minimumRewardBps?:number;maxDailyAllocationMinor?:number;allowedAssets?:string;quietHoursStart?:string;quietHoursEnd?:string}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await getCustomerOpportunityRules(userId); const values:any={...input}; if(values.allowedAssets) values.allowedAssets=values.allowedAssets.toUpperCase().replace(/\s+/g,""); await db.update(customerOpportunityRules).set(values).where(eq(customerOpportunityRules.userId,userId)); return getCustomerOpportunityRules(userId); }

export async function addTicketAttachment(userId:number,input:{ticketId:number;fileName:string;mimeType:string;sizeBytes:number;storageKey:string}) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const policy=await getTicketUploadPolicy();
  if(!isAllowedAttachmentRequest({fileName:input.fileName,mimeType:input.mimeType,sizeBytes:input.sizeBytes},{maxAttachmentMb:policy.maxAttachmentMb,allowedMimeTypes:policy.allowedMimeTypes})) throw new Error("Attachment does not meet the current upload policy");
  if(!isValidSupportAttachmentStorageKey(input.storageKey)) throw new Error("Invalid support attachment storage key");
  const ticket=(await db.select().from(supportTickets).where(and(eq(supportTickets.id,input.ticketId),eq(supportTickets.customerId,userId))).limit(1))[0];
  if(!ticket) throw new Error("Ticket not found");
  await db.insert(supportAttachments).values({ticketId:input.ticketId,uploadedBy:userId,fileName:input.fileName.slice(0,255),mimeType:input.mimeType.slice(0,160),sizeBytes:input.sizeBytes,storageKey:input.storageKey.slice(0,512)});
  return {success:true};
}

// Controlled opportunity engine: this is an internal paper-ledger boundary. Real execution requires licensed providers/custody.
import { opportunityPackagePolicies } from "../drizzle/schema";

const DEFAULT_OPPORTUNITY_PACKAGE_POLICIES = [
  { packageName: "Starter", maxPopupsPerDay: 50, maxVisibleOffers: 10, minimumTradeUnits: 1000, maximumTradeUnits: 500000, minHourlyTarget: 2, normalHourlyTarget: 2, marketInfluenceBps: 3000, burstEnabled: false, maxBurstSize: 0, enabled: true },
  { packageName: "Growth", maxPopupsPerDay: 100, maxVisibleOffers: 20, minimumTradeUnits: 5000, maximumTradeUnits: 1500000, minHourlyTarget: 2, normalHourlyTarget: 4, marketInfluenceBps: 5000, burstEnabled: true, maxBurstSize: 2, enabled: true },
  { packageName: "Pro", maxPopupsPerDay: 200, maxVisibleOffers: 40, minimumTradeUnits: 10000, maximumTradeUnits: 3000000, minHourlyTarget: 4, normalHourlyTarget: 6, marketInfluenceBps: 7000, burstEnabled: true, maxBurstSize: 3, enabled: true },
  { packageName: "Institutional", maxPopupsPerDay: 500, maxVisibleOffers: 100, minimumTradeUnits: 200000, maximumTradeUnits: 700000, minHourlyTarget: 6, normalHourlyTarget: 10, marketInfluenceBps: 8500, burstEnabled: true, maxBurstSize: 3, enabled: true },
] as const;

export async function provisionSignupCredit(userId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const amount=Number(await getAppSetting("signup.autoCreditMinor"));
  const currency=(await getAppSetting("signup.autoCreditCurrency")) || "USD";
  if(!Number.isFinite(amount) || amount<=0) return;
  const existing=await db.select().from(balanceLedger).where(and(eq(balanceLedger.userId,userId),eq(balanceLedger.entryType,"signup_credit"))).limit(1);
  if(existing[0]) return;
  const balance=(await db.select().from(customerBalances).where(and(eq(customerBalances.userId,userId),eq(customerBalances.currency,currency))).limit(1))[0];
  if(balance) await db.update(customerBalances).set({availableMinor:balance.availableMinor+amount,promotionalMinor:balance.promotionalMinor+amount}).where(eq(customerBalances.id,balance.id));
  else await db.insert(customerBalances).values({userId,currency,availableMinor:amount,promotionalMinor:amount,earnedMinor:0});
  await db.insert(balanceLedger).values({userId,currency,amountMinor:amount,entryType:"signup_credit",reference:`signup-${userId}`,withdrawable:false});
}
const defaultCurrencies=[{code:"USD",name:"US Dollar",symbol:"$",scale:2,assetType:"fiat" as const,usdRate:"1",rateProvider:"manual",externalCode:"USD",enabled:true},{code:"EUR",name:"Euro",symbol:"€",scale:2,assetType:"fiat" as const,usdRate:"1.08",rateProvider:"manual",externalCode:"EUR",enabled:true},{code:"GBP",name:"British Pound",symbol:"£",scale:2,assetType:"fiat" as const,usdRate:"1.27",rateProvider:"manual",externalCode:"GBP",enabled:true},{code:"BTC",name:"Bitcoin",symbol:"₿",scale:8,assetType:"crypto" as const,usdRate:"65000",rateProvider:"manual",externalCode:"BTC",enabled:true},{code:"ETH",name:"Ethereum",symbol:"Ξ",scale:8,assetType:"crypto" as const,usdRate:"3500",rateProvider:"manual",externalCode:"ETH",enabled:true}];
export async function listCurrencies(){const db=await getDb();if(!db)throw new Error("Database is not available");let rows=await db.select().from(currencyRegistry).where(eq(currencyRegistry.enabled,true));if(!rows.length){for(const c of defaultCurrencies)await db.insert(currencyRegistry).values(c).onDuplicateKeyUpdate({set:{name:c.name,symbol:c.symbol,scale:c.scale,usdRate:c.usdRate}});rows=await db.select().from(currencyRegistry).where(eq(currencyRegistry.enabled,true));}return rows;}
export async function upsertCurrency(input:{code:string;name:string;symbol:string;scale:number;assetType:"fiat"|"crypto"|"token";usdRate:string;rateProvider:string;externalCode?:string;enabled?:boolean}){const db=await getDb();if(!db)throw new Error("Database is not available");const code=input.code.trim().toUpperCase();if(!/^[A-Z0-9._-]{2,32}$/.test(code))throw new Error("Currency code must be 2-32 letters or numbers");if(!/^[0-9]+(\\.[0-9]+)?$/.test(input.usdRate)||Number(input.usdRate)<=0)throw new Error("USD rate must be a positive decimal");await db.insert(currencyRegistry).values({...input,code,enabled:input.enabled??true}).onDuplicateKeyUpdate({set:{name:input.name.trim(),symbol:input.symbol.trim(),scale:input.scale,assetType:input.assetType,usdRate:input.usdRate,rateProvider:input.rateProvider.trim(),externalCode:input.externalCode||null,enabled:input.enabled??true}});return (await db.select().from(currencyRegistry).where(eq(currencyRegistry.code,code)).limit(1))[0];}
export async function listBalances(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");const currencies=await listCurrencies();const existing=await db.select().from(customerBalances).where(eq(customerBalances.userId,userId));const byCode=new Map(existing.map(x=>[x.currency,x]));return currencies.map(c=>byCode.get(c.code)||{id:0,userId,currency:c.code,availableMinor:0,lockedMinor:0,promotionalMinor:0,earnedMinor:0,updatedAt:null});}
export async function getCustomerBalanceSummary(userId:number){const currencies=await listCurrencies();const balances=await listBalances(userId);const byCode=new Map(balances.map(x=>[x.currency,x]));let availableUsd=0,lockedUsd=0,promotionalUsd=0,earnedUsd=0;for(const c of currencies){const b=byCode.get(c.code);const factor=Math.pow(10,c.scale);const rate=Number(c.usdRate)||0;availableUsd+=(Number(b?.availableMinor||0)/factor)*rate;lockedUsd+=(Number(b?.lockedMinor||0)/factor)*rate;promotionalUsd+=(Number(b?.promotionalMinor||0)/factor)*rate;earnedUsd+=(Number(b?.earnedMinor||0)/factor)*rate;}return {balances,currencies,summary:{availableUsd,lockedUsd,promotionalUsd,earnedUsd,totalUsd:availableUsd+lockedUsd}};}

export async function ensureCustomerControls(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");let row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];if(!row){await db.insert(customerControls).values({userId,autoTradeEnabled:true,autoTradeAmountMinor:10000,autoTradeMinRewardBps:0,autoTradeDailyLimit:5});row=(await db.select().from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0];}return row;}
export async function getCustomerAutoTradeSettings(userId:number){const c=await ensureCustomerControls(userId);const policy=await getAutoTradePolicy();const autoTradeEnabled=c.autoTradeMode==="enabled"||(c.autoTradeMode==="inherit"&&policy.globalEnabled);return {autoTradeEnabled,autoTradeMode:c.autoTradeMode,globalAutoTradeEnabled:policy.globalEnabled,autoTradeAmountMinor:c.autoTradeAmountMinor,autoTradeMinRewardBps:c.autoTradeMinRewardBps,autoTradeDailyLimit:c.autoTradeDailyLimit,tradingEnabled:c.tradingEnabled,opportunitiesEnabled:c.opportunitiesEnabled,accountStatus:c.accountStatus,dailyTradeLimitMinor:c.dailyTradeLimitMinor};}
export async function updateCustomerAutoTradeSettings(userId:number,input:{autoTradeEnabled?:boolean;autoTradeAmountMinor?:number;autoTradeMinRewardBps?:number;autoTradeDailyLimit?:number}){const db=await getDb();if(!db)throw new Error("Database is not available");await ensureCustomerControls(userId);const values:any={...input};if(input.autoTradeEnabled!==undefined) values.autoTradeMode=input.autoTradeEnabled?"enabled":"disabled";await db.update(customerControls).set(values).where(eq(customerControls.userId,userId));return getCustomerAutoTradeSettings(userId);}

export async function listAdminCustomers(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({id:users.id,name:users.name,email:users.email,packageName:users.packageName,role:users.role,createdAt:users.createdAt}).from(users).orderBy(desc(users.createdAt));
  const controls=await db.select().from(customerControls); const byUser=new Map(controls.map(row=>[row.userId,row]));
  const globalAutoTradeEnabled=(await getAutoTradePolicy()).globalEnabled; return rows.filter(row=>row.role!=="admin").map(row=>{const c=byUser.get(row.id); const autoTradeMode=c?.autoTradeMode||"inherit"; const autoTradeEffectiveEnabled=autoTradeMode==="enabled"||(autoTradeMode==="inherit"&&globalAutoTradeEnabled); return {id:row.id,name:row.name||row.email||"Customer",email:row.email||"",package:row.packageName,group:row.packageName,status:c?.accountStatus||"active",accountState:c?.accountStatus||"active",opportunities:"Database delivery",opportunitiesEnabled:c?.opportunitiesEnabled??true,autoTradeMode,autoTradeEnabled:autoTradeEffectiveEnabled,autoTradeEffectiveEnabled,limit:c?.dailyTradeLimitMinor??2500000,kyc:c?.kycRequired??true,withdrawals:c?.withdrawalsEnabled??false,twofa:c?.twoFactorRequired??false,facial:false,tradingEnabled:c?.tradingEnabled??true,emailVerified:c?.emailVerified??false,riskTier:c?.riskTier||"standard",adminNote:c?.adminNote||"",createdAt:row.createdAt};});
}
export async function createAdminCustomer(input:{name:string;email:string;password:string;packageName:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();if(!(await listOpportunityPackagePolicies()).some(p=>p.packageName===input.packageName&&p.enabled))throw new Error("Package is not configured or enabled");if(input.password.length<10)throw new Error("Customer password must be at least 10 characters");const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing)throw new Error("A customer with this email already exists");const salt=crypto.randomBytes(16).toString("hex");const digest=crypto.scryptSync(input.password,salt,32).toString("hex");const result=await db.insert(users).values({openId:`local:customer:${crypto.randomUUID()}`,name:input.name.trim(),email,loginMethod:"password",role:"user",passwordHash:`scrypt$${salt}$${digest}`,packageName:input.packageName});const id=Number(result[0].insertId);await db.insert(customerControls).values({userId:id});return {id,email,name:input.name.trim(),packageName:input.packageName};}
export async function updateAdminCustomer(input:{id:number;name:string;email:string;packageName:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();if(!(await listOpportunityPackagePolicies()).some(p=>p.packageName===input.packageName&&p.enabled))throw new Error("Package is not configured or enabled");const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing&&existing.id!==input.id)throw new Error("That email is already used by another account");await db.update(users).set({name:input.name.trim(),email,packageName:input.packageName}).where(and(eq(users.id,input.id),eq(users.role,"user")));return {success:true};}
export async function updateCustomerControls(adminId:number,input:{userId:number;accountStatus?:"active"|"suspended"|"restricted";tradingEnabled?:boolean;opportunitiesEnabled?:boolean;autoTradeEnabled?:boolean;autoTradeMode?:"inherit"|"enabled"|"disabled";autoTradeAmountMinor?:number;autoTradeMinRewardBps?:number;autoTradeDailyLimit?:number;withdrawalsEnabled?:boolean;kycRequired?:boolean;twoFactorRequired?:boolean;emailVerified?:boolean;riskTier?:string;dailyTradeLimitMinor?:number;adminNote?:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const existing=(await db.select().from(customerControls).where(eq(customerControls.userId,input.userId)).limit(1))[0];const values:any={...input};delete values.userId;if(values.autoTradeEnabled!==undefined&&values.autoTradeMode===undefined) values.autoTradeMode=values.autoTradeEnabled?"enabled":"disabled";if(existing)await db.update(customerControls).set({...values,updatedBy:adminId}).where(eq(customerControls.userId,input.userId));else await db.insert(customerControls).values({userId:input.userId,updatedBy:adminId,...values});return {success:true};}
export async function deleteAdminCustomer(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");await db.transaction(async tx=>{await tx.delete(customerControls).where(eq(customerControls.userId,userId));await tx.delete(customerBalances).where(eq(customerBalances.userId,userId));await tx.delete(balanceLedger).where(eq(balanceLedger.userId,userId));await tx.delete(tradePositions).where(eq(tradePositions.userId,userId));await tx.delete(customerNotifications).where(eq(customerNotifications.userId,userId));await tx.delete(customerSessions).where(eq(customerSessions.userId,userId));await tx.delete(customerWalletPreferences).where(eq(customerWalletPreferences.userId,userId));await tx.delete(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId));await tx.delete(users).where(and(eq(users.id,userId),eq(users.role,"user")));});return {success:true};}
export async function adjustCustomerBalance(adminId:number,input:{userId:number;currency:string;amountMinor:number;mode:"credit"|"debit";reason:string}){const db=await getDb();if(!db)throw new Error("Database is not available");if(input.amountMinor<=0)throw new Error("Amount must be positive");const ledgerReference=`admin-${adminId}-${input.userId}-${crypto.randomUUID()}`;const result=await db.transaction(async tx=>{const user=(await tx.select({id:users.id,role:users.role}).from(users).where(input.userId===adminId?eq(users.id,input.userId):and(eq(users.id,input.userId),eq(users.role,"user"))).limit(1))[0];if(!user)throw new Error("Customer account not found");if(user.role==="admin"&&user.id!==adminId)throw new Error("Administrators may adjust only their own wallet");const currency=(await tx.select().from(currencyRegistry).where(and(eq(currencyRegistry.code,input.currency.toUpperCase()),eq(currencyRegistry.enabled,true))).limit(1))[0];if(!currency)throw new Error(`Currency ${input.currency} is not enabled. Add it in Currency registry first.`);const balance=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1))[0];const current=balance?.availableMinor||0;const next=input.mode==="credit"?current+input.amountMinor:current-input.amountMinor;if(next<0)throw new Error("Debit exceeds available wallet balance");if(balance)await tx.update(customerBalances).set({availableMinor:next,promotionalMinor:input.mode==="credit"?balance.promotionalMinor+input.amountMinor:balance.promotionalMinor}).where(eq(customerBalances.id,balance.id));else await tx.insert(customerBalances).values({userId:input.userId,currency:currency.code,availableMinor:input.amountMinor,promotionalMinor:input.mode==="credit"?input.amountMinor:0,earnedMinor:0});await tx.insert(balanceLedger).values({userId:input.userId,currency:currency.code,amountMinor:input.mode==="credit"?input.amountMinor:-input.amountMinor,entryType:`admin_${input.mode}`,reference:ledgerReference,withdrawable:false});return {success:true,newAvailableMinor:next,currency:currency.code,amountMinor:input.amountMinor,ledgerReference,rateUsd:Number(currency.usdRate),rateUpdatedAt:currency.updatedAt,amountUsd:nativeMinorToUsd(input.amountMinor,Number(currency.scale),Number(currency.usdRate))};}); try { await createNotification(input.userId,`Wallet ${input.mode==="credit"?"credited":"debited"}`,`An administrator ${input.mode}ed ${input.amountMinor} native ledger units to your ${input.currency.toUpperCase()} wallet. Reason: ${input.reason}`,{eventKey:`wallet-adjustment:${result.ledgerReference}`,category:input.mode==="credit"?"ledger_credit":"ledger_debit",priority:"normal"}); } catch(error) { console.error("[Notifications] Wallet adjustment notice failed after ledger commit:",error instanceof Error?error.name:"UnknownError"); } try { const { enqueueWalletAdjustmentEmail } = await import("./emailQueue"); await enqueueWalletAdjustmentEmail(input.userId,input.mode,input.amountMinor,input.currency,`admin-ledger:${adminId}:${input.userId}:${Date.now()}`); } catch(error) { console.error("[Email] Wallet alert enqueue failed:",error instanceof Error?error.name:"UnknownError"); } return result; }
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
async function markMissedOpportunity(userId:number,offer:any,amountMinor:number,reason:string){const db=await getDb();if(!db)throw new Error("Database is not available");const terms=calculateTradeTerms(userId,offer,amountMinor);const potentialRewardMinor=Math.floor(amountMinor*terms.rewardBps/10000);await db.insert(missedOpportunities).values({userId,offerId:offer.id,symbol:offer.symbol,currency:offer.currency,amountMinor,potentialRewardMinor,expectedRewardBps:terms.rewardBps,reason,status:"MISSED"}).onDuplicateKeyUpdate({set:{updatedAt:new Date(),potentialRewardMinor,reason}});}
async function markOpportunityExecuted(userId:number,offerId:number){const db=await getDb();if(!db)throw new Error("Database is not available");await db.update(missedOpportunities).set({status:"EXECUTED",updatedAt:new Date()}).where(and(eq(missedOpportunities.userId,userId),eq(missedOpportunities.offerId,offerId)));}
async function autoTradeOpenOpportunities(userId:number,offers:any[],controls:any){const executed:any[]=[];if(!controls.autoTradeEnabled||!controls.tradingEnabled||controls.accountStatus!=="active")return {executed,missed:await listMissedOpportunities(userId)};const existingTrades:any[]=await listTrades(userId);for(const offer of offers){const requestedAmount=chooseSecureTradeAmount({minimumTradeMinor:Number(offer.packageMinimumTradeMinor||1),maximumTradeMinor:Number(offer.packageMaximumTradeMinor||Number.MAX_SAFE_INTEGER),offerMinimumMinor:Number(offer.minimumMinor),availableMinor:Number((await listBalances(userId)).find(b=>b.currency===offer.currency)?.availableMinor||0)});if(requestedAmount===null){await markMissedOpportunity(userId,offer,Math.max(Number(offer.minimumMinor),Number(offer.packageMinimumTradeMinor||1)),"INSUFFICIENT_AVAILABLE_BALANCE");continue;}const terms=calculateTradeTerms(userId,offer,requestedAmount);if(terms.rewardBps<Number(controls.autoTradeMinRewardBps))continue;if(existingTrades.some(t=>t.offerId===offer.id))continue;const balance=(await listBalances(userId)).find(b=>b.currency===offer.currency);if(!balance||Number(balance.availableMinor)<requestedAmount){await markMissedOpportunity(userId,offer,requestedAmount,"INSUFFICIENT_AVAILABLE_BALANCE");continue;}try{const result=await createTrade(userId,{offerId:offer.id,amountMinor:requestedAmount});await markOpportunityExecuted(userId,offer.id);executed.push({...result,offerId:offer.id,symbol:offer.symbol,amountMinor:requestedAmount,rewardBps:terms.rewardBps,calculationMethod:terms.method});existingTrades.push({offerId:offer.id,confirmedAt:new Date()});break;}catch(error){if(error instanceof Error&&/already been allocated|duplicate/i.test(error.message))continue;await markMissedOpportunity(userId,offer,requestedAmount,error instanceof Error?error.message:"AUTO_TRADE_REJECTED");}}return {executed,missed:await listMissedOpportunities(userId)};}
export async function listCustomerOpportunities(userId:number, options: { consumeDelivery?: boolean } = {}) { const db=await getDb(); if(!db)throw new Error("Database is not available"); const settled: Array<{tradeId:number;rewardMinor:number;currency:string;totalMinor:number}>=[]; const settlementPolicy=await getTradeSettlementPolicy(); const outstandingTrades=settlementPolicy.blockUntilSettled?await countOutstandingTrades(userId):0; const cooldownTrade=settlementPolicy.cooldownSeconds>0?(await db.select({settledAt:tradePositions.settledAt}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"settled"),sql`UTC_TIMESTAMP() < DATE_ADD(${tradePositions.settledAt}, INTERVAL ${settlementPolicy.cooldownSeconds} SECOND)`)).orderBy(desc(tradePositions.settledAt)).limit(1))[0]:undefined; const user=(await db.select({packageName:users.packageName}).from(users).where(eq(users.id,userId)).limit(1))[0]; const controls=await ensureCustomerControls(userId); const walletSnapshot=await listBalances(userId); const hasAnyWalletFunds=walletSnapshot.some((balance:any)=>Number(balance.availableMinor||0)>0); if(!hasAnyWalletFunds) return {offers:[],missed:await listMissedOpportunities(userId),autoTrades:[],settled,delivery:{packageName:user?.packageName||"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,autoTradeEnabled:false,noWalletFunds:true,popupPolicy:{}}}; if(outstandingTrades>0){const nextTrade=(await db.select({settlesAt:tradePositions.settlesAt}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed"))).orderBy(tradePositions.settlesAt).limit(1))[0]; return {offers:[],missed:await listMissedOpportunities(userId),autoTrades:[],settled,delivery:{packageName:user?.packageName||"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,autoTradeEnabled:false,pausedUntilSettled:true,outstandingTrades,nextSettlementAt:nextTrade?.settlesAt||null,settlementDelaySeconds:settlementPolicy.delaySeconds,cooldownSeconds:settlementPolicy.cooldownSeconds}};} if(cooldownTrade){const cooldownUntil=new Date(new Date(cooldownTrade.settledAt as any).getTime()+settlementPolicy.cooldownSeconds*1000); return {offers:[],missed:await listMissedOpportunities(userId),autoTrades:[],settled,delivery:{packageName:user?.packageName||"",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,autoTradeEnabled:false,pausedUntilSettled:false,cooldownActive:true,cooldownUntil,cooldownSeconds:settlementPolicy.cooldownSeconds,outstandingTrades:0,settlementDelaySeconds:settlementPolicy.delaySeconds}};} const policies=await listOpportunityPackagePolicies(); const currencyRows=await listCurrencies(); const policy=policies.find(p=>p.packageName===(user?.packageName||"Starter")); if(!policy || controls.opportunitiesEnabled===false || controls.accountStatus!=="active" || !policy.enabled || policy.automaticDelivery===false) return { offers:[], missed:await listMissedOpportunities(userId), autoTrades:[], settled, delivery:{packageName:policy?.packageName || user?.packageName || "",maxPopupsPerDay:0,maxVisibleOffers:0,enabled:false,autoTradeEnabled:false,popupPolicy:{}} }; const popupPolicy={popupMinGapSeconds:Number(policy.minIntervalSeconds||45),popupDisplaySeconds:Number(policy.popupDisplayTargetSeconds||120),popupMaxPerHour:Number(policy.dailyPopupTarget||policy.maxPopupsPerDay||12),popupPreAlertProbabilityBps:0,popupPreAlertSeconds:0,popupWithdrawalProbabilityBps:0,popupJitterSeconds:Math.max(0,Number(policy.maxIntervalSeconds||3600)-Number(policy.minIntervalSeconds||45))}; const maxPopupsPerDay=Math.max(0,Number(policy.dailyPopupTarget ?? policy.maxPopupsPerDay)||0); const drainMode=(await getAppSetting("opportunity.drainMode")) === "true"; const now=new Date(); const offerRows=await db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt).limit(5000); const rules=await getCustomerOpportunityRules(userId); const inQuietHours=isWithinQuietHours(now,String(rules.quietHoursStart||""),String(rules.quietHoursEnd||"")); const candidateOffers=offerRows.map(offer=>{const packageMinimumNative=packageUsdUnitsToNativeMinor(Number(policy.minimumTradeUnits),String(offer.currency),currencyRows);const packageMaximumNative=packageUsdUnitsToNativeMinor(Number(policy.maximumTradeUnits),String(offer.currency),currencyRows);const packageMinimum=Math.max(Number(offer.minimumMinor),packageMinimumNative);const terms=calculateTradeTerms(userId,offer,packageMinimum);return {...offer,minimumMinor:Math.max(Number(terms.minimumMinor),packageMinimumNative),packageMinimumTradeMinor:packageMinimumNative,packageMaximumTradeMinor:packageMaximumNative,currencyRateUsd:Number(currencyRows.find((row:any)=>row.code===offer.currency)?.usdRate||0),currencyRateUpdatedAt:currencyRows.find((row:any)=>row.code===offer.currency)?.updatedAt||null,expectedRewardBps:terms.rewardBps,calculationMethod:terms.method};}).filter(offer=>offer.minimumMinor<=Number(offer.packageMaximumTradeMinor)&&isCustomerOpportunityAllowed({enabled:Boolean(rules.enabled),allowedAssets:String(rules.allowedAssets||""),currency:String(offer.currency),symbol:String(offer.symbol||""),rewardBps:Number(offer.expectedRewardBps),minimumRewardBps:Number(rules.minimumRewardBps)})); const quotaDay=new Date().toISOString().slice(0,10); const deliveredRows=await db.select({offerId:opportunityDeliveryEvents.offerId}).from(opportunityDeliveryEvents).where(and(eq(opportunityDeliveryEvents.userId,userId),eq(opportunityDeliveryEvents.quotaDay,quotaDay))); const deliveredIds=new Set(deliveredRows.map(row=>row.offerId)); const consumeDelivery=options.consumeDelivery !== false; const lastDelivery=Number(policy.postCompletionIntervalSeconds||0)>0?(await db.select({deliveredAt:opportunityDeliveryEvents.deliveredAt}).from(opportunityDeliveryEvents).where(eq(opportunityDeliveryEvents.userId,userId)).orderBy(desc(opportunityDeliveryEvents.deliveredAt)).limit(1))[0]:undefined; const formulaReadyAt=lastDelivery?new Date(new Date(lastDelivery.deliveredAt).getTime()+Number(policy.postCompletionIntervalSeconds||0)*1000):null; const formulaCooling=Boolean(formulaReadyAt&&formulaReadyAt.getTime()>Date.now()); const maxEligibleOffers=Math.max(0,Math.min(Number(policy.maxVisibleOffers)||0,maxPopupsPerDay)); const deliveryCandidates=candidateOffers.slice(0,maxEligibleOffers); const newlyEligible=consumeDelivery && !drainMode && !formulaCooling && !inQuietHours ? deliveryCandidates.filter(offer=>!deliveredIds.has(offer.id)) : []; if(newlyEligible.length){await db.insert(opportunityDeliveryEvents).values(newlyEligible.map(offer=>({userId,offerId:offer.id,quotaDay}))).onDuplicateKeyUpdate({set:{deliveredAt:new Date()}}); newlyEligible.forEach(offer=>deliveredIds.add(offer.id));} const balancesSnapshot=await listBalances(userId); const lifecycleIds=await ensurePopupDeliveries(newlyEligible.map(offer=>{const balance=balancesSnapshot.find(row=>row.currency===offer.currency); const available=Number(balance?.availableMinor||0); return {userId,offerId:offer.id,quotaDay,packageName:policy.packageName,symbol:offer.symbol,currency:offer.currency,minimumMinor:Number(offer.minimumMinor),expectedRewardBps:Number(offer.expectedRewardBps),balanceAvailableMinor:available,balanceStatus:available>=Number(offer.minimumMinor)?"sufficient": "insufficient",marketObservedAt:offer.marketObservedAt,marketSnapshotJson:JSON.stringify({symbol:offer.symbol,venueFrom:offer.venueFrom,venueTo:offer.venueTo,marketValueUsd:offer.marketValueUsd,sector:offer.sector,industry:offer.industry,listingStatus:offer.listingStatus,observedAt:offer.marketObservedAt})};})); const newlyEligibleIds=new Set(newlyEligible.map(item=>item.id)); const offers=candidateOffers.map(offer=>({...offer,deliveryEventId:lifecycleIds.get(`${userId}:${offer.id}:${quotaDay}`)||null,popupEligible:consumeDelivery && deliveredIds.has(offer.id)&&newlyEligibleIds.has(offer.id)})); const policyState=await getAutoTradePolicy(); void policyState; const effectiveControls={...controls,autoTradeEnabled:Boolean(policy.automaticTradingEnabled && controls.autoTradeMode!=="disabled")}; const auto=drainMode ? {executed:[],missed:await listMissedOpportunities(userId)} : await autoTradeOpenOpportunities(userId,offers,effectiveControls); const executedByOffer=new Map(auto.executed.map((trade:any)=>[trade.offerId,trade])); const enrichedOffers=offers.map((offer:any)=>({...offer,automaticTrade:executedByOffer.get(offer.id)||null})); return { offers:enrichedOffers, missed:auto.missed, autoTrades:auto.executed, settled, delivery:{packageName:policy.packageName,maxPopupsPerDay:maxEligibleOffers,maxVisibleOffers:maxEligibleOffers,drainMode,formulaCooling,formulaReadyAt,nextPopupFormulaDelaySeconds:Number(policy.postCompletionIntervalSeconds||0),rateProfile:{minHourlyTarget:policy.minHourlyTarget,normalHourlyTarget:policy.normalHourlyTarget,marketInfluenceBps:policy.marketInfluenceBps,burstEnabled:policy.burstEnabled,maxBurstSize:policy.maxBurstSize},enabled:true,autoTradeEnabled:Boolean(effectiveControls.autoTradeEnabled&&controls.tradingEnabled),popupPolicy} }; }
export async function runAutoTradeCycle(){const db=await getDb();if(!db)throw new Error("Database is not available");const customers=await db.select({id:users.id}).from(users).where(eq(users.role,"user"));let allocations=0;for(const customer of customers){try{const result=await listCustomerOpportunities(customer.id,{consumeDelivery:false});allocations+=result.autoTrades.length;}catch(error){console.error(`[AutoTrade] Customer ${customer.id} cycle failed:`,error instanceof Error?error.message:error);}}return {customers:customers.length,allocations};}
export async function setCustomerPackage(email:string, packageName:string) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const normalized=email.trim().toLowerCase(); const user=(await db.select().from(users).where(eq(users.email,normalized)).limit(1))[0]; if(!user) throw new Error("Customer account not found"); await db.update(users).set({packageName}).where(eq(users.id,user.id)); return {id:user.id,email:user.email,packageName}; }
export async function createTrade(userId:number,input:{offerId:number;amountMinor:number;deliveryEventId?:number}){
 const db=await getDb();if(!db)throw new Error("Database is not available");
 return db.transaction(async tx=>{
  // Serialize allocations for one customer. This makes daily caps and active-trade
  // checks safe when multiple workers attempt automatic trades concurrently.
  const userLock=await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`) as any;
  if(!userLock?.[0]?.length) throw new Error("Customer account not found");
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
  const userRecord=(await tx.select({packageName:users.packageName}).from(users).where(eq(users.id,userId)).limit(1))[0]; const packagePolicy=(await tx.select().from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName,userRecord?.packageName||"Starter")).limit(1))[0]; if(!packagePolicy) throw new Error("Customer package policy is not configured");
  if (!packagePolicy.enabled) throw new Error("This package is currently disabled");
  const activeRows=await tx.select({id:tradePositions.id}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.status,"confirmed"))).limit(Number(packagePolicy.maxConcurrentActiveTrades||1)+1);
  if (activeRows.length >= Number(packagePolicy.maxConcurrentActiveTrades||1)) throw new Error("Package maximum concurrent active trades reached");
  const today=new Date().toISOString().slice(0,10);
  const attemptRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND DATE(confirmedAt)=${today}`) as any;
  if (Number(attemptRows?.[0]?.[0]?.count||0) >= Number(packagePolicy.maxTradeAttemptsPerDay||0) && Number(packagePolicy.maxTradeAttemptsPerDay||0)>0) throw new Error("Package daily trade-attempt limit reached");
  const successfulRows=await tx.execute(sql`SELECT COUNT(*) AS count FROM trade_positions WHERE userId=${userId} AND status='settled' AND DATE(confirmedAt)=${today}`) as any;
  if (Number(successfulRows?.[0]?.[0]?.count||0) >= Number(packagePolicy.maxSuccessfulTradesPerDay||0) && Number(packagePolicy.maxSuccessfulTradesPerDay||0)>0) throw new Error("Package daily successful-trade limit reached"); const currencyRow=(await tx.select({scale:currencyRegistry.scale,usdRate:currencyRegistry.usdRate,updatedAt:currencyRegistry.updatedAt}).from(currencyRegistry).where(eq(currencyRegistry.code,offer.currency)).limit(1))[0]; if(!currencyRow) throw new Error(`Currency ${offer.currency} is not configured`); const nativeFactor=Math.pow(10,Number(currencyRow.scale)); const nativeRate=Number(currencyRow.usdRate); if(!Number.isFinite(nativeRate)||nativeRate<=0) throw new Error(`Currency ${offer.currency} has no valid conversion rate`); const packageMinimumNative=usdUnitsToNativeMinor(Number(packagePolicy.minimumTradeUnits),Number(currencyRow.scale),nativeRate); const packageMaximumNative=Math.max(packageMinimumNative,usdUnitsToNativeMinor(Number(packagePolicy.maximumTradeUnits),Number(currencyRow.scale),nativeRate)); const terms=calculateTradeTerms(userId,offer,input.amountMinor); assertTradeAmountWithinBounds(input.amountMinor,{minimumTradeMinor:Math.max(packageMinimumNative,Number(terms.minimumMinor)),maximumTradeMinor:packageMaximumNative},Number(offer.minimumMinor));
  const already=await tx.select({id:tradePositions.id}).from(tradePositions).where(and(eq(tradePositions.userId,userId),eq(tradePositions.offerId,input.offerId))).limit(1);
  if(already[0]) throw new Error("This opportunity has already been allocated");
  // Lock the relevant wallet row as a second line of defence against concurrent
  // debits, including writers that do not participate in the user-level lock.
  const walletLock=await tx.execute(sql`SELECT id FROM customer_balances WHERE userId=${userId} AND currency=${offer.currency} FOR UPDATE`) as any;
  const bal=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,userId),eq(customerBalances.currency,offer.currency))).limit(1))[0];
  if(!walletLock?.[0]?.length || !bal || bal.availableMinor<input.amountMinor) throw new Error("Insufficient available balance");
  const customerRules=(await tx.select({maxDailyAllocationMinor:customerOpportunityRules.maxDailyAllocationMinor}).from(customerOpportunityRules).where(eq(customerOpportunityRules.userId,userId)).limit(1))[0];
  const dailyAllocationLimit=Number(customerRules?.maxDailyAllocationMinor ?? 100000);
  const dailyAllocationRows=await tx.execute(sql`SELECT COALESCE(SUM(principalMinor),0) AS allocatedMinor FROM trade_positions WHERE userId=${userId} AND currency=${offer.currency} AND DATE(confirmedAt)=${today} AND status <> 'cancelled'`) as any;
  const alreadyAllocatedMinor=Number(dailyAllocationRows?.[0]?.[0]?.allocatedMinor||0);
  if(!isWithinDailyAllocationLimit({limitMinor:dailyAllocationLimit,alreadyAllocatedMinor,requestedMinor:input.amountMinor})) throw new Error("Customer daily allocation limit reached for this currency");
  const uncappedReward=Math.floor(input.amountMinor*terms.rewardBps/10000);
  const reward=Number(packagePolicy.maxRewardPerTradeMinor||0)>0?Math.min(uncappedReward,Number(packagePolicy.maxRewardPerTradeMinor)):uncappedReward;
  if (Number(packagePolicy.minimumRewardBps||0)>terms.rewardBps) throw new Error("Opportunity reward rate is below the package minimum");
  if (Number(packagePolicy.maxDailyRewardMinor||0)>0) {
    const reservationRows=await tx.execute(sql`SELECT COALESCE(SUM(reservedMinor),0) AS reserved FROM trade_reward_reservations WHERE userId=${userId} AND windowKey=${today} AND status='reserved'`) as any;
    const creditedRows=await tx.execute(sql`SELECT COALESCE(SUM(amountMinor),0) AS credited FROM balance_ledger WHERE userId=${userId} AND entryType='trade_reward' AND DATE(createdAt)=${today}`) as any;
    const reserved=Number(reservationRows?.[0]?.[0]?.reserved||0), credited=Number(creditedRows?.[0]?.[0]?.credited||0);
    if (remainingRewardAllowance(Number(packagePolicy.maxDailyRewardMinor),credited,reserved)<reward) throw new Error("Daily reward cap reached for this package");
  }
  const balanceUpdate=await tx.update(customerBalances).set({availableMinor:sql`${customerBalances.availableMinor}-${input.amountMinor}`,lockedMinor:sql`${customerBalances.lockedMinor}+${input.amountMinor}`,updatedAt:new Date()}).where(and(eq(customerBalances.id,bal.id),gte(customerBalances.availableMinor,input.amountMinor)));
  if(Number((balanceUpdate as any)[0]?.affectedRows||0)!==1) throw new Error("Insufficient available balance");
  const ref=`trade-${offer.id}-${userId}-${Date.now()}`;
  await tx.insert(balanceLedger).values({userId,currency:offer.currency,amountMinor:-input.amountMinor,entryType:"trade_reservation",reference:ref,withdrawable:false});
  const settlementDelaySeconds=Math.max(Number(packagePolicy.minSettlementDelaySeconds||0),Math.min(Number(packagePolicy.maxSettlementDelaySeconds||settlementPolicy.delaySeconds),settlementPolicy.delaySeconds)); const creditAt=new Date(Date.now()+(settlementDelaySeconds+settlementPolicy.creditDelaySeconds)*1000); const settlesAt=new Date(Date.now()+settlementDelaySeconds*1000); const result=await tx.insert(tradePositions).values({userId,offerId:offer.id,currency:offer.currency,principalMinor:input.amountMinor,expectedRewardMinor:reward,rewardReservedMinor:reward,settlesAt,creditAt,lifecycleStage:"Trade Allocated",settlementStatus:"pending",policyVersion:Number(packagePolicy.policyVersion||1)} as any);
  const tradeId=Number(result[0].insertId);
  await tx.insert(tradeLifecycleEvents).values({tradeId,userId,eventType:"trade_allocated",stage:"Trade Allocated",payloadJson:JSON.stringify({amountMinor:input.amountMinor,currency:offer.currency,policyVersion:Number(packagePolicy.policyVersion||1)})});
  if(input.deliveryEventId!==undefined) await tx.update(opportunityPopupEvents).set({tradeId,eventStatus:"TRADED",tradedAt:new Date(),updatedAt:new Date()}).where(and(eq(opportunityPopupEvents.id,input.deliveryEventId),eq(opportunityPopupEvents.userId,userId),eq(opportunityPopupEvents.offerId,offer.id)));
  else await tx.execute(sql`UPDATE opportunity_popup_events SET tradeId=${tradeId},eventStatus='TRADED',deliveryStatus=CASE WHEN deliveryStatus='failed' THEN deliveryStatus ELSE 'rendered' END,tradedAt=COALESCE(tradedAt,CURRENT_TIMESTAMP),updatedAt=CURRENT_TIMESTAMP WHERE userId=${userId} AND offerId=${offer.id} ORDER BY deliveredAt DESC LIMIT 1`);
  if(Number(packagePolicy.maxDailyRewardMinor||0)>0) await tx.execute(sql`INSERT INTO trade_reward_reservations (userId,tradeId,packageName,windowKey,currency,reservedMinor,status) VALUES (${userId},${tradeId},${packagePolicy.packageName},${today},${offer.currency},${reward},'reserved')`);
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
    const stage=settled?"Trade Completed":pending?"Trade Allocated":new Date(row.settlesAt).getTime()<=Date.now()?"Settlement Processing":"Trade Executing";
    return {
      ...row,
      tradeReference:`trade-${row.id}`,
      opportunityReference:`opportunity-${row.offerId}`,
      stage,
      settlementStatus:settled?"completed":row.status,
      rewardCredited:settled,
      creditedRewardMinor:settled?Number(row.expectedRewardMinor):0,
      walletUpdated:settled,
      completionAt:settled?row.settledAt:null,
      transactionReference:settled?`trade-settlement:${row.id}`:null,
    };
  });
}
export async function settleDueTrades(_userId:number){
  // Settlement is deliberately not timer-driven. The PDF requires an administrator
  // to confirm the manually calculated result before wallet crediting.
  return [];
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
export async function manuallySettleTrade(tradeId:number, adminId:number, input:{rewardMinor:number; settlementReference:string; notes?:string}){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  if(!Number.isSafeInteger(input.rewardMinor)||input.rewardMinor<0) throw new Error("Manual reward must be a non-negative integer");
  if(!input.settlementReference.trim()) throw new Error("A manual settlement reference is required");
  const result=await db.transaction(async tx=>{
    const trade=(await tx.select().from(tradePositions).where(eq(tradePositions.id,tradeId)).limit(1))[0];
    if(!trade) throw new Error("Trade not found");
    if(trade.status!=="confirmed"||trade.settlementStatus!=="pending") throw new Error("Trade is not pending manual settlement");
    if(input.rewardMinor>Number(trade.rewardReservedMinor||0)) throw new Error("Manual reward exceeds the reserved package reward");
    const reference=input.settlementReference.trim();
    const duplicate=(await tx.select({id:tradePositions.id}).from(tradePositions).where(eq(tradePositions.settlementReference,reference)).limit(1))[0];
    if(duplicate) throw new Error("Settlement reference has already been used");
    const wallet=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,trade.userId),eq(customerBalances.currency,trade.currency))).limit(1))[0];
    if(!wallet) throw new Error("Customer settlement wallet is not configured");
    const principal=Number(trade.principalMinor);
    const total=principal+input.rewardMinor;
    await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:principal,entryType:"trade_principal_release",reference:`${reference}:principal`,withdrawable:false});
    if(input.rewardMinor>0) await tx.insert(balanceLedger).values({userId:trade.userId,currency:trade.currency,amountMinor:input.rewardMinor,entryType:"trade_reward",reference:`${reference}:reward`,withdrawable:false});
    const walletUpdate=await tx.update(customerBalances).set({availableMinor:sql`${customerBalances.availableMinor}+${total}`,lockedMinor:sql`GREATEST(${customerBalances.lockedMinor}-${principal},0)`,earnedMinor:sql`${customerBalances.earnedMinor}+${input.rewardMinor}`,updatedAt:new Date()}).where(eq(customerBalances.id,wallet.id));
    assertExactlyOneAffectedRow(walletUpdate,"Manual settlement wallet update");
    const settlementUpdate=await tx.update(tradePositions).set({status:"settled",settledAt:new Date(),lifecycleStage:"Trade Completed",settlementStatus:"completed",rewardCreditedMinor:input.rewardMinor,rewardReservedMinor:0,walletUpdatedAt:new Date(),completionAt:new Date(),transactionReference:reference,settlementReference:reference,settlementConfirmedAt:new Date(),settlementConfirmedBy:adminId,settlementNotes:input.notes?.trim()||null}).where(and(eq(tradePositions.id,tradeId),eq(tradePositions.status,"confirmed"),eq(tradePositions.settlementStatus,"pending")));
    // If another settlement won the race, throw inside the transaction so the
    // preceding wallet and ledger mutations are rolled back together.
    assertExactlyOneAffectedRow(settlementUpdate,"Manual trade settlement state transition");
    await tx.update(tradeRewardReservations).set({status:"credited",updatedAt:new Date()}).where(and(eq(tradeRewardReservations.tradeId,tradeId),eq(tradeRewardReservations.status,"reserved")));
    await tx.insert(tradeLifecycleEvents).values({tradeId,userId:trade.userId,eventType:"manual_settlement_confirmed",stage:"Wallet Updated",payloadJson:JSON.stringify({principalMinor:principal,rewardMinor:input.rewardMinor,reference,adminId})});
    await tx.insert(tradeLifecycleEvents).values({tradeId,userId:trade.userId,eventType:"trade_completed",stage:"Trade Completed",payloadJson:JSON.stringify({reference})});
    return {tradeId, userId:trade.userId, offerId:trade.offerId, currency:trade.currency, principalMinor:principal, rewardMinor:input.rewardMinor, totalMinor:total, reference};
  });
  await updatePopupLifecycleForOffer(result.userId,result.offerId,"settled");
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
