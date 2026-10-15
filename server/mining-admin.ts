import Decimal from "decimal.js";
import { calculatePackageDailyRate, type MiningCalculationModel } from "./mining-rules";
import {
  Db, MiningError, amountString, assertMiningAsset, assetScale, beginMiningIdempotency, createMiningLedgerTransaction, createMiningNotification,
  decimal, ensureMiningCheckpoint, finishMiningIdempotency, getMiningAssetRate, inMiningTransaction, loadMiningConfig, postMiningLedgerEntries,
  addUtcMonths, requestKey, requireActiveMiningAccount, writeMiningAudit, withMiningConnection,
} from "./mining-store";
import { refreshMarketData } from "./marketSync";

const DISCLOSURE_TERMS = (text: string) => /simulat|simulation/i.test(text) && /(not withdrawable|non[- ]withdrawable|no cash payout|not a cash payout|no real payout)/i.test(text);
const byDate = (value: unknown) => value ? new Date(value as string | Date).toISOString() : null;
const stringDecimal = (value: unknown) => decimal(value).toString();

function assertSandboxMiningDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new MiningError("No-charge mining grants are restricted to the isolated sandbox database");
  try {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
    if (url.protocol !== "mysql:" || !loopback || database !== "arbitrade_sandbox") {
      throw new MiningError("No-charge mining grants are restricted to the isolated sandbox database");
    }
  } catch (error) {
    if (error instanceof MiningError) throw error;
    throw new MiningError("No-charge mining grants are restricted to the isolated sandbox database");
  }
}

function requiredReason(reason: string, label = "Reason") {
  const value = String(reason || "").trim();
  if (value.length < 10 || value.length > 2000) throw new MiningError(`${label} must be between 10 and 2,000 characters`);
  return value;
}

function exactAmount(value: string, asset: string, label: string, allowZero = false) {
  const amount = decimal(value);
  if (allowZero ? amount.isNegative() : !amount.gt(0)) throw new MiningError(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}`);
  if (!amount.toDecimalPlaces(assetScale(asset), Decimal.ROUND_DOWN).eq(amount)) throw new MiningError(`${label} exceeds ${asset} precision (${assetScale(asset)} decimal places)`);
  return amount;
}

function validatePackageInput(input: any) {
  const code = String(input.code || "").trim().toUpperCase();
  const name = String(input.name || "").trim();
  const displayOrder = Number(input.displayOrder);
  const durationMonths = Number(input.durationMonths);
  const expectedDailyRewardCki = input.expectedDailyRewardCki === null || input.expectedDailyRewardCki === undefined || input.expectedDailyRewardCki === "" ? null : decimal(input.expectedDailyRewardCki);
  const priceAsset = assertMiningAsset(input.priceAsset);
  const price = exactAmount(String(input.priceAmount), priceAsset, "Package price");
  const baseThs = decimal(input.baseThs);
  const boostBonusThs = decimal(String(input.boostBonusThs));
  const maxPerCustomer = Number(input.maxPerCustomer);
  const boostDurationSeconds = input.boostDurationSeconds === null || input.boostDurationSeconds === undefined || input.boostDurationSeconds === "" ? null : Number(input.boostDurationSeconds);
  const stackingPolicy = input.stackingPolicy;
  const termsText = String(input.termsText || "").trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,47}$/.test(code)) throw new MiningError("Package code must be 2–48 uppercase letters, numbers, underscores, or hyphens");
  if (name.length < 2 || name.length > 120) throw new MiningError("Package name must be 2–120 characters");
  if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 10_000) throw new MiningError("Display order must be between 1 and 10,000");
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) throw new MiningError("Package duration must be between 1 and 120 months");
  if (expectedDailyRewardCki && (expectedDailyRewardCki.isNegative() || expectedDailyRewardCki.gt("1000000000000") || !expectedDailyRewardCki.toDecimalPlaces(18,Decimal.ROUND_DOWN).eq(expectedDailyRewardCki))) throw new MiningError("Expected daily CKI reward must be zero or greater with at most 18 decimal places");
  if (baseThs.lte(0) || baseThs.gt("1000000000000") || !baseThs.toDecimalPlaces(12,Decimal.ROUND_DOWN).eq(baseThs)) throw new MiningError("Base hash power must be positive and support at most 12 decimal places");
  if (boostBonusThs.isNegative() || boostBonusThs.gt("1000000000000") || !boostBonusThs.toDecimalPlaces(12,Decimal.ROUND_DOWN).eq(boostBonusThs)) throw new MiningError("Boost hash power must be zero or positive and support at most 12 decimal places");
  if (!Number.isInteger(maxPerCustomer) || maxPerCustomer < 0 || maxPerCustomer > 100_000) throw new MiningError("Maximum purchases per customer must be between 0 and 100,000 (0 means unlimited)");
  if (boostDurationSeconds !== null && (!Number.isInteger(boostDurationSeconds) || boostDurationSeconds < 10 || boostDurationSeconds > 31_536_000)) throw new MiningError("Boost duration must be between 10 seconds and one year");
  if (!["stack","replace"].includes(stackingPolicy)) throw new MiningError("Choose whether package purchases stack or replace active packages");
  if (!DISCLOSURE_TERMS(termsText) || termsText.length < 80 || termsText.length > 12_000) throw new MiningError("Package terms must clearly state that this is simulated and that there is no withdrawal or cash payout; use 80–12,000 characters");
  return { code,name,displayOrder,durationMonths,expectedDailyRewardCki:expectedDailyRewardCki?.toString()??null,priceAsset,priceAmount:price.toString(),baseThs:baseThs.toString(),boostBonusThs:boostBonusThs.toString(),maxPerCustomer,expirySeconds:null,boostDurationSeconds,stackingPolicy,termsText,simulationAcknowledgementRequired:input.simulationAcknowledgementRequired !== false };
}

async function packageList(conn: Db) {
  const config = await loadMiningConfig(conn);
  const [rows] = await conn.query<any[]>(`SELECT p.id packageId,p.code,p.name,p.displayOrder,p.status packageStatus,p.currentVersionId,p.createdBy,p.createdAt,p.updatedAt,
      v.id versionId,v.version,v.displayName,v.versionStatus,v.priceAmount,v.priceAsset,v.baseThs,v.boostBonusThs,v.boostDurationSeconds,v.maxPerCustomer,v.stackingPolicy,v.expirySeconds,v.durationMonths,v.expectedDailyRewardCki,v.termsText,v.effectiveAt,v.createdAt versionCreatedAt,v.createdBy versionCreatedBy,
      (SELECT COUNT(*) FROM mining_customer_packages cp WHERE cp.packageId=p.id) purchaseCount,
      (SELECT COUNT(DISTINCT cp.userId) FROM mining_customer_packages cp WHERE cp.packageId=p.id AND cp.status='active' AND cp.startsAt<=UTC_TIMESTAMP(3) AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3)) AND (cp.endedAt IS NULL OR cp.endedAt>UTC_TIMESTAMP(3))) activeHolders,
      (SELECT COALESCE(SUM(cp.baseThsSnapshot+cp.boostBonusThsSnapshot),0) FROM mining_customer_packages cp WHERE cp.packageId=p.id AND cp.status='active' AND cp.startsAt<=UTC_TIMESTAMP(3) AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3)) AND (cp.endedAt IS NULL OR cp.endedAt>UTC_TIMESTAMP(3))) activeAllocatedThs
    FROM mining_packages p LEFT JOIN mining_package_versions v ON v.packageId=p.id ORDER BY p.displayOrder,p.id,v.version DESC`);
  return rows.map(row=>{
    const daily=row.versionId?decimal(calculatePackageDailyRate({calculationModel:config.calculationModel,expectedDailyRewardCki:row.expectedDailyRewardCki,baseThs:String(row.baseThs||"0"),ckiPerThsPerDay:config.ckiPerThsPerDay})):null;
    return {
    packageId:Number(row.packageId),code:row.code,name:row.displayName||row.name,displayOrder:Number(row.displayOrder),status:row.packageStatus,currentVersionId:row.currentVersionId?Number(row.currentVersionId):null,
    versionId:row.versionId?Number(row.versionId):null,version:row.version?Number(row.version):null,versionStatus:row.versionStatus||null,isCurrentVersion:row.versionId?Number(row.versionId)===Number(row.currentVersionId):false,
    priceAmount:row.priceAmount===null?null:String(row.priceAmount),priceAsset:row.priceAsset?assertMiningAsset(String(row.priceAsset)):null,baseThs:row.baseThs===null?null:String(row.baseThs),
    boostBonusThs:row.boostBonusThs===null?null:String(row.boostBonusThs),boostDurationSeconds:row.boostDurationSeconds===null?null:Number(row.boostDurationSeconds),
    maxPerCustomer:row.maxPerCustomer===null?null:Number(row.maxPerCustomer),stackingPolicy:row.stackingPolicy||null,expirySeconds:row.expirySeconds===null?null:Number(row.expirySeconds),durationMonths:row.durationMonths===null?null:Number(row.durationMonths),
    purchaseCount:Number(row.purchaseCount||0),activeHolders:Number(row.activeHolders||0),activeAllocatedThs:String(row.activeAllocatedThs||"0"),
    expectedDailyRewardCki:row.expectedDailyRewardCki===null?null:String(row.expectedDailyRewardCki),effectiveDailyRewardCki:daily?.toString()??null,estimatedDailyTokens:daily?.toString()??null,
    estimatedHourlyTokens:daily?.div(24).toString()??null,estimatedDailyUsd:daily?.div(config.tokenUnitsPerUsd).toDecimalPlaces(2,Decimal.ROUND_DOWN).toFixed(2)??null,
    calculationModel:config.calculationModel,ckiPerThsPerDay:config.ckiPerThsPerDay,availableForPurchase:row.packageStatus==="published"&&row.versionStatus==="published"&&Number(row.versionId)===Number(row.currentVersionId)&&config.packagePurchasesEnabled,lastConfigurationUpdatedAt:byDate(row.versionCreatedAt),lastConfigurationUpdatedBy:row.versionCreatedBy?Number(row.versionCreatedBy):null,
    termsText:row.termsText||null,effectiveAt:byDate(row.effectiveAt),createdAt:byDate(row.createdAt),updatedAt:byDate(row.updatedAt),
  };});
}

export async function getMiningAdminPackages() {
  return withMiningConnection(async conn=>packageList(conn));
}

export async function saveMiningPackageDraft(adminId: number, rawInput: any) {
  const input = validatePackageInput(rawInput);
  const reason = requiredReason(rawInput.reason || "Admin-created versioned Mining package draft", "Change reason");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    let packageId = rawInput.packageId ? Number(rawInput.packageId) : 0;
    let savedVersionId = 0;
    if (packageId) {
      const [packages] = await conn.query<any[]>(`SELECT * FROM mining_packages WHERE id=? FOR UPDATE`,[packageId]);
      if (!packages[0]) throw new MiningError("Mining package was not found");
      if (packages[0].code !== input.code) throw new MiningError("Package codes cannot be changed after creation");
      await conn.execute(`UPDATE mining_packages SET displayOrder=?,name=CASE WHEN status='draft' THEN ? ELSE name END,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[input.displayOrder,input.name,packageId]);
      const requestedVersionId=Number(rawInput.versionId||0);
      const [draftRows] = requestedVersionId
        ? await conn.query<any[]>(`SELECT * FROM mining_package_versions WHERE id=? AND packageId=? FOR UPDATE`,[requestedVersionId,packageId])
        : await conn.query<any[]>(`SELECT * FROM mining_package_versions WHERE packageId=? AND versionStatus='draft' ORDER BY version DESC LIMIT 1 FOR UPDATE`,[packageId]);
      const current = draftRows[0];
      if (requestedVersionId && (!current || current.versionStatus !== "draft")) throw new MiningError("Only an existing draft version can be edited");
      if (current?.versionStatus === "draft") {
        savedVersionId=Number(current.id);
        await conn.execute(`UPDATE mining_package_versions SET displayName=?,durationMonths=?,expectedDailyRewardCki=?,priceAmount=?,priceAsset=?,baseThs=?,boostBonusThs=?,boostDurationSeconds=?,maxPerCustomer=?,stackingPolicy=?,expirySeconds=?,termsText=?,simulationAcknowledgementRequired=?,createdBy=? WHERE id=?`,[
          input.name,input.durationMonths,input.expectedDailyRewardCki,input.priceAmount,input.priceAsset,input.baseThs,input.boostBonusThs,input.boostDurationSeconds,input.maxPerCustomer,input.stackingPolicy,input.expirySeconds,input.termsText,input.simulationAcknowledgementRequired?1:0,adminId,savedVersionId,
        ]);
      } else {
        const [versionRows] = await conn.query<any[]>(`SELECT COALESCE(MAX(version),0) maxVersion FROM mining_package_versions WHERE packageId=?`,[packageId]);
        const version = Number(versionRows[0]?.maxVersion||0)+1;
        const [inserted] = await conn.execute<any>(`INSERT INTO mining_package_versions
          (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,createdBy)
          VALUES (?,? ,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?)`,[packageId,version,input.name,input.priceAmount,input.priceAsset,input.baseThs,input.boostBonusThs,input.boostDurationSeconds,input.maxPerCustomer,input.stackingPolicy,input.expirySeconds,input.durationMonths,input.expectedDailyRewardCki,input.termsText,input.simulationAcknowledgementRequired?1:0,adminId]);
        savedVersionId=Number(inserted.insertId);
        if(packages[0].status==='draft')await conn.execute(`UPDATE mining_packages SET currentVersionId=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[savedVersionId,packageId]);
      }
    } else {
      const [existing] = await conn.query<any[]>(`SELECT id FROM mining_packages WHERE code=? LIMIT 1`,[input.code]);
      if (existing[0]) throw new MiningError("A Mining package with this code already exists");
      const [created] = await conn.execute<any>(`INSERT INTO mining_packages (code,name,displayOrder,status,createdBy) VALUES (?,?,?,'draft',?)`,[input.code,input.name,input.displayOrder,adminId]);
      packageId = Number(created.insertId);
      const [version] = await conn.execute<any>(`INSERT INTO mining_package_versions
        (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,createdBy)
        VALUES (?,1,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?)`,[packageId,input.name,input.priceAmount,input.priceAsset,input.baseThs,input.boostBonusThs,input.boostDurationSeconds,input.maxPerCustomer,input.stackingPolicy,input.expirySeconds,input.durationMonths,input.expectedDailyRewardCki,input.termsText,input.simulationAcknowledgementRequired?1:0,adminId]);
      savedVersionId=Number(version.insertId);
      await conn.execute(`UPDATE mining_packages SET currentVersionId=? WHERE id=?`,[savedVersionId,packageId]);
    }
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.package.draft.saved",entityType:"mining_package",entityId:String(packageId),reason,metadata:{code:input.code,name:input.name,displayOrder:input.displayOrder,durationMonths:input.durationMonths,expectedDailyRewardCki:input.expectedDailyRewardCki,priceAsset:input.priceAsset,priceAmount:input.priceAmount,baseThs:input.baseThs}});
    return {packageId,versionId:savedVersionId,status:"draft_saved",message:"Draft saved. Publishing creates the package version customers can purchase."};
  }));
}

export async function publishMiningPackage(adminId: number, input: { packageId:number; versionId:number; reason:string }) {
  const reason=requiredReason(input.reason,"Publish reason");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [rows]=await conn.query<any[]>(`SELECT p.id packageId,p.code,p.name,p.status packageStatus,p.currentVersionId,v.* FROM mining_packages p JOIN mining_package_versions v ON v.packageId=p.id WHERE p.id=? AND v.id=? FOR UPDATE`,[input.packageId,input.versionId]);
    const row=rows[0];
    if(!row) throw new MiningError("Package version was not found");
    const config=await loadMiningConfig(conn);
    const effectiveDaily=calculatePackageDailyRate({calculationModel:config.calculationModel,expectedDailyRewardCki:row.expectedDailyRewardCki,baseThs:String(row.baseThs),ckiPerThsPerDay:config.ckiPerThsPerDay});
    if(config.globalEnabled&&!decimal(effectiveDaily).gt(0)) throw new MiningError("Pause simulated reward processing or configure a positive reward under the selected method before publishing this version");
    if(row.versionStatus!=="draft"&&(row.versionStatus!=="published"||Number(row.currentVersionId)!==Number(input.versionId))) throw new MiningError("Only a draft or the current published version can be published");
    if(!DISCLOSURE_TERMS(String(row.termsText||""))) throw new MiningError("Package terms need the simulation-only and no-payout disclosure");
    const now=new Date();
    await conn.execute(`UPDATE mining_package_versions SET versionStatus='published',effectiveAt=? WHERE id=?`,[now,input.versionId]);
    await conn.execute(`UPDATE mining_packages SET name=?,status='published',currentVersionId=?,updatedAt=? WHERE id=?`,[String(row.displayName||row.name),input.versionId,now,input.packageId]);
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.package.published",entityType:"mining_package_version",entityId:String(input.versionId),reason,metadata:{packageId:input.packageId,code:row.code,version:Number(row.version)}});
    return {packageId:input.packageId,versionId:input.versionId,version:Number(row.version),status:"published",effectiveAt:now.toISOString()};
  }));
}

export async function setMiningPackageStatus(adminId: number, input: {packageId:number;status:"published"|"paused"|"retired";reason:string}) {
  const reason=requiredReason(input.reason,"Status change reason");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [rows]=await conn.query<any[]>(`SELECT id,status,code,currentVersionId FROM mining_packages WHERE id=? FOR UPDATE`,[input.packageId]);
    if(!rows[0]) throw new MiningError("Mining package was not found");
    if(input.status==="published"){
      const [versions]=await conn.query<any[]>(`SELECT versionStatus,expectedDailyRewardCki,baseThs FROM mining_package_versions WHERE id=? LIMIT 1 FOR UPDATE`,[rows[0].currentVersionId]);
      if(versions[0]?.versionStatus!=="published")throw new MiningError("Publish a valid package version before making it available to customers");
      const config=await loadMiningConfig(conn);
      const effectiveDaily=calculatePackageDailyRate({calculationModel:config.calculationModel,expectedDailyRewardCki:versions[0].expectedDailyRewardCki,baseThs:String(versions[0].baseThs),ckiPerThsPerDay:config.ckiPerThsPerDay});
      if(config.globalEnabled&&!decimal(effectiveDaily).gt(0)) throw new MiningError("Pause simulated reward processing or configure a positive reward under the selected method before reactivating this package");
    }
    await conn.execute(`UPDATE mining_packages SET status=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[input.status,input.packageId]);
    await writeMiningAudit(conn,{actorUserId:adminId,action:`mining.package.${input.status}`,entityType:"mining_package",entityId:String(input.packageId),reason,metadata:{code:rows[0].code,previousStatus:rows[0].status,status:input.status}});
    return {packageId:input.packageId,status:input.status};
  }));
}

export async function grantSandboxMiningPackage(adminId:number,input:{userId:number;packageVersionId:number;reason:string;idempotencyKey:string}) {
  assertSandboxMiningDatabase();
  const reason=requiredReason(input.reason,"Grant reason");
  const key=requestKey("mining-admin-package-grant",adminId,input.idempotencyKey);
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const prior=await beginMiningIdempotency(conn,adminId,key,"mining.admin.package.grant");
    if(prior)return prior;
    const [actorRows]=await conn.query<any[]>(`SELECT role FROM users WHERE id=? LIMIT 1`,[adminId]);
    if(actorRows[0]?.role!=="admin")throw new MiningError("Only an administrator can grant a sandbox Mining package");
    const [targetRows]=await conn.query<any[]>(`SELECT id,email,role FROM users WHERE id=? FOR UPDATE`,[input.userId]);
    const target=targetRows[0];
    if(!target||target.role!=="admin")throw new MiningError("This sandbox grant is restricted to an administrator account");
    await requireActiveMiningAccount(conn,input.userId);

    const now=new Date();
    const config=await loadMiningConfig(conn,now);
    if(!config.globalEnabled)throw new MiningError("Mining simulation must be enabled before granting the demo package");
    const [packageRows]=await conn.query<any[]>(`SELECT p.id packageId,p.code,p.name,p.status packageStatus,p.currentVersionId,
        v.id packageVersionId,v.version,v.displayName,v.durationMonths,v.expectedDailyRewardCki,v.versionStatus,v.priceAmount,v.priceAsset,v.baseThs,v.boostBonusThs,v.expirySeconds,v.termsText,v.effectiveAt,v.maxPerCustomer
      FROM mining_packages p JOIN mining_package_versions v ON v.packageId=p.id WHERE v.id=? FOR UPDATE`,[input.packageVersionId]);
    const product=packageRows[0];
    if(!product||product.packageStatus!=="published"||product.versionStatus!=="published"||Number(product.currentVersionId)!==Number(product.packageVersionId)||!product.effectiveAt||new Date(product.effectiveAt).getTime()>now.getTime())throw new MiningError("The selected Mining package version is not currently published");
    if(product.expectedDailyRewardCki===null||!decimal(product.expectedDailyRewardCki).gt(0))throw new MiningError("The selected package needs a positive daily CKI estimate before a grant is eligible");
    if(product.code!=="SANDBOX_STARTER_24M"||String(product.priceAsset)!=="USD"||!decimal(product.priceAmount).eq("50")||!decimal(product.baseThs).eq("1")||Number(product.expirySeconds)!==63_072_000||!DISCLOSURE_TERMS(String(product.termsText||"")))throw new MiningError("Only the published $50, 1 TH/s, 24-month Starter Miner Sandbox Demo is eligible for this no-charge grant");

    const [activeRows]=await conn.query<any[]>(`SELECT id FROM mining_customer_packages WHERE userId=? AND status IN ('active','replaced') AND startsAt<=?
      AND (expiresAt IS NULL OR expiresAt>?) AND (endedAt IS NULL OR endedAt>?) LIMIT 1 FOR UPDATE`,[input.userId,now,now,now]);
    if(activeRows.length)throw new MiningError("The admin account already has active Mining capacity; no additional package was granted");
    if(Number(product.maxPerCustomer)>0){
      const [countRows]=await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_customer_packages WHERE userId=? AND packageId=? AND status<>'cancelled'`,[input.userId,product.packageId]);
      if(Number(countRows[0]?.total||0)>=Number(product.maxPerCustomer))throw new MiningError("This package has reached its per-account grant limit");
    }

    await ensureMiningCheckpoint(conn,input.userId,now);
    const durationMonthsSnapshot=product.durationMonths===null?null:Number(product.durationMonths);
    const expiresAt=durationMonthsSnapshot!==null?addUtcMonths(now,durationMonthsSnapshot):new Date(now.getTime()+Number(product.expirySeconds)*1000);
    const packageNameSnapshot=String(product.displayName||product.name);
    const termsSnapshot=`${String(product.termsText)}\n\nSANDBOX GRANT: No wallet debit or payment was made. This entitlement is simulation-only and provides no cash payout.`;
    const [inserted]=await conn.execute<any>(`INSERT INTO mining_customer_packages
      (userId,packageId,packageNameSnapshot,packageVersionId,acquisitionType,status,durationMonthsSnapshot,expectedDailyRewardCkiSnapshot,purchasedAt,startsAt,expiresAt,baseThsSnapshot,boostBonusThsSnapshot,priceAmount,priceAsset,paymentAmount,paymentAsset,quoteId,ledgerTransactionId,idempotencyKey,termsSnapshot)
      VALUES (?,?,?,?,'admin_grant','active',?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)`,[
      input.userId,Number(product.packageId),packageNameSnapshot,Number(product.packageVersionId),durationMonthsSnapshot,String(product.expectedDailyRewardCki),now,now,expiresAt,String(product.baseThs),String(product.boostBonusThs),String(product.priceAmount),String(product.priceAsset),"0","USD",key,termsSnapshot,
    ]);
    const entitlementId=Number(inserted.insertId);
    const grantReference=`SBX-GRANT-${input.userId}-${entitlementId}`;
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.package.admin_granted",entityType:"mining_customer_package",entityId:String(entitlementId),reason,reference:grantReference,metadata:{userId:input.userId,email:String(target.email),packageId:Number(product.packageId),packageVersionId:Number(product.packageVersionId),packageCode:String(product.code),listedPrice:String(product.priceAmount),priceAsset:String(product.priceAsset),paymentAmount:"0",noCharge:true,simulationOnly:true,payoutsEnabled:false}});
    await createMiningNotification(conn,input.userId,"Sandbox Mining package granted",`${packageNameSnapshot} is active under its saved package term as a no-charge simulation grant. No wallet debit or payout was made.`);
    const result={entitlementId,packageId:Number(product.packageId),packageVersionId:Number(product.packageVersionId),packageName:packageNameSnapshot,durationMonths:durationMonthsSnapshot,acquisitionType:"admin_grant",status:"active",paymentAmount:"0.00",paymentAsset:"USD",baseThs:String(product.baseThs),startsAt:now.toISOString(),expiresAt:expiresAt.toISOString(),grantReference,simulationOnly:true,noCharge:true,disclaimer:"Sandbox simulation only; no live mining, wallet debit, or cash payout."};
    await finishMiningIdempotency(conn,key,result);
    return result;
  }));
}

export async function getMiningAdminEconomics() {
  return withMiningConnection(async conn=>{
    const config=await loadMiningConfig(conn);
    const [versions]=await conn.query<any[]>(`SELECT id,version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,calculationModel,difficultyBaselineThs,ckiPerThsPerDay,tokenUnitsPerUsd,rewardTokensPerThsHour,swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,boostRewardCkiPerDay,boostActivationBonusCki,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason,createdAt FROM mining_economics_versions ORDER BY effectiveAt DESC,version DESC LIMIT 50`);
    const clean=(row:any)=>({id:Number(row.id),version:Number(row.version),effectiveAt:byDate(row.effectiveAt),globalEnabled:Boolean(row.globalEnabled),packagePurchasesEnabled:Boolean(row.packagePurchasesEnabled),boostsEnabled:Boolean(row.boostsEnabled),tokenName:String(row.tokenName),tokenSymbol:String(row.tokenSymbol),defaultContractDurationMonths:Number(row.defaultContractDurationMonths),calculationModel:String(row.calculationModel),difficultyBaselineThs:String(row.difficultyBaselineThs),ckiPerThsPerDay:String(row.ckiPerThsPerDay??"0"),usdPerToken:decimal(1).div(String(row.tokenUnitsPerUsd)).toSignificantDigits(18).toString(),tokenUnitsPerUsd:String(row.tokenUnitsPerUsd),rewardTokensPerThsHour:String(row.rewardTokensPerThsHour),swapFeeBps:Number(row.swapFeeBps),purchaseFeeBps:Number(row.purchaseFeeBps),minSwapTokens:String(row.minSwapTokens),maxSwapTokens:String(row.maxSwapTokens),defaultAutoConversionThreshold:String(row.defaultAutoConversionThreshold),boostCycleSeconds:Number(row.boostCycleSeconds),boostDurationSeconds:Number(row.boostDurationSeconds),boostRewardCkiPerDay:String(row.boostRewardCkiPerDay??"0"),boostActivationBonusCki:String(row.boostActivationBonusCki??"0"),quoteTtlSeconds:Number(row.quoteTtlSeconds),fiatMaxAgeSeconds:Number(row.fiatMaxAgeSeconds),cryptoMaxAgeSeconds:Number(row.cryptoMaxAgeSeconds),maxRateDeviationBps:Number(row.maxRateDeviationBps),dailyRewardCapTokens:String(row.dailyRewardCapTokens),dualApprovalThresholdUsd:String(row.dualApprovalThresholdUsd),updatedBy:row.updatedBy?Number(row.updatedBy):null,reason:row.reason,createdAt:byDate(row.createdAt)});
    return {current:{id:config.id,version:config.version,effectiveAt:config.effectiveAt.toISOString(),globalEnabled:config.globalEnabled,packagePurchasesEnabled:config.packagePurchasesEnabled,boostsEnabled:config.boostsEnabled,tokenName:config.tokenName,tokenSymbol:config.tokenSymbol,defaultContractDurationMonths:config.defaultContractDurationMonths,calculationModel:config.calculationModel,difficultyBaselineThs:config.difficultyBaselineThs,ckiPerThsPerDay:config.ckiPerThsPerDay,usdPerToken:decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(),tokenUnitsPerUsd:config.tokenUnitsPerUsd,rewardTokensPerThsHour:config.rewardTokensPerThsHour,swapFeeBps:config.swapFeeBps,purchaseFeeBps:config.purchaseFeeBps,minSwapTokens:config.minSwapTokens,maxSwapTokens:config.maxSwapTokens,defaultAutoConversionThreshold:config.defaultAutoConversionThreshold,boostCycleSeconds:config.boostCycleSeconds,boostDurationSeconds:config.boostDurationSeconds,boostRewardCkiPerDay:config.boostRewardCkiPerDay,boostActivationBonusCki:config.boostActivationBonusCki,quoteTtlSeconds:config.quoteTtlSeconds,fiatMaxAgeSeconds:config.fiatMaxAgeSeconds,cryptoMaxAgeSeconds:config.cryptoMaxAgeSeconds,maxRateDeviationBps:config.maxRateDeviationBps,dailyRewardCapTokens:config.dailyRewardCapTokens,dualApprovalThresholdUsd:config.dualApprovalThresholdUsd},versions:versions.map(clean)};
  });
}

export async function saveMiningEconomics(adminId:number,input:any) {
  const reason=requiredReason(input.reason,"Economics change reason");
  const tokenName=String(input.tokenName||"").trim();
  const tokenSymbol=String(input.tokenSymbol||"").trim().toUpperCase();
  if(tokenName!=="CoinKi"||tokenSymbol!=="CKI") throw new MiningError("Mining token identity is fixed as CoinKi (CKI)");
  const tokenUnits=decimal(input.tokenUnitsPerUsd), boostReward=decimal(input.boostRewardCkiPerDay), boostActivationBonus=decimal(input.boostActivationBonusCki), rewardRate=decimal(input.rewardTokensPerThsHour), difficultyBaseline=decimal(input.difficultyBaselineThs), ckiPerThsPerDay=decimal(input.ckiPerThsPerDay), minSwap=decimal(input.minSwapTokens), maxSwap=decimal(input.maxSwapTokens), autoThreshold=decimal(input.defaultAutoConversionThreshold), dailyCap=decimal(input.dailyRewardCapTokens), dual=decimal(input.dualApprovalThresholdUsd);
  if(tokenUnits.lte(0)||tokenUnits.gt("1000000000000000000")) throw new MiningError("Internal CKI-per-USD conversion reference must be positive and within supported bounds");
  if(difficultyBaseline.lte(0)||difficultyBaseline.gt("1000000000000")||!difficultyBaseline.toDecimalPlaces(12,Decimal.ROUND_DOWN).eq(difficultyBaseline)) throw new MiningError("Difficulty baseline must be positive and use at most 12 decimal places");
  if(boostActivationBonus.isNegative()||boostActivationBonus.gt("1000000000000")) throw new MiningError("Boost activation bonus must be non-negative and within supported bounds");
  if(boostReward.isNegative()||boostReward.gt("1000000000000")) throw new MiningError("Boost CKI reward must be non-negative and within supported bounds");
  if(rewardRate.isNegative()||rewardRate.gt("1000000000000")) throw new MiningError("Reward rate must be zero or positive and within supported bounds");
  const calculationModel=String(input.calculationModel||"package_daily") as MiningCalculationModel;
  if(!["package_daily","hashrate_daily"].includes(calculationModel)) throw new MiningError("Choose fixed package reward or TH/s-based production");
  if(ckiPerThsPerDay.isNegative()||ckiPerThsPerDay.gt("1000000000000")||!ckiPerThsPerDay.toDecimalPlaces(18,Decimal.ROUND_DOWN).eq(ckiPerThsPerDay)) throw new MiningError("CKI production per TH/s per day must be non-negative with at most 18 decimal places");
  if(calculationModel==="hashrate_daily"&&!ckiPerThsPerDay.gt(0)) throw new MiningError("TH/s-based production requires a positive CKI-per-TH/s-per-day rate");
  if(minSwap.lte(0)||maxSwap.lte(minSwap)) throw new MiningError("Maximum swap must be greater than the positive minimum swap");
  for(const [label,value] of [["Default auto-conversion threshold",autoThreshold], ["Daily reward cap",dailyCap], ["Dual-approval threshold",dual]] as const) if(value.isNegative()) throw new MiningError(`${label} cannot be negative`);
  const fee=(name:string,v:number)=>{if(!Number.isInteger(v)||v<0||v>10_000) throw new MiningError(`${name} must be between 0 and 10,000 basis points`);return v;};
  const bounded=(name:string,v:number,min:number,max:number)=>{if(!Number.isInteger(v)||v<min||v>max) throw new MiningError(`${name} must be between ${min} and ${max}`);return v;};
  const values={globalEnabled:Boolean(input.globalEnabled),packagePurchasesEnabled:Boolean(input.packagePurchasesEnabled),boostsEnabled:Boolean(input.boostsEnabled),tokenName,tokenSymbol,defaultContractDurationMonths:bounded("Default contract duration months",Number(input.defaultContractDurationMonths),1,120),calculationModel,difficultyBaselineThs:difficultyBaseline.toString(),ckiPerThsPerDay:ckiPerThsPerDay.toString(),tokenUnitsPerUsd:tokenUnits.toString(),rewardTokensPerThsHour:rewardRate.toString(),swapFeeBps:fee("Swap fee",Number(input.swapFeeBps)),purchaseFeeBps:fee("Purchase fee",Number(input.purchaseFeeBps)),minSwapTokens:minSwap.toString(),maxSwapTokens:maxSwap.toString(),defaultAutoConversionThreshold:autoThreshold.toString(),boostCycleSeconds:bounded("Boost cycle seconds",Number(input.boostCycleSeconds),60,31_536_000),boostRewardCkiPerDay:boostReward.toString(),boostActivationBonusCki:boostActivationBonus.toString(),boostDurationSeconds:bounded("Boost duration seconds",Number(input.boostDurationSeconds),10,31_536_000),quoteTtlSeconds:bounded("Quote lifetime seconds",Number(input.quoteTtlSeconds),10,600),fiatMaxAgeSeconds:bounded("Maximum fiat price age seconds",Number(input.fiatMaxAgeSeconds),60,604_800),cryptoMaxAgeSeconds:bounded("Maximum crypto price age seconds",Number(input.cryptoMaxAgeSeconds),30,3_600),maxRateDeviationBps:bounded("Maximum rate movement basis points",Number(input.maxRateDeviationBps),0,10_000),dailyRewardCapTokens:dailyCap.toString(),dualApprovalThresholdUsd:dual.toString()};
  if(values.boostDurationSeconds>values.boostCycleSeconds) throw new MiningError("Boost duration cannot exceed the boost cycle");
  if(!minSwap.toDecimalPlaces(8,Decimal.ROUND_DOWN).eq(minSwap)||!maxSwap.toDecimalPlaces(8,Decimal.ROUND_DOWN).eq(maxSwap)||!autoThreshold.toDecimalPlaces(8,Decimal.ROUND_DOWN).eq(autoThreshold)||!dailyCap.toDecimalPlaces(8,Decimal.ROUND_DOWN).eq(dailyCap)) throw new MiningError("Mining token thresholds support up to eight decimal places");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [rows]=await conn.query<any[]>(`SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions`);
    const version=Number(rows[0]?.maxVersion||0)+1;
    const effectiveAt=input.effectiveAt?new Date(String(input.effectiveAt)):new Date();
    if(!Number.isFinite(effectiveAt.getTime())) throw new MiningError("Choose a valid effective date and time");
    if(effectiveAt.getTime()<Date.now()-5_000) throw new MiningError("Economic changes cannot be scheduled retroactively");
    await conn.execute(`INSERT INTO mining_economics_versions
      (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,calculationModel,difficultyBaselineThs,ckiPerThsPerDay,tokenUnitsPerUsd,rewardTokensPerThsHour,swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,boostRewardCkiPerDay,boostActivationBonusCki,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[version,effectiveAt,values.globalEnabled?1:0,values.packagePurchasesEnabled?1:0,values.boostsEnabled?1:0,values.tokenName,values.tokenSymbol,values.defaultContractDurationMonths,values.calculationModel,values.difficultyBaselineThs,values.ckiPerThsPerDay,values.tokenUnitsPerUsd,values.rewardTokensPerThsHour,values.swapFeeBps,values.purchaseFeeBps,values.minSwapTokens,values.maxSwapTokens,values.defaultAutoConversionThreshold,values.boostCycleSeconds,values.boostDurationSeconds,values.boostRewardCkiPerDay,values.boostActivationBonusCki,values.quoteTtlSeconds,values.fiatMaxAgeSeconds,values.cryptoMaxAgeSeconds,values.maxRateDeviationBps,values.dailyRewardCapTokens,values.dualApprovalThresholdUsd,adminId,reason]);
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.economics.version.created",entityType:"mining_economics_version",entityId:String(version),reason,metadata:{...values,version,effectiveAt:effectiveAt.toISOString()}});
    return {version,effectiveAt:effectiveAt.toISOString(),...values};
  }));
}

export async function getMiningAdminPriceFeeds() {
  return withMiningConnection(async conn=>{
    const config=await loadMiningConfig(conn);
    const result=[];
    for(const asset of ["USD","EUR","GBP","BTC","ETH","USDT"]){
      try{
        const rate=await getMiningAssetRate(conn,asset,config);
        result.push({asset,usdPerUnit:rate.usdPerUnit.toSignificantDigits(16).toString(),provider:rate.provider,observedAt:rate.observedAt.toISOString(),ageSeconds:Math.max(0,Math.floor((Date.now()-rate.observedAt.getTime())/1000)),status:"fresh",issue:null});
      }catch(error){
        const [registryRows]=await conn.query<any[]>(`SELECT usdRate,rateProvider,updatedAt FROM currency_registry WHERE code=? LIMIT 1`,[asset]);
        const base=asset==="EUR"||asset==="GBP"?"USD":asset;const quote=asset==="EUR"||asset==="GBP"?asset:"USD";
        const [snapshotRows]=await conn.query<any[]>(`SELECT rate,sourceDate,provider FROM fx_rate_snapshots WHERE baseAsset=? AND quoteAsset=? ORDER BY id DESC LIMIT 1`,[base,quote]);
        const observed=snapshotRows[0]?.sourceDate?new Date(snapshotRows[0].sourceDate):registryRows[0]?.updatedAt?new Date(registryRows[0].updatedAt):null;
        result.push({asset,usdPerUnit:registryRows[0]?.usdRate?String(registryRows[0].usdRate):null,provider:snapshotRows[0]?.provider||registryRows[0]?.rateProvider||null,observedAt:observed?.toISOString()||null,ageSeconds:observed?Math.max(0,Math.floor((Date.now()-observed.getTime())/1000)):null,status:"paused",issue:error instanceof MiningError?error.message:"Price feed could not be validated"});
      }
    }
    return {serverTime:new Date().toISOString(),tokenConversionReference:`1 ${config.tokenSymbol} = $${decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(12).toString()} USD (admin-configured internal conversion; not market pricing)`,feeds:result};
  });
}

export async function refreshMiningPriceFeeds() {
  const result=await refreshMarketData();
  return {stocksRefreshed:result.stocksStored,fxSnapshotsRefreshed:result.fxStored,refreshedAt:result.refreshedAt.toISOString(),issues:result.errors.map(error=>String(error).slice(0,300))};
}

export async function listMiningAdminCustomers(input:{query?:string;limit?:number}) {
  const limit=Math.max(1,Math.min(100,Number(input.limit||50)));
  const query=String(input.query||"").trim();
  return withMiningConnection(async conn=>{
    const pattern=`%${query.replace(/[\\%_]/g,"\\$&")}%`;
    const [rows]=await conn.query<any[]>(`SELECT u.id,u.name,u.email,u.createdAt,u.lastSignedIn,COALESCE(c.accountStatus,'active') accountStatus,c.riskTier,c.updatedAt controlUpdatedAt,
      (SELECT COUNT(*) FROM mining_customer_packages cp WHERE cp.userId=u.id AND cp.status='active' AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3))) activePackages,
      (SELECT COALESCE(SUM(tokenAmount),0) FROM mining_reward_events r WHERE r.userId=u.id) totalSimulatedTokens
      FROM users u LEFT JOIN customer_controls c ON c.userId=u.id
      WHERE u.role='user' AND (?='' OR u.email LIKE ? OR u.name LIKE ? OR CAST(u.id AS CHAR)=?)
      ORDER BY u.createdAt DESC LIMIT ?`,[query,pattern,pattern,query,limit]);
    return rows.map(row=>({userId:Number(row.id),name:row.name||"",email:row.email||"",createdAt:byDate(row.createdAt),lastSignedIn:byDate(row.lastSignedIn),accountStatus:row.accountStatus,riskTier:row.riskTier||"standard",controlUpdatedAt:byDate(row.controlUpdatedAt),activePackages:Number(row.activePackages||0),totalSimulatedTokens:String(row.totalSimulatedTokens||"0")}));
  });
}

export async function getMiningAdminCustomerDetail(userId:number) {
  return withMiningConnection(async conn=>{
    const [userRows]=await conn.query<any[]>(`SELECT u.id,u.name,u.email,u.role,u.createdAt,u.lastSignedIn,COALESCE(c.accountStatus,'active') accountStatus,c.riskTier,c.adminNote,c.withdrawalsEnabled,c.updatedAt controlUpdatedAt FROM users u LEFT JOIN customer_controls c ON c.userId=u.id WHERE u.id=? LIMIT 1`,[userId]);
    const user=userRows[0];if(!user||user.role!=="user")throw new MiningError("Customer was not found");
    const [wallets]=await conn.query<any[]>(`SELECT assetCode,availableAmount,lockedAmount,pendingAmount,updatedAt FROM v5_wallets WHERE userId=? ORDER BY assetCode`,[userId]);
    const [packages]=await conn.query<any[]>(`SELECT cp.id,cp.status,cp.durationMonthsSnapshot,cp.purchasedAt,cp.startsAt,cp.expiresAt,cp.endedAt,cp.baseThsSnapshot,cp.boostBonusThsSnapshot,cp.priceAmount,cp.priceAsset,cp.paymentAmount,cp.paymentAsset,p.code,COALESCE(cp.packageNameSnapshot,v.displayName,p.name) packageName,v.version packageVersion,t.referenceCode FROM mining_customer_packages cp JOIN mining_packages p ON p.id=cp.packageId JOIN mining_package_versions v ON v.id=cp.packageVersionId LEFT JOIN mining_ledger_transactions t ON t.id=cp.ledgerTransactionId WHERE cp.userId=? ORDER BY cp.purchasedAt DESC LIMIT 50`,[userId]);
    const [transactions]=await conn.query<any[]>(`SELECT id,transactionType,status,referenceCode,reversalOfId,reason,metadataJson,createdAt FROM mining_ledger_transactions WHERE userId=? ORDER BY createdAt DESC LIMIT 50`,[userId]);
    const [adjustments]=await conn.query<any[]>(`SELECT a.*,req.name requesterName,ap.name approverName FROM mining_adjustment_requests a LEFT JOIN users req ON req.id=a.requestedBy LEFT JOIN users ap ON ap.id=a.approvedBy WHERE a.userId=? ORDER BY a.createdAt DESC LIMIT 50`,[userId]);
    const [prefs]=await conn.query<any[]>(`SELECT enabled,targetDenomination,minimumThreshold,version,updatedAt FROM mining_conversion_preferences WHERE userId=? LIMIT 1`,[userId]);
    const [tickets]=await conn.query<any[]>(`SELECT id,subject,status,priority,category,createdAt,updatedAt FROM support_tickets WHERE userId=? ORDER BY createdAt DESC LIMIT 20`,[userId]);
    return {
      user:{userId:Number(user.id),name:user.name||"",email:user.email||"",role:user.role,accountStatus:user.accountStatus,riskTier:user.riskTier||"standard",adminNote:user.adminNote||"",createdAt:byDate(user.createdAt),lastSignedIn:byDate(user.lastSignedIn),controlUpdatedAt:byDate(user.controlUpdatedAt)},
      wallets:wallets.filter(row=>!(row.assetCode==="TOKEN"&&decimal(row.availableAmount).isZero()&&decimal(row.lockedAmount).isZero()&&decimal(row.pendingAmount).isZero())).map(row=>({asset:row.assetCode==="TOKEN"?"CKI":row.assetCode,available:String(row.availableAmount),locked:String(row.lockedAmount),pending:String(row.pendingAmount),updatedAt:byDate(row.updatedAt)})),
      packages:packages.map(row=>({id:Number(row.id),status:row.status,packageCode:row.code,packageName:row.packageName,version:Number(row.packageVersion),durationMonths:row.durationMonthsSnapshot===null?null:Number(row.durationMonthsSnapshot),baseThs:String(row.baseThsSnapshot),boostBonusThs:String(row.boostBonusThsSnapshot),priceAmount:String(row.priceAmount),priceAsset:assertMiningAsset(String(row.priceAsset)),paymentAmount:String(row.paymentAmount),paymentAsset:assertMiningAsset(String(row.paymentAsset)),purchasedAt:byDate(row.purchasedAt),startsAt:byDate(row.startsAt),expiresAt:byDate(row.expiresAt),endedAt:byDate(row.endedAt),receipt:row.referenceCode||null})),
      transactions:transactions.map(row=>({id:Number(row.id),type:row.transactionType,status:row.status,reference:row.referenceCode,reversalOfId:row.reversalOfId?Number(row.reversalOfId):null,reason:row.reason||null,metadata:(()=>{try{return JSON.parse(String(row.metadataJson||"{}"));}catch{return {};}})(),createdAt:byDate(row.createdAt)})),
      adjustments:adjustments.map(row=>({id:Number(row.id),asset:row.assetCode,amount:String(row.amount),direction:row.direction,reason:row.reason,status:row.status,requestedBy:Number(row.requestedBy),requesterName:row.requesterName||null,approvedBy:row.approvedBy?Number(row.approvedBy):null,approverName:row.approverName||null,ledgerTransactionId:row.ledgerTransactionId?Number(row.ledgerTransactionId):null,createdAt:byDate(row.createdAt),resolvedAt:byDate(row.resolvedAt)})),
      conversionPreference:prefs[0]?{enabled:Boolean(prefs[0].enabled),targetDenomination:prefs[0].targetDenomination,minimumThreshold:String(prefs[0].minimumThreshold),version:Number(prefs[0].version),updatedAt:byDate(prefs[0].updatedAt)}:null,
      supportTickets:tickets.map(row=>({id:Number(row.id),subject:row.subject,status:row.status,priority:row.priority,category:row.category,createdAt:byDate(row.createdAt),updatedAt:byDate(row.updatedAt)})),
    };
  });
}

export async function createMiningAdjustment(adminId:number,input:{userId:number;assetCode:string;amount:string;direction:"credit"|"debit";reason:string;idempotencyKey:string}) {
  const asset=assertMiningAsset(input.assetCode);const amount=exactAmount(input.amount,asset,"Adjustment amount");const reason=requiredReason(input.reason);
  const key=requestKey("mining-adjustment",adminId,input.idempotencyKey);
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [existing]=await conn.query<any[]>(`SELECT id,userId,assetCode,amount,direction,status,ledgerTransactionId FROM mining_adjustment_requests WHERE idempotencyKey=? LIMIT 1`,[key]);
    if(existing[0])return {requestId:Number(existing[0].id),userId:Number(existing[0].userId),asset:existing[0].assetCode,amount:String(existing[0].amount),direction:existing[0].direction,status:existing[0].status,ledgerTransactionId:existing[0].ledgerTransactionId?Number(existing[0].ledgerTransactionId):null,idempotent:true};
    const [users]=await conn.query<any[]>(`SELECT id,role FROM users WHERE id=? LIMIT 1`,[input.userId]);if(!users[0]||users[0].role!=="user")throw new MiningError("Customer was not found");
    await ensureMiningCheckpoint(conn,input.userId);
    const config=await loadMiningConfig(conn);
    let usdValue:Decimal|null=null;let approvalRequired=false;
    try{const rate=await getMiningAssetRate(conn,asset,config);usdValue=amount.times(rate.usdPerUnit);approvalRequired=usdValue.gt(config.dualApprovalThresholdUsd);}catch{approvalRequired=true;}
    const [request]=await conn.execute<any>(`INSERT INTO mining_adjustment_requests (userId,assetCode,amount,direction,reason,status,requestedBy,idempotencyKey) VALUES (?,?,?,?,?,?,?,?)`,[input.userId,asset,amount.toString(),input.direction,reason,approvalRequired?"pending":"posted",adminId,key]);
    const requestId=Number(request.insertId);
    let ledgerId:number|null=null;let reference:string|null=null;
    if(!approvalRequired){
      const signed=input.direction==="credit"?amount:amount.negated();
      const transaction=await createMiningLedgerTransaction(conn,{userId:input.userId,actorUserId:adminId,transactionType:"adjustment",idempotencyKey:`mining-adjustment-tx:${requestId}`,reason,metadata:{requestId,asset,amount:amount.toString(),direction:input.direction,usdValue:usdValue?.toString()||null,simulationOnly:true}});
      await postMiningLedgerEntries(conn,transaction,[{userId:input.userId,asset,amount:signed,entryType:`mining_adjustment_${input.direction}`},{userId:0,asset,amount:signed.negated(),entryType:"mining_adjustment_clearing"}]);
      ledgerId=transaction.id;reference=transaction.referenceCode;
      await conn.execute(`UPDATE mining_adjustment_requests SET ledgerTransactionId=?,resolvedAt=UTC_TIMESTAMP(3) WHERE id=?`,[ledgerId,requestId]);
      await createMiningNotification(conn,input.userId,"Mining balance adjustment posted",`An administrator posted a simulated ${input.direction} of ${amount.toString()} ${asset}. Reference ${reference}.`);
    }
    await writeMiningAudit(conn,{actorUserId:adminId,action:approvalRequired?"mining.adjustment.approval_requested":"mining.adjustment.posted",entityType:"mining_adjustment_request",entityId:String(requestId),reason,metadata:{userId:input.userId,asset,amount:amount.toString(),direction:input.direction,usdValue:usdValue?.toString()||null,dualApprovalThresholdUsd:config.dualApprovalThresholdUsd}});
    return {requestId,userId:input.userId,asset,amount:amount.toString(),direction:input.direction,status:approvalRequired?"pending":"posted",requiresSecondAdminApproval:approvalRequired,usdValue:usdValue?.toString()||null,ledgerTransactionId:ledgerId,reference};
  }));
}

export async function resolveMiningAdjustment(adminId:number,input:{requestId:number;approve:boolean;reason:string}) {
  const reason=requiredReason(input.reason,input.approve?"Approval reason":"Rejection reason");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [rows]=await conn.query<any[]>(`SELECT * FROM mining_adjustment_requests WHERE id=? FOR UPDATE`,[input.requestId]);const row=rows[0];
    if(!row||row.status!=="pending")throw new MiningError("This adjustment is no longer awaiting approval");
    if(Number(row.requestedBy)===adminId)throw new MiningError("A different administrator must review this adjustment");
    await ensureMiningCheckpoint(conn,Number(row.userId));
    if(!input.approve){
      await conn.execute(`UPDATE mining_adjustment_requests SET status='rejected',approvedBy=?,resolvedAt=UTC_TIMESTAMP(3) WHERE id=?`,[adminId,input.requestId]);
      await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.adjustment.rejected",entityType:"mining_adjustment_request",entityId:String(input.requestId),reason,metadata:{userId:Number(row.userId),asset:row.assetCode,amount:String(row.amount),requestedBy:Number(row.requestedBy)}});
      await createMiningNotification(conn,Number(row.userId),"Mining adjustment not approved",`A requested simulated balance adjustment was declined. Reference request ${input.requestId}.`);
      return {requestId:input.requestId,status:"rejected"};
    }
    const amount=decimal(row.amount);const signed=row.direction==="credit"?amount:amount.negated();
    const transaction=await createMiningLedgerTransaction(conn,{userId:Number(row.userId),actorUserId:adminId,transactionType:"adjustment",idempotencyKey:`mining-adjustment-tx:${input.requestId}`,reason,metadata:{requestId:input.requestId,asset:row.assetCode,amount:amount.toString(),direction:row.direction,dualApproval:true,simulationOnly:true}});
    await postMiningLedgerEntries(conn,transaction,[{userId:Number(row.userId),asset:String(row.assetCode),amount:signed,entryType:`mining_adjustment_${row.direction}`},{userId:0,asset:String(row.assetCode),amount:signed.negated(),entryType:"mining_adjustment_clearing"}]);
    await conn.execute(`UPDATE mining_adjustment_requests SET status='approved',approvedBy=?,ledgerTransactionId=?,resolvedAt=UTC_TIMESTAMP(3) WHERE id=?`,[adminId,transaction.id,input.requestId]);
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.adjustment.approved_and_posted",entityType:"mining_adjustment_request",entityId:String(input.requestId),reason,metadata:{userId:Number(row.userId),asset:row.assetCode,amount:amount.toString(),direction:row.direction,ledgerTransactionId:transaction.id,reference:transaction.referenceCode,requestedBy:Number(row.requestedBy)}});
    await createMiningNotification(conn,Number(row.userId),"Mining adjustment approved",`A simulated ${row.direction} of ${amount.toString()} ${row.assetCode} was posted after a second administrator approved it. Reference ${transaction.referenceCode}.`);
    return {requestId:input.requestId,status:"approved",ledgerTransactionId:transaction.id,reference:transaction.referenceCode};
  }));
}

export async function reverseMiningTransaction(adminId:number,input:{transactionId:number;reason:string}) {
  const reason=requiredReason(input.reason,"Reversal reason");
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>{
    const [rows]=await conn.query<any[]>(`SELECT * FROM mining_ledger_transactions WHERE id=? FOR UPDATE`,[input.transactionId]);const original=rows[0];
    if(!original||original.status!=="posted"||!original.userId)throw new MiningError("Only a posted customer Mining transaction can be reversed");
    await ensureMiningCheckpoint(conn,Number(original.userId));
    const [existing]=await conn.query<any[]>(`SELECT id,referenceCode FROM mining_ledger_transactions WHERE reversalOfId=? LIMIT 1`,[input.transactionId]);
    if(existing[0])return {transactionId:Number(existing[0].id),reference:existing[0].referenceCode,status:"already_reversed"};
    const [entries]=await conn.query<any[]>(`SELECT l.id,l.walletId,l.amount,l.assetCode,l.entryType,w.userId FROM v5_wallet_ledger l JOIN v5_wallets w ON w.id=l.walletId WHERE l.referenceType='mining_transaction' AND l.referenceId=? ORDER BY l.id`,[String(input.transactionId)]);
    if(!entries.length)throw new MiningError("The original transaction has no Mining journal entries and cannot be reversed");
    if(original.transactionType==="asset_reclassification"||entries.some((entry:any)=>entry.assetCode==="TOKEN"))throw new MiningError("This historical cross-asset transaction cannot be reversed as a single CKI transaction. Review its journal and request a controlled CKI adjustment if needed.");
    const reversal=await createMiningLedgerTransaction(conn,{userId:Number(original.userId),actorUserId:adminId,transactionType:"reversal",idempotencyKey:`mining-reversal:${input.transactionId}`,reversalOfId:input.transactionId,reason,metadata:{reversesTransactionId:input.transactionId,originalReference:original.referenceCode,simulationOnly:true}});
    const deltas=entries.map((entry:any)=>({userId:Number(entry.userId),asset:String(entry.assetCode),amount:decimal(entry.amount).negated(),entryType:"mining_reversal",reversalOfId:Number(entry.id)}));
    await postMiningLedgerEntries(conn,reversal,deltas);
    await conn.execute(`UPDATE mining_ledger_transactions SET status='reversed' WHERE id=?`,[input.transactionId]);
    await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.ledger.transaction.reversed",entityType:"mining_ledger_transaction",entityId:String(input.transactionId),reason,reference:reversal.referenceCode,metadata:{originalReference:original.referenceCode,reversalTransactionId:reversal.id,userId:Number(original.userId)}});
    await createMiningNotification(conn,Number(original.userId),"Mining transaction reversed",`Transaction ${original.referenceCode} was reversed by an administrator. Reversal reference ${reversal.referenceCode}.`);
    return {transactionId:reversal.id,reference:reversal.referenceCode,status:"reversed",reversesTransactionId:input.transactionId};
  }));
}

async function reconcileOnConnection(conn:Db,adminId:number|null,repair:boolean,reason?:string) {
  const [wallets]=await conn.query<any[]>(`SELECT w.id,w.userId,w.assetCode,w.availableAmount,b.openingAmount FROM v5_wallets w JOIN mining_wallet_baselines b ON b.walletId=w.id
    WHERE EXISTS (SELECT 1 FROM v5_wallet_ledger l WHERE l.walletId=w.id AND l.referenceType='mining_transaction') ORDER BY w.id`);
  const rows:any[]=[];let repaired=0;let skipped=0;
  for(const wallet of wallets){
    const [other]=await conn.query<any[]>(`SELECT COUNT(*) total FROM v5_wallet_ledger WHERE walletId=? AND referenceType<>'mining_transaction'`,[Number(wallet.id)]);
    if(Number(other[0]?.total||0)>0){skipped++;rows.push({walletId:Number(wallet.id),userId:Number(wallet.userId),asset:wallet.assetCode,status:"skipped_non_mining_entries",current:String(wallet.availableAmount),expected:null});continue;}
    const [sumRows]=await conn.query<any[]>(`SELECT COALESCE(SUM(CAST(amount AS DECIMAL(65,18))),0) total FROM v5_wallet_ledger WHERE walletId=? AND referenceType='mining_transaction'`,[Number(wallet.id)]);
    const expected=decimal(wallet.openingAmount).plus(decimal(sumRows[0]?.total||0));
    const current=decimal(wallet.availableAmount);const mismatch=!current.eq(expected);
    let status="balanced";
    if(mismatch&&repair){
      const [locked]=await conn.query<any[]>(`SELECT id FROM v5_wallets WHERE id=? FOR UPDATE`,[Number(wallet.id)]);
      if(!locked[0])throw new MiningError("A wallet disappeared during reconciliation");
      await conn.execute(`UPDATE v5_wallets SET availableAmount=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[expected.toFixed(assetScale(String(wallet.assetCode)),Decimal.ROUND_DOWN),Number(wallet.id)]);
      await writeMiningAudit(conn,{actorUserId:adminId,action:"mining.ledger.snapshot.rebuilt",entityType:"v5_wallet",entityId:String(wallet.id),reason,metadata:{userId:Number(wallet.userId),asset:wallet.assetCode,previousBalance:current.toString(),rebuiltBalance:expected.toString()}});
      status="rebuilt_from_journal";repaired++;
    }else if(mismatch)status="mismatch";
    rows.push({walletId:Number(wallet.id),userId:Number(wallet.userId),asset:wallet.assetCode,status,current:current.toString(),expected:expected.toString()});
  }
  return {checked:wallets.length,repaired,skipped,discrepancies:rows.filter(row=>["mismatch","rebuilt_from_journal"].includes(row.status)).length,rows};
}

export async function reconcileMiningLedger(adminId:number|null,input:{repair?:boolean;reason?:string}={}) {
  if(input.repair&&!adminId)throw new MiningError("An administrator identity is required to rebuild wallet snapshots");
  const reason=input.repair?requiredReason(input.reason||"","Reconciliation repair reason"):undefined;
  return withMiningConnection(async conn=>inMiningTransaction(conn,async()=>reconcileOnConnection(conn,adminId,Boolean(input.repair),reason)));
}

export async function getMiningAdminDashboard() {
  return withMiningConnection(async conn=>{
    const config=await loadMiningConfig(conn);
    const [[miners]]=await conn.query<any[]>(`SELECT COUNT(DISTINCT userId) total FROM mining_customer_packages WHERE status='active' AND startsAt<=UTC_TIMESTAMP(3) AND (expiresAt IS NULL OR expiresAt>UTC_TIMESTAMP(3))`);
    const [[rewards]]=await conn.query<any[]>(`SELECT COALESCE(SUM(tokenAmount),0) total FROM mining_reward_events`);
    const [[packages]]=await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_packages WHERE status='published'`);
    const [[purchases]]=await conn.query<any[]>(`SELECT COUNT(*) total,COALESCE(SUM(baseThsSnapshot),0) ths FROM mining_customer_packages WHERE status IN ('active','replaced')`);
    const [[boosts]]=await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_boost_activations WHERE status='active' AND endsAt>UTC_TIMESTAMP(3)`);
    const [[conversions]]=await conn.query<any[]>(`SELECT COUNT(*) total FROM v5_conversions c JOIN mining_quote_snapshots s ON s.quoteId=c.quoteId WHERE c.status='COMPLETED'`);
    const [[pendingAdjustments]]=await conn.query<any[]>(`SELECT COUNT(*) total FROM mining_adjustment_requests WHERE status='pending'`);
    const [[conversionQueue]]=await conn.query<any[]>(`SELECT SUM(status IN ('queued','retrying')) queued,SUM(status='waiting') waiting,SUM(status='failed') failed FROM mining_conversion_jobs`);
    const feed=[];for(const asset of ["EUR","GBP","BTC","ETH","USDT"]){try{const rate=await getMiningAssetRate(conn,asset,config);feed.push({asset,status:"fresh",usdPerUnit:rate.usdPerUnit.toSignificantDigits(12).toString(),provider:rate.provider,observedAt:rate.observedAt.toISOString()});}catch(error){feed.push({asset,status:"paused",issue:error instanceof MiningError?error.message:"Feed unavailable"});}}
    const reconciliation=await reconcileOnConnection(conn,null,false);
    const packageRows=await packageList(conn);
    return {serverTime:new Date().toISOString(),economics:{version:config.version,globalEnabled:config.globalEnabled,boostsEnabled:config.boostsEnabled,tokenName:config.tokenName,tokenSymbol:config.tokenSymbol,usdPerToken:decimal(1).div(config.tokenUnitsPerUsd).toSignificantDigits(18).toString(),tokenUnitsPerUsd:config.tokenUnitsPerUsd,rewardTokensPerThsHour:config.rewardTokensPerThsHour,swapFeeBps:config.swapFeeBps,purchaseFeeBps:config.purchaseFeeBps,dualApprovalThresholdUsd:config.dualApprovalThresholdUsd},metrics:{activeMiners:Number(miners?.total||0),publishedPackages:Number(packages?.total||0),customerPackagePurchases:Number(purchases?.total||0),purchasedBaseThs:String(purchases?.ths||"0"),activeBoosts:Number(boosts?.total||0),simulatedTokensCredited:String(rewards?.total||"0"),completedConversions:Number(conversions?.total||0),pendingAdjustmentApprovals:Number(pendingAdjustments?.total||0),conversionQueue:{queued:Number(conversionQueue?.queued||0),waiting:Number(conversionQueue?.waiting||0),failed:Number(conversionQueue?.failed||0)}},priceFeeds:feed,reconciliation:{checked:reconciliation.checked,discrepancies:reconciliation.discrepancies,skipped:reconciliation.skipped},packages:packageRows,recentAudit:await (async()=>{const [rows]=await conn.query<any[]>(`SELECT id,actorUserId,action,entityType,entityId,reason,reference,createdAt FROM v5_audit_events WHERE action LIKE 'mining.%' ORDER BY id DESC LIMIT 30`);return rows.map(row=>({id:Number(row.id),actorUserId:row.actorUserId?Number(row.actorUserId):null,action:row.action,entityType:row.entityType,entityId:row.entityId,reason:row.reason||null,reference:row.reference||null,createdAt:byDate(row.createdAt)}));})()};
  });
}

export async function listMiningAdjustmentQueue() {
  return withMiningConnection(async conn=>{
    const [rows]=await conn.query<any[]>(`SELECT a.*,u.name customerName,u.email customerEmail,req.name requesterName FROM mining_adjustment_requests a JOIN users u ON u.id=a.userId LEFT JOIN users req ON req.id=a.requestedBy WHERE a.status='pending' ORDER BY a.createdAt ASC LIMIT 100`);
    return rows.map(row=>({requestId:Number(row.id),userId:Number(row.userId),customerName:row.customerName||"",customerEmail:row.customerEmail||"",asset:assertMiningAsset(String(row.assetCode)),amount:String(row.amount),direction:row.direction,reason:row.reason,requestedBy:Number(row.requestedBy),requesterName:row.requesterName||null,createdAt:byDate(row.createdAt)}));
  });
}
