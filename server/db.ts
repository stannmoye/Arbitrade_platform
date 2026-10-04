import crypto from "node:crypto";
import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, appSettings, customerBalances, currencyRegistry, customerControls, customerNotifications, customerSessions, balanceLedger, tradePositions, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
export async function getTicketUploadPolicy() {
  const max = Number(await getAppSetting("ticket.maxAttachmentMb", "25"));
  const types = (await getAppSetting("ticket.allowedMimeTypes", "image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx"))!.split(",").map(v => v.trim()).filter(Boolean);
  return { maxAttachmentMb: Number.isFinite(max) && max > 0 ? Math.min(max, 100) : 25, allowedMimeTypes: types };
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
export async function createTicket(userId:number,input:{subject:string;body:string;priority:"low"|"normal"|"high"|"urgent"}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const ticketNumber=`ARB-${Date.now().toString(36).toUpperCase()}`; const result=await db.insert(supportTickets).values({ticketNumber,customerId:userId,subject:input.subject,priority:input.priority}); const ticketId=Number(result[0].insertId); await db.insert(supportMessages).values({ticketId,authorId:userId,body:input.body}); return {ticketId,ticketNumber}; }
export async function listCustomerTickets(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(supportTickets).where(eq(supportTickets.customerId,userId)).orderBy(desc(supportTickets.updatedAt)); }
export async function listAllTickets() { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)); }
export async function addTicketMessage(actorId:number,ticketId:number,body:string,status?:"open"|"answered"|"resolved"|"closed") { const db=await getDb(); if(!db) throw new Error("Database is not available"); const ticket=(await db.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1))[0]; if(!ticket) throw new Error("Ticket not found"); await db.insert(supportMessages).values({ticketId,authorId:actorId,body}); if(status) await db.update(supportTickets).set({status}).where(eq(supportTickets.id,ticketId)); }
export async function listTicketMessages(ticketId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(supportMessages).where(eq(supportMessages.ticketId,ticketId)).orderBy(supportMessages.createdAt); }
export async function createNotification(userId:number,title:string,body:string) { const db=await getDb(); if(!db) throw new Error("Database is not available"); await db.insert(customerNotifications).values({userId,title,body}); }
export async function listNotifications(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); return db.select().from(customerNotifications).where(eq(customerNotifications.userId,userId)).orderBy(desc(customerNotifications.createdAt)); }

export async function addTicketAttachment(userId:number,input:{ticketId:number;fileName:string;mimeType:string;sizeBytes:number;storageKey:string}) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const ticket=(await db.select().from(supportTickets).where(and(eq(supportTickets.id,input.ticketId),eq(supportTickets.customerId,userId))).limit(1))[0]; if(!ticket) throw new Error("Ticket not found"); await db.insert(supportAttachments).values({ticketId:input.ticketId,uploadedBy:userId,fileName:input.fileName,mimeType:input.mimeType,sizeBytes:input.sizeBytes,storageKey:input.storageKey}); return {success:true}; }

// Controlled opportunity engine: this is an internal paper-ledger boundary. Real execution requires licensed providers/custody.
import { opportunityOffers, opportunityPackagePolicies } from "../drizzle/schema";

export async function provisionSignupCredit(userId:number) {
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const amount=Number(await getAppSetting("signup.autoCreditMinor","1000"));
  const currency=(await getAppSetting("signup.autoCreditCurrency","USD")) || "USD";
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
export async function listBalances(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");const currencies=await listCurrencies();const existing=await db.select().from(customerBalances).where(eq(customerBalances.userId,userId));const byCode=new Map(existing.map(x=>[x.currency,x]));return currencies.map(c=>byCode.get(c.code)||{id:0,userId,currency:c.code,availableMinor:0,promotionalMinor:0,earnedMinor:0,updatedAt:null});}
export async function getCustomerBalanceSummary(userId:number){const currencies=await listCurrencies();const balances=await listBalances(userId);const byCode=new Map(balances.map(x=>[x.currency,x]));let availableUsd=0,promotionalUsd=0,earnedUsd=0;for(const c of currencies){const b=byCode.get(c.code);const factor=Math.pow(10,c.scale);const rate=Number(c.usdRate)||0;availableUsd+=(Number(b?.availableMinor||0)/factor)*rate;promotionalUsd+=(Number(b?.promotionalMinor||0)/factor)*rate;earnedUsd+=(Number(b?.earnedMinor||0)/factor)*rate;}return {balances,currencies,summary:{availableUsd,promotionalUsd,earnedUsd,totalUsd:availableUsd+earnedUsd}};}
export async function listAdminCustomers(){
  const db=await getDb(); if(!db) throw new Error("Database is not available");
  const rows=await db.select({id:users.id,name:users.name,email:users.email,packageName:users.packageName,role:users.role,createdAt:users.createdAt}).from(users).orderBy(desc(users.createdAt));
  const controls=await db.select().from(customerControls); const byUser=new Map(controls.map(row=>[row.userId,row]));
  return rows.filter(row=>row.role!=="admin").map(row=>{const c=byUser.get(row.id); return {id:row.id,name:row.name||row.email||"Customer",email:row.email||"",package:row.packageName,group:row.packageName,status:c?.accountStatus||"active",accountState:c?.accountStatus||"active",opportunities:"Database delivery",opportunitiesEnabled:c?.opportunitiesEnabled??true,limit:c?.dailyTradeLimitMinor??2500000,kyc:c?.kycRequired??true,withdrawals:c?.withdrawalsEnabled??false,twofa:c?.twoFactorRequired??false,facial:false,tradingEnabled:c?.tradingEnabled??true,emailVerified:c?.emailVerified??false,riskTier:c?.riskTier||"standard",adminNote:c?.adminNote||"",createdAt:row.createdAt};});
}
export async function createAdminCustomer(input:{name:string;email:string;password:string;packageName:"Starter"|"Growth"|"Pro"|"Institutional"}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();if(input.password.length<10)throw new Error("Customer password must be at least 10 characters");const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing)throw new Error("A customer with this email already exists");const salt=crypto.randomBytes(16).toString("hex");const digest=crypto.scryptSync(input.password,salt,32).toString("hex");const result=await db.insert(users).values({openId:`local:customer:${crypto.randomUUID()}`,name:input.name.trim(),email,loginMethod:"password",role:"user",passwordHash:`scrypt$${salt}$${digest}`,packageName:input.packageName});const id=Number(result[0].insertId);await db.insert(customerControls).values({userId:id});return {id,email,name:input.name.trim(),packageName:input.packageName};}
export async function updateAdminCustomer(input:{id:number;name:string;email:string;packageName:"Starter"|"Growth"|"Pro"|"Institutional"}){const db=await getDb();if(!db)throw new Error("Database is not available");const email=input.email.trim().toLowerCase();const existing=(await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1))[0];if(existing&&existing.id!==input.id)throw new Error("That email is already used by another account");await db.update(users).set({name:input.name.trim(),email,packageName:input.packageName}).where(and(eq(users.id,input.id),eq(users.role,"user")));return {success:true};}
export async function updateCustomerControls(adminId:number,input:{userId:number;accountStatus?:"active"|"suspended"|"restricted";tradingEnabled?:boolean;opportunitiesEnabled?:boolean;withdrawalsEnabled?:boolean;kycRequired?:boolean;twoFactorRequired?:boolean;emailVerified?:boolean;riskTier?:string;dailyTradeLimitMinor?:number;adminNote?:string}){const db=await getDb();if(!db)throw new Error("Database is not available");const existing=(await db.select().from(customerControls).where(eq(customerControls.userId,input.userId)).limit(1))[0];const values:any={...input};delete values.userId;if(existing)await db.update(customerControls).set({...values,updatedBy:adminId}).where(eq(customerControls.userId,input.userId));else await db.insert(customerControls).values({userId:input.userId,updatedBy:adminId,...values});return {success:true};}
export async function deleteAdminCustomer(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");await db.transaction(async tx=>{await tx.delete(customerControls).where(eq(customerControls.userId,userId));await tx.delete(customerBalances).where(eq(customerBalances.userId,userId));await tx.delete(balanceLedger).where(eq(balanceLedger.userId,userId));await tx.delete(tradePositions).where(eq(tradePositions.userId,userId));await tx.delete(customerNotifications).where(eq(customerNotifications.userId,userId));await tx.delete(customerSessions).where(eq(customerSessions.userId,userId));await tx.delete(users).where(and(eq(users.id,userId),eq(users.role,"user")));});return {success:true};}
export async function adjustCustomerBalance(adminId:number,input:{userId:number;currency:string;amountMinor:number;mode:"credit"|"debit";reason:string}){const db=await getDb();if(!db)throw new Error("Database is not available");if(input.amountMinor<=0)throw new Error("Amount must be positive");return db.transaction(async tx=>{const user=(await tx.select({id:users.id}).from(users).where(and(eq(users.id,input.userId),eq(users.role,"user"))).limit(1))[0];if(!user)throw new Error("Customer account not found");const currency=(await tx.select().from(currencyRegistry).where(and(eq(currencyRegistry.code,input.currency.toUpperCase()),eq(currencyRegistry.enabled,true))).limit(1))[0];if(!currency)throw new Error(`Currency ${input.currency} is not enabled. Add it in Currency registry first.`);const balance=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1))[0];const current=balance?.availableMinor||0;const next=input.mode==="credit"?current+input.amountMinor:current-input.amountMinor;if(next<0)throw new Error("Debit exceeds available wallet balance");if(balance)await tx.update(customerBalances).set({availableMinor:next,promotionalMinor:input.mode==="credit"?balance.promotionalMinor+input.amountMinor:balance.promotionalMinor}).where(eq(customerBalances.id,balance.id));else await tx.insert(customerBalances).values({userId:input.userId,currency:currency.code,availableMinor:input.amountMinor,promotionalMinor:input.mode==="credit"?input.amountMinor:0,earnedMinor:0});await tx.insert(balanceLedger).values({userId:input.userId,currency:currency.code,amountMinor:input.mode==="credit"?input.amountMinor:-input.amountMinor,entryType:`admin_${input.mode}`,reference:`admin-${adminId}-${Date.now()}`,withdrawable:false});await tx.insert(customerNotifications).values({userId:input.userId,title:`Wallet ${input.mode}ed`,body:`An administrator ${input.mode}ed ${input.amountMinor} minor units to your ${currency.code} wallet. Reason: ${input.reason}`});return {success:true,newAvailableMinor:next,currency:currency.code};});}
export async function listOpenOffers(){const db=await getDb();if(!db)throw new Error("Database is not available");const now=new Date();return db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt);}
const defaultPackagePolicies = [{ packageName: "Starter", maxPopupsPerMinute: 10, maxVisibleOffers: 10, enabled: true }, { packageName: "Growth", maxPopupsPerMinute: 30, maxVisibleOffers: 30, enabled: true }, { packageName: "Pro", maxPopupsPerMinute: 50, maxVisibleOffers: 50, enabled: true }, { packageName: "Institutional", maxPopupsPerMinute: 100, maxVisibleOffers: 100, enabled: true }];
export async function ensureOpportunityPackagePolicies() { const db=await getDb(); if(!db) throw new Error("Database is not available"); for (const policy of defaultPackagePolicies) await db.insert(opportunityPackagePolicies).values(policy).onDuplicateKeyUpdate({ set: { maxPopupsPerMinute: policy.maxPopupsPerMinute, maxVisibleOffers: policy.maxVisibleOffers } }); return db.select().from(opportunityPackagePolicies); }
export async function listOpportunityPackagePolicies() { const db=await getDb(); if(!db) throw new Error("Database is not available"); const rows=await db.select().from(opportunityPackagePolicies); return rows.length ? rows : ensureOpportunityPackagePolicies(); }
export async function updateOpportunityPackagePolicies(updatedBy:number, policies:{packageName:string;maxPopupsPerMinute:number;maxVisibleOffers:number;enabled:boolean}[]) { const db=await getDb(); if(!db) throw new Error("Database is not available"); for (const policy of policies) await db.insert(opportunityPackagePolicies).values({...policy,updatedBy}).onDuplicateKeyUpdate({set:{maxPopupsPerMinute:policy.maxPopupsPerMinute,maxVisibleOffers:policy.maxVisibleOffers,enabled:policy.enabled,updatedBy}}); return listOpportunityPackagePolicies(); }
export async function listCustomerOpportunities(userId:number) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const user=(await db.select({packageName:users.packageName}).from(users).where(eq(users.id,userId)).limit(1))[0]; const controls=(await db.select({opportunitiesEnabled:customerControls.opportunitiesEnabled,accountStatus:customerControls.accountStatus}).from(customerControls).where(eq(customerControls.userId,userId)).limit(1))[0]; const policies=await listOpportunityPackagePolicies(); const policy=policies.find(p=>p.packageName===(user?.packageName||"Starter")) || policies.find(p=>p.packageName==="Starter") || defaultPackagePolicies[0]; if(controls?.opportunitiesEnabled===false || controls?.accountStatus!=="active" || !policy.enabled) return { offers:[], delivery:{packageName:policy.packageName,maxPopupsPerMinute:0,maxVisibleOffers:0,enabled:false} }; const globalFrequency=Number(await getAppSetting("opportunity.frequencyPerMinute","30")); const maxPopupsPerMinute=Math.min(policy.maxPopupsPerMinute,Number.isFinite(globalFrequency)&&globalFrequency>0?globalFrequency:policy.maxPopupsPerMinute); const now=new Date(); const offers=await db.select().from(opportunityOffers).where(and(eq(opportunityOffers.status,"open"),lte(opportunityOffers.opensAt,now),gt(opportunityOffers.closesAt,now))).orderBy(opportunityOffers.closesAt).limit(policy.maxVisibleOffers); return { offers, delivery:{packageName:policy.packageName,maxPopupsPerMinute,maxVisibleOffers:policy.maxVisibleOffers,enabled:true} }; }
export async function setCustomerPackage(email:string, packageName:string) { const db=await getDb(); if(!db) throw new Error("Database is not available"); const normalized=email.trim().toLowerCase(); const user=(await db.select().from(users).where(eq(users.email,normalized)).limit(1))[0]; if(!user) throw new Error("Customer account not found"); await db.update(users).set({packageName}).where(eq(users.id,user.id)); return {id:user.id,email:user.email,packageName}; }
export async function createTrade(userId:number,input:{offerId:number;amountMinor:number}){
 const db=await getDb();if(!db)throw new Error("Database is not available");
 return db.transaction(async tx=>{
  const offer=(await tx.select().from(opportunityOffers).where(and(eq(opportunityOffers.id,input.offerId),eq(opportunityOffers.status,"open"))).limit(1))[0];
  if(!offer || new Date(offer.closesAt).getTime()<=Date.now()) throw new Error("This opportunity is no longer open");
  if(input.amountMinor<offer.minimumMinor) throw new Error("Amount is below the minimum investment");
  const bal=(await tx.select().from(customerBalances).where(and(eq(customerBalances.userId,userId),eq(customerBalances.currency,offer.currency))).limit(1))[0];
  if(!bal || bal.availableMinor<input.amountMinor) throw new Error("Insufficient available balance");
  const reward=Math.floor(input.amountMinor*offer.expectedRewardBps/10000);
  await tx.update(customerBalances).set({availableMinor:bal.availableMinor-input.amountMinor}).where(eq(customerBalances.id,bal.id));
  const ref=`trade-${offer.id}-${userId}-${Date.now()}`;
  await tx.insert(balanceLedger).values({userId,currency:offer.currency,amountMinor:-input.amountMinor,entryType:"trade_reservation",reference:ref,withdrawable:false});
  const result=await tx.insert(tradePositions).values({userId,offerId:offer.id,currency:offer.currency,principalMinor:input.amountMinor,expectedRewardMinor:reward,settlesAt:offer.rewardAt});
  return {tradeId:Number(result[0].insertId),rewardMinor:reward,settlesAt:offer.rewardAt,currency:offer.currency};
 });
}
export async function listTrades(userId:number){const db=await getDb();if(!db)throw new Error("Database is not available");return db.select().from(tradePositions).where(eq(tradePositions.userId,userId)).orderBy(tradePositions.confirmedAt);}
/**
 * Legacy paper-trade settlement is deliberately fail-closed. The old table stores
 * an expected reward, not a provider-verified result, so it must never credit a
 * customer balance as real profit. The V5 verified-settlement workflow is the only
 * supported path for future provider-backed settlement.
 */
export async function settleTrade(_tradeId:number){
  return false;
}
export async function createOpportunityOffer(input:{symbol:string;venueFrom:string;venueTo:string;currency:"USD"|"EUR"|"GBP"|"BTC"|"ETH";minimumMinor:number;expectedRewardBps:number;durationSeconds:number}){const db=await getDb();if(!db)throw new Error("Database is not available");const now=new Date();const closesAt=new Date(now.getTime()+input.durationSeconds*1000);const result=await db.insert(opportunityOffers).values({...input,opensAt:now,closesAt,rewardAt:closesAt,status:"open"});return {id:Number(result[0].insertId),...input,opensAt:now,closesAt,rewardAt:closesAt};}

export async function bulkCreateOpportunityOffers(inputs:{symbol:string;venueFrom:string;venueTo:string;currency:"USD"|"EUR"|"GBP"|"BTC"|"ETH";minimumMinor:number;expectedRewardBps:number;durationSeconds:number;opensAt?:Date;closesAt?:Date;rewardAt?:Date}[]) { const db=await getDb(); if(!db) throw new Error("Database is not available"); if(!inputs.length) return {created:0}; const rows=inputs.map(input=>{const opensAt=input.opensAt||new Date(); const closesAt=input.closesAt||new Date(opensAt.getTime()+input.durationSeconds*1000); return {...input,opensAt,closesAt,rewardAt:input.rewardAt||closesAt,status:"open" as const};}); await db.insert(opportunityOffers).values(rows); return {created:rows.length}; }
