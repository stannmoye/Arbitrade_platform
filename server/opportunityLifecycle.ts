import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";
import { buildCompanySpotlightPool, nextCompanySpotlight, parseCompanyCatalogueAdminState, type CompanySpotlightState, type CompanySpotlightRepeatPolicy } from "./modules/company-spotlight-rotation";
import { getCompanyReferenceById } from "./modules/company-catalogue-reference";
import { acknowledgeDelivery, claimDeliveryDispatch, deliveryAdmissionLockKey, deliveryIdempotencyKey, failDeliveryAttempt, type DeliveryState } from "./modules/opportunity-delivery-lifecycle";
import { DELIVERY_RETRY_POLICY_SETTING_KEY, FAIL_CLOSED_DELIVERY_RETRY_POLICY, parseDeliveryRetryPolicy } from "./modules/opportunity-delivery-retry-policy";
import { isRetryableMySqlTransactionError, mysqlTransactionRetryDelayMs, MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS } from "./modules/mysql-transaction-retry";

type PopupDelivery = {
  userId: number;
  offerId: number;
  quotaDay: string;
  packageId: number;
  packageName: string;
  maxPendingDeliveries: number;
  symbol: string;
  currency: string;
  minimumMinor: number;
  expectedRewardBps: number;
  configuredProfitRateBps: number;
  configuredDurationSeconds: number;
  configuredPopupDisplaySeconds: number;
  packagePolicyVersionSnapshot: number;
  policyVersion: number;
  durationSeconds: number;
  badgeLabel: string | null;
  packageBadgeLabel: string | null;
  badgeStyle: string;
  companyRotationEnabled: boolean;
  companyRotationCountryNames: string;
  companyRotationRepeatPolicy: CompanySpotlightRepeatPolicy;
  companyReferenceId?: string | null;
  companyDisplayName?: string | null;
  companyLogoUrl?: string | null;
  companyReferenceMetadataJson?: string | null;
  balanceAvailableMinor: number;
  balanceStatus: "sufficient" | "insufficient" | "unknown";
  marketObservedAt?: Date | null;
  marketSnapshotJson?: string | null;
};

async function withConnection<T>(fn: (connection: mysql.PoolConnection) => Promise<T>) {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), connectionLimit: 3 });
  const connection = await pool.getConnection();
  try { return await fn(connection); } finally { connection.release(); await pool.end(); }
}

export async function ensurePopupDeliveries(deliveries: PopupDelivery[]) {
  if (!deliveries.length || !process.env.DATABASE_URL) return new Map<string, number>();
  return withConnection(async connection => {
    deliveryLoop: for (const item of deliveries) {
      const eventKey = deliveryIdempotencyKey(item.userId, item.offerId);
      for (let transactionAttempt = 1; transactionAttempt <= MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS; transactionAttempt += 1) {
        await connection.beginTransaction();
        try {
        if (!Number.isSafeInteger(item.packageId) || item.packageId < 1) throw new Error("Delivery package identity is invalid.");
        const lockKey = deliveryAdmissionLockKey(item.userId, item.packageId);
        await connection.execute(
          "INSERT INTO app_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey)",
          [lockKey, "", item.userId],
        );
        await connection.query<any[]>("SELECT id FROM app_settings WHERE settingKey=? FOR UPDATE", [lockKey]);
        const [alreadyCreated] = await connection.query<any[]>(
          "SELECT popupEventId FROM opportunity_delivery_idempotency WHERE userId=? AND offerId=? LIMIT 1 FOR UPDATE",
          [item.userId, item.offerId],
        );
        if (alreadyCreated.length) {
          await connection.commit();
          continue deliveryLoop;
        }
        const [pendingRows] = await connection.query<any[]>(
          "SELECT e.id FROM opportunity_popup_events e INNER JOIN opportunity_offers o ON o.id=e.offerId WHERE e.userId=? AND e.packageId=? AND e.deliveryStatus IN ('queued','in_progress','retry_wait') AND (e.balanceStatus IS NULL OR e.balanceStatus<>'insufficient') AND e.eventStatus NOT IN ('TRADED','SETTLED','WITHDRAWN','DISMISSED') AND o.assignedUserId=e.userId AND o.assignedPackageId=e.packageId AND o.status='open' AND o.closesAt>CURRENT_TIMESTAMP FOR UPDATE",
          [item.userId, item.packageId],
        );
        if (pendingRows.length >= item.maxPendingDeliveries) {
          await connection.commit();
          continue deliveryLoop;
        }

        let company: { id: string; name: string; logoUrl: string; metadataJson: string; rotationCycle: number; rotationSequence: number; poolFingerprint: string } | null = null;
        if (item.companyReferenceId) {
          const [catalogueRows] = await connection.query<any[]>(
            "SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1 LOCK IN SHARE MODE",
            ["trade.companyCatalogue.adminState"],
          );
          const catalogueState = parseCompanyCatalogueAdminState(String(catalogueRows[0]?.settingValue || "{}"));
          const pinned = getCompanyReferenceById(String(item.companyReferenceId));
          if (!pinned || !catalogueState.verifiedIds.includes(pinned.id) || catalogueState.archivedIds.includes(pinned.id) || (catalogueState.disabledIds || []).includes(pinned.id)) {
            throw new Error("Generated opportunity company is no longer approved for customer display.");
          }
          let metadata: Record<string, unknown> = {};
          try { const parsed = JSON.parse(String(item.companyReferenceMetadataJson || "{}")); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed; } catch { metadata = {}; }
          company = {
            id: pinned.id,
            name: pinned.name,
            logoUrl: pinned.logoUrl,
            metadataJson: JSON.stringify({ ...metadata, adminCatalogueStatus: "verified", referenceOnly: true }),
            rotationCycle: Number(metadata.rotationCycle || 0),
            rotationSequence: Number(metadata.rotationSequence || 0),
            poolFingerprint: String(metadata.poolFingerprint || ""),
          };
        } else if (item.companyRotationEnabled) {
          // Read-lock the administrator catalogue state for this transaction so a
          // concurrent verify/unverify/archive action cannot race this selection.
          const [catalogueRows] = await connection.query<any[]>(
            "SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1 LOCK IN SHARE MODE",
            ["trade.companyCatalogue.adminState"],
          );
          const catalogueState = parseCompanyCatalogueAdminState(String(catalogueRows[0]?.settingValue || "{}"));
          const pool = buildCompanySpotlightPool(item.companyRotationCountryNames, catalogueState);
          if (pool.length) {
            const stateKey = "trading.companyRotation." + item.userId + "." + item.packageId;
            if (stateKey.length > 120) throw new Error("Company rotation scope key exceeds the storage limit.");
            await connection.execute(
            "INSERT INTO app_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey)",
            [stateKey, "", item.userId],
          );
          const [stateRows] = await connection.query<any[]>(
            "SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE",
            [stateKey],
          );
          let persistedRotation = String(stateRows[0]?.settingValue || "");
          const legacyStateKey = "trading.companyRotation." + item.userId + "." + item.packageName;
          if (legacyStateKey !== stateKey) {
            await connection.execute(
              "INSERT INTO app_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey)",
              [legacyStateKey, "", item.userId],
            );
            const [legacyStateRows] = await connection.query<any[]>(
              "SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE",
              [legacyStateKey],
            );
            if (!persistedRotation) persistedRotation = String(legacyStateRows[0]?.settingValue || "");
          }

          // The per-customer/per-tier lock also serializes concurrent workers.
          // Re-check idempotency after waiting for that lock before advancing rotation.
          const [racedEvent] = await connection.query<any[]>(
            "SELECT popupEventId FROM opportunity_delivery_idempotency WHERE userId=? AND offerId=? LIMIT 1 FOR UPDATE",
            [item.userId, item.offerId],
          );
          if (racedEvent.length) {
            await connection.commit();
            continue deliveryLoop;
          }

          let priorState: CompanySpotlightState | null = null;
          try {
            const parsed = JSON.parse(persistedRotation);
            if (parsed && typeof parsed === "object") priorState = parsed as CompanySpotlightState;
          } catch {
            priorState = null;
          }
          const selection = nextCompanySpotlight(
            pool,
            priorState,
            item.userId,
            String(item.packageId),
            item.companyRotationRepeatPolicy,
          );
          company = {
            id: String(selection.company.id),
            name: String(selection.company.name),
            logoUrl: String(selection.company.logoUrl),
            rotationCycle: selection.rotationCycle,
            rotationSequence: selection.rotationSequence,
            poolFingerprint: selection.poolFingerprint,
            metadataJson: JSON.stringify({
              rotationStateVersion: 1,
              rotationCycle: selection.rotationCycle,
              rotationSequence: selection.rotationSequence,
              poolFingerprint: selection.poolFingerprint,
              repeatPolicy: item.companyRotationRepeatPolicy,
              ticker: selection.company.ticker,
              symbol: selection.company.symbol,
              exchangeCode: selection.company.exchangeCode,
              tickerResearchStatus: selection.company.tickerResearchStatus,
              tickerSource: selection.company.tickerSource,
              parentTicker: selection.company.parentTicker,
              whyNoRealTicker: selection.company.whyNoRealTicker,
              tickerClassification: selection.company.tickerClassification,
              countryCode: selection.company.countryCode,
              countryName: selection.company.countryName,
              domain: selection.company.domain,
              logoSourceName: selection.company.logoSourceName,
              logoSourceUrl: selection.company.logoSourceUrl,
              listingStatus: selection.company.listingStatus,
              lastVerifiedAt: selection.company.lastVerifiedAt,
              requiresManualVerification: selection.company.requiresManualVerification,
              sourceConfidence: selection.company.sourceConfidence,
              sector: selection.company.sector,
              headquartersCountry: selection.company.headquartersCountry,
              instrumentType: selection.company.instrumentType,
              recordCompleteness: selection.company.recordCompleteness,
              adminCatalogueStatus: "verified",
              referenceOnly: true,
            }),
          };
          await connection.execute(
            "UPDATE app_settings SET settingValue=?,updatedBy=?,updatedAt=CURRENT_TIMESTAMP WHERE settingKey=?",
            [JSON.stringify(selection.state), item.userId, stateKey],
          );
            // The opportunity row and its company/rotation snapshot are inserted in
            // this same transaction. A rollback therefore restores the cursor too.
          }
        }

        const [insertResult] = await connection.execute<any>(
          `INSERT INTO opportunity_popup_events
            (eventKey,userId,offerId,quotaDay,packageId,packageName,symbol,currency,minimumMinor,expectedRewardBps,
             configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds,packagePolicyVersionSnapshot,packageBadgeLabel,
             companyReferenceId,companyDisplayName,companyLogoUrl,companyReferenceMetadataJson,companyReferenceOnly,
             balanceAvailableMinor,balanceStatus,marketObservedAt,marketSnapshotJson,durationSeconds,badgeLabel,badgeStyle,policyVersion,
             eventStatus,deliveredAt,deliveryStatus,deliveryAttemptCount,deliveryPolicyVersionSnapshot,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DELIVERED',CURRENT_TIMESTAMP,'queued',0,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE updatedAt=CURRENT_TIMESTAMP`,
          [
            eventKey, item.userId, item.offerId, item.quotaDay, item.packageId, item.packageName, item.symbol, item.currency,
            item.minimumMinor, item.expectedRewardBps, item.configuredProfitRateBps, item.configuredDurationSeconds,
            item.configuredPopupDisplaySeconds, item.packagePolicyVersionSnapshot, item.packageBadgeLabel || null,
            company?.id || null, company?.name || null, company?.logoUrl || null, company?.metadataJson || null, company ? 1 : 0,
            item.balanceAvailableMinor, item.balanceStatus, item.marketObservedAt || null, item.marketSnapshotJson || null,
            item.durationSeconds, item.badgeLabel || null, item.badgeStyle, item.policyVersion,
          ],
        );
        const popupEventId = Number(insertResult.insertId || 0);
        if (!popupEventId) throw new Error("Durable popup lifecycle insert did not return an event identifier.");
        await connection.execute(
          "INSERT INTO opportunity_delivery_idempotency (userId,offerId,popupEventId,packageId,packageName) VALUES (?,?,?,?,?)",
          [item.userId, item.offerId, popupEventId, item.packageId, item.packageName],
        );
        await connection.execute(
          "UPDATE opportunity_generation_assignments SET status='delivered',deliveredAt=COALESCE(deliveredAt,CURRENT_TIMESTAMP),updatedAt=CURRENT_TIMESTAMP WHERE userId=? AND offerId=? AND status='generated'",
          [item.userId, item.offerId],
        );
        await connection.commit();
        } catch (error) {
          try {
            await connection.rollback();
          } catch {
            // Preserve the original database error and fail closed.
          }
          if (isRetryableMySqlTransactionError(error) && transactionAttempt < MYSQL_TRANSACTION_RETRY_MAX_ATTEMPTS) {
            await new Promise<void>(resolve => setTimeout(resolve, mysqlTransactionRetryDelayMs(transactionAttempt)));
            continue;
          }
          throw error;
        }
      }
    }
    // Resolve IDs through the durable idempotency records, not the display eventKey.
    // The unique (userId, offerId) identity is the contract used by callers and
    // remains stable even if an eventKey representation changes.
    const identityPredicates = deliveries.map(() => "(userId=? AND offerId=?)").join(" OR ");
    const identityParams = deliveries.flatMap(item => [item.userId, item.offerId]);
    const [rows] = await connection.query<any[]>(
      `SELECT userId,offerId,popupEventId FROM opportunity_delivery_idempotency WHERE ${identityPredicates}`,
      identityParams,
    );
    return new Map<string, number>(rows.map(row => [
      deliveryIdempotencyKey(Number(row.userId), Number(row.offerId)),
      Number(row.popupEventId),
    ]));
  });
}

async function applyPopupLifecycle(userId: number, eventId: number, action: "noticed" | "opened" | "dismissed" | "withdrawn" | "traded" | "settled") {
  if (!process.env.DATABASE_URL) return;
  const timestamps: Record<string, string> = { noticed: "noticedAt", opened: "openedAt", dismissed: "dismissedAt", withdrawn: "withdrawnAt", traded: "tradedAt", settled: "settledAt" };
  const statuses: Record<string, string> = { noticed: "NOTICED", opened: "OPENED", dismissed: "DISMISSED", withdrawn: "WITHDRAWN", traded: "TRADED", settled: "SETTLED" };
  const column = timestamps[action];
  await withConnection(async connection => {
    if (action === "dismissed") {
      await connection.execute(`UPDATE opportunity_popup_events SET ${column}=COALESCE(${column},CURRENT_TIMESTAMP), eventStatus='DISMISSED', deliveryStatus=CASE WHEN deliveryStatus IN ('queued','in_progress','retry_wait') THEN 'dismissed' ELSE deliveryStatus END, deliveryRetryAfter=NULL, deliveryLeaseToken=NULL, deliveryLeaseExpiresAt=NULL, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND eventStatus NOT IN ('TRADED','SETTLED','WITHDRAWN') AND deliveryStatus<>'expired'`, [eventId, userId]);
    } else if (action === "noticed" || action === "opened") {
      await connection.execute(`UPDATE opportunity_popup_events SET ${column}=COALESCE(${column},CURRENT_TIMESTAMP), eventStatus=?, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND eventStatus NOT IN ('TRADED','SETTLED','WITHDRAWN') AND deliveryStatus NOT IN ('failed','dismissed','expired')`, [statuses[action], eventId, userId]);
    } else {
      // Server-owned terminal transitions must still allow TRADED -> SETTLED.
      await connection.execute(`UPDATE opportunity_popup_events SET ${column}=COALESCE(${column},CURRENT_TIMESTAMP), eventStatus=?, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryStatus NOT IN ('failed','dismissed','expired')`, [statuses[action], eventId, userId]);
    }
  });
}

/** Customer acknowledgement may change presentation state only; terminal outcomes are server-owned. */
export async function updatePopupLifecycle(userId: number, eventId: number, action: "noticed" | "opened" | "dismissed") {
  if (!["noticed", "opened", "dismissed"].includes(action)) throw new Error("Customer popup lifecycle action is not permitted.");
  return applyPopupLifecycle(userId, eventId, action);
}

export async function updatePopupLifecycleForOffer(userId: number, offerId: number, action: "traded" | "settled") {
  if (!process.env.DATABASE_URL) return;
  await withConnection(async connection => {
    const [rows] = await connection.query<any[]>("SELECT id FROM opportunity_popup_events WHERE userId=? AND offerId=? ORDER BY deliveredAt DESC LIMIT 1", [userId, offerId]);
    if (rows[0]) await applyPopupLifecycle(userId, Number(rows[0].id), action);
  });
}

export async function updatePopupDeliveryStatus(userId: number, eventId: number, status: "received" | "rendered" | "failed", errorCode?: string, leaseToken?: string) {
  if (!process.env.DATABASE_URL || !leaseToken) return;
  await withConnection(async connection => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query<any[]>("SELECT e.*,o.status AS offerStatus,o.closesAt FROM opportunity_popup_events e LEFT JOIN opportunity_offers o ON o.id=e.offerId WHERE e.id=? AND e.userId=? LIMIT 1 FOR UPDATE", [eventId, userId]);
      const row=rows[0];
      if (!row || ["failed","dismissed","expired","delivered","rendered"].includes(String(row.deliveryStatus)) || row.eventStatus === "DISMISSED") {
        await connection.commit(); return;
      }
      if (String(row.deliveryLeaseToken || "") !== leaseToken) { await connection.commit(); return; }
      if (row.offerStatus !== "open" || !row.closesAt || new Date(row.closesAt).getTime() <= Date.now()) {
        await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus='expired',expiredAt=COALESCE(expiredAt,CURRENT_TIMESTAMP),deliveryRetryAfter=NULL,deliveryLeaseToken=NULL,deliveryLeaseExpiresAt=NULL,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryStatus IN ('queued','in_progress','retry_wait')", [eventId,userId]);
        await connection.commit(); return;
      }
      const currentDeliveryStatus = String(row.deliveryStatus);
      const finalRenderAfterReceipt = status === "rendered" && currentDeliveryStatus === "received";
      if (currentDeliveryStatus !== "in_progress" &&
        !(status === "failed" && currentDeliveryStatus === "received") &&
        !finalRenderAfterReceipt) { await connection.commit(); return; }
      if (status === "failed") {
        const [policyRows] = await connection.query<any[]>("SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1", [DELIVERY_RETRY_POLICY_SETTING_KEY]);
        const saved=parseDeliveryRetryPolicy(policyRows[0]?.settingValue) || FAIL_CLOSED_DELIVERY_RETRY_POLICY;
        const schedule=saved.effectiveAt && Date.parse(saved.effectiveAt)>Date.now() ? FAIL_CLOSED_DELIVERY_RETRY_POLICY : saved;
        const current:DeliveryState={deliveryStatus:"in_progress",deliveryAttemptCount:Number(row.deliveryAttemptCount||0),deliveryRetryAfter:row.deliveryRetryAfter?new Date(row.deliveryRetryAfter):null,deliveryLeaseToken:row.deliveryLeaseToken,eventStatus:String(row.eventStatus)};
        const transition=failDeliveryAttempt({state:current,now:new Date(),errorCode:errorCode||null,retrySchedule:schedule,permanent:String(errorCode||"").toUpperCase().startsWith("PERMANENT_")});
        await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus=?,deliveryRetryAfter=?,deliveryLeaseToken=NULL,deliveryLeaseExpiresAt=NULL,lastErrorCode=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryLeaseToken=? AND deliveryStatus IN ('in_progress','received') AND eventStatus<>'DISMISSED'", [transition.state.deliveryStatus,transition.retryAt,errorCode||null,eventId,userId,row.deliveryLeaseToken]);
      } else {
        const next=acknowledgeDelivery({state:{deliveryStatus:String(row.deliveryStatus) as DeliveryState["deliveryStatus"],deliveryAttemptCount:Number(row.deliveryAttemptCount||0),deliveryRetryAfter:row.deliveryRetryAfter?new Date(row.deliveryRetryAfter):null,deliveryLeaseToken:row.deliveryLeaseToken,eventStatus:String(row.eventStatus)},status,leaseToken});
        if (next.changed) {
          const timestamp=status === "received" ? "receivedAt" : "renderedAt";
          const finalRender = status === "rendered";
          await connection.execute(`UPDATE opportunity_popup_events SET deliveryStatus=?,${timestamp}=COALESCE(${timestamp},CURRENT_TIMESTAMP),deliveryLeaseToken=${finalRender ? "NULL" : "deliveryLeaseToken"},deliveryLeaseExpiresAt=${finalRender ? "NULL" : "deliveryLeaseExpiresAt"},lastErrorCode=NULL,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryLeaseToken=? AND deliveryStatus IN ('in_progress','received') AND eventStatus<>'DISMISSED'`, [status,eventId,userId,row.deliveryLeaseToken]);
        }
      }
      await connection.commit();
    } catch(error) { await connection.rollback(); throw error; }
  });
}

/** Claim queued/retry-due popup dispatches for the authenticated customer poll. */
export async function claimPopupDeliveryDispatches(userId:number) {
  if (!process.env.DATABASE_URL) return [];
  return withConnection(async connection=>{
    await connection.beginTransaction();
    try {
      const [policyRows]=await connection.query<any[]>("SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1",[DELIVERY_RETRY_POLICY_SETTING_KEY]);
      const saved=parseDeliveryRetryPolicy(policyRows[0]?.settingValue)||FAIL_CLOSED_DELIVERY_RETRY_POLICY;
      const schedule=saved.effectiveAt&&Date.parse(saved.effectiveAt)>Date.now()?FAIL_CLOSED_DELIVERY_RETRY_POLICY:saved;
      const [rows]=await connection.query<any[]>(`SELECT e.id,e.offerId,e.eventStatus,e.deliveryStatus,e.deliveryAttemptCount,e.deliveryRetryAfter,e.deliveryLeaseToken,e.deliveryLeaseExpiresAt,o.status AS offerStatus,o.closesAt FROM opportunity_popup_events e LEFT JOIN opportunity_offers o ON o.id=e.offerId WHERE e.userId=? AND e.deliveryStatus IN ('queued','in_progress','retry_wait') ORDER BY e.createdAt,e.id LIMIT 100 FOR UPDATE`,[userId]);
      const claimed=[] as Array<{eventId:number;attemptNumber:number;leaseToken:string;deliveryStatus:string}>;
      const now=new Date();
      for(const row of rows){
        const expiredOffer=row.offerStatus!=="open"||!row.closesAt||new Date(row.closesAt).getTime()<=now.getTime();
        if(row.eventStatus==="DISMISSED"||expiredOffer){
          await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus=?,expiredAt=IF(?='expired',COALESCE(expiredAt,CURRENT_TIMESTAMP),expiredAt),deliveryRetryAfter=NULL,deliveryLeaseToken=NULL,deliveryLeaseExpiresAt=NULL,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryStatus IN ('queued','in_progress','retry_wait')",[row.eventStatus==="DISMISSED"?"dismissed":"expired",row.eventStatus==="DISMISSED"?"dismissed":"expired",row.id,userId]);
          continue;
        }
        let state:DeliveryState={deliveryStatus:row.deliveryStatus,deliveryAttemptCount:Number(row.deliveryAttemptCount||0),deliveryRetryAfter:row.deliveryRetryAfter?new Date(row.deliveryRetryAfter):null,deliveryLeaseToken:row.deliveryLeaseToken,eventStatus:String(row.eventStatus)};
        if(state.deliveryStatus==="in_progress"){
          if(!row.deliveryLeaseExpiresAt||new Date(row.deliveryLeaseExpiresAt).getTime()>now.getTime()) {
            if(row.deliveryLeaseToken) claimed.push({eventId:Number(row.id),attemptNumber:state.deliveryAttemptCount,leaseToken:String(row.deliveryLeaseToken),deliveryStatus:"in_progress"});
            continue;
          }
          const failed=failDeliveryAttempt({state,now,errorCode:"DELIVERY_LEASE_EXPIRED",retrySchedule:schedule});
          await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus=?,deliveryRetryAfter=?,deliveryLeaseToken=NULL,deliveryLeaseExpiresAt=NULL,lastErrorCode='DELIVERY_LEASE_EXPIRED',updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryLeaseToken=? AND deliveryStatus='in_progress'",[failed.state.deliveryStatus,failed.retryAt,row.id,userId,row.deliveryLeaseToken]);
          state=failed.state;
          if(state.deliveryStatus!=="retry_wait") continue;
        }
        const token=crypto.randomUUID();
        const transition=claimDeliveryDispatch({state,now,leaseToken:token,offerOpen:true,offerClosesAt:new Date(row.closesAt),retrySchedule:schedule});
        if(!transition.claimed) {
          if(transition.reason==="attempts-exhausted") await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus='failed',lastErrorCode='DELIVERY_ATTEMPTS_EXHAUSTED',deliveryRetryAfter=NULL,deliveryLeaseToken=NULL,deliveryLeaseExpiresAt=NULL,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryStatus IN ('queued','retry_wait')",[row.id,userId]);
          continue;
        }
        await connection.execute("UPDATE opportunity_popup_events SET deliveryStatus='in_progress',deliveryAttemptCount=?,deliveryRetryAfter=NULL,deliveryLeaseToken=?,deliveryLeaseExpiresAt=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND),deliveryPolicyVersionSnapshot=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=? AND deliveryStatus IN ('queued','retry_wait') AND eventStatus<>'DISMISSED'",[transition.state.deliveryAttemptCount,token,schedule.version??1,row.id,userId]);
        claimed.push({eventId:Number(row.id),attemptNumber:transition.state.deliveryAttemptCount,leaseToken:token,deliveryStatus:"in_progress"});
      }
      await connection.commit(); return claimed;
    } catch(error){await connection.rollback();throw error;}
  });
}

export async function runOpportunityRetention() {
  if (!process.env.DATABASE_URL) return { expiredAssignments: 0, deletedEvents: 0, deletedDeliveryRows: 0 };
  return withConnection(async connection => {
    await connection.beginTransaction();
    try {
      await connection.execute(
        `INSERT INTO opportunity_popup_daily
          (userId,eventDate,deliveredCount,noticedCount,openedCount,dismissedCount,withdrawnCount,tradedCount,settledCount,zeroBalanceCount,lastEventAt,createdAt,updatedAt)
         SELECT userId,DATE(deliveredAt),COUNT(*),SUM(noticedAt IS NOT NULL),SUM(openedAt IS NOT NULL),SUM(dismissedAt IS NOT NULL),SUM(withdrawnAt IS NOT NULL),SUM(tradedAt IS NOT NULL),SUM(settledAt IS NOT NULL),SUM(balanceStatus='insufficient'),MAX(updatedAt),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
         FROM opportunity_popup_events
         WHERE deliveredAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
         GROUP BY userId,DATE(deliveredAt)
         ON DUPLICATE KEY UPDATE deliveredCount=VALUES(deliveredCount), noticedCount=VALUES(noticedCount), openedCount=VALUES(openedCount), dismissedCount=VALUES(dismissedCount), withdrawnCount=VALUES(withdrawnCount), tradedCount=VALUES(tradedCount), settledCount=VALUES(settledCount), zeroBalanceCount=VALUES(zeroBalanceCount), lastEventAt=VALUES(lastEventAt), updatedAt=CURRENT_TIMESTAMP`,
      );
      const [expiredAssignments] = await connection.execute<any>(
        `UPDATE opportunity_generation_assignments SET status='expired',failureReason=COALESCE(failureReason,'OFFER_EXPIRED'),updatedAt=CURRENT_TIMESTAMP
         WHERE status IN ('generated','delivered') AND expiresAt<=UTC_TIMESTAMP()`,
      );
      await connection.execute(
        `UPDATE opportunity_offers SET status='closed'
         WHERE assignedUserId IS NOT NULL AND generationKey IS NOT NULL AND status='open' AND closesAt<=UTC_TIMESTAMP()`,
      );
      await connection.execute(
        `UPDATE opportunity_popup_events p
         INNER JOIN opportunity_offers o ON o.id=p.offerId
         SET p.expiredAt=COALESCE(p.expiredAt,UTC_TIMESTAMP()),p.updatedAt=CURRENT_TIMESTAMP
         WHERE o.assignedUserId IS NOT NULL AND o.generationKey IS NOT NULL AND o.closesAt<=UTC_TIMESTAMP()
           AND p.eventStatus IN ('DELIVERED','NOTICED','OPENED') AND p.expiredAt IS NULL`,
      );
      await connection.execute(
        `UPDATE opportunity_popup_events p
         INNER JOIN opportunity_offers o ON o.id=p.offerId
         SET p.deliveryStatus='expired',p.expiredAt=COALESCE(p.expiredAt,UTC_TIMESTAMP()),p.deliveryRetryAfter=NULL,
             p.deliveryLeaseToken=NULL,p.deliveryLeaseExpiresAt=NULL,p.lastErrorCode='OPPORTUNITY_EXPIRED',p.updatedAt=CURRENT_TIMESTAMP
         WHERE o.assignedUserId IS NOT NULL AND o.generationKey IS NOT NULL AND o.closesAt<=UTC_TIMESTAMP()
           AND p.deliveryStatus IN ('queued','in_progress','retry_wait')
           AND p.eventStatus NOT IN ('TRADED','SETTLED','WITHDRAWN')`,
      );
      await connection.execute(
        `UPDATE opportunity_delivery_events e
         INNER JOIN opportunity_offers o ON o.id=e.offerId
         SET e.status='expired',e.lastErrorCode='OPPORTUNITY_EXPIRED',e.expiresAt=COALESCE(e.expiresAt,UTC_TIMESTAMP())
         WHERE o.assignedUserId IS NOT NULL AND o.generationKey IS NOT NULL AND o.closesAt<=UTC_TIMESTAMP()
           AND e.status='pending'`,
      );
      const [popupResult] = await connection.execute<any>("DELETE FROM opportunity_popup_events WHERE deliveredAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) AND deliveryStatus NOT IN ('queued','in_progress','retry_wait') AND eventStatus NOT IN ('DELIVERED','NOTICED','OPENED')");
      const [deliveryResult] = await connection.execute<any>("DELETE FROM opportunity_delivery_events WHERE deliveredAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) AND status IN ('expired','failed')");
      await connection.commit();
      return { expiredAssignments:Number(expiredAssignments.affectedRows||0),deletedEvents: Number(popupResult.affectedRows || 0), deletedDeliveryRows: Number(deliveryResult.affectedRows || 0) };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

export async function getOpportunityLifecycleSummary() {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, last24Hours: {}, retainedDaily: [], generatedAt: null };
  return withConnection(async connection => {
    const [recent] = await connection.query<any[]>(`SELECT COUNT(*) AS delivered, COALESCE(SUM(noticedAt IS NOT NULL), 0) AS noticed, COALESCE(SUM(openedAt IS NOT NULL), 0) AS opened, COALESCE(SUM(dismissedAt IS NOT NULL), 0) AS dismissed, COALESCE(SUM(withdrawnAt IS NOT NULL), 0) AS withdrawn, COALESCE(SUM(tradedAt IS NOT NULL), 0) AS traded, COALESCE(SUM(settledAt IS NOT NULL), 0) AS settled, COALESCE(SUM(balanceStatus='insufficient'), 0) AS zeroBalance FROM opportunity_popup_events WHERE deliveredAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)`);
    const [daily] = await connection.query<any[]>(`SELECT eventDate, SUM(deliveredCount) delivered, SUM(noticedCount) noticed, SUM(openedCount) opened, SUM(dismissedCount) dismissed, SUM(withdrawnCount) withdrawn, SUM(tradedCount) traded, SUM(settledCount) settled, SUM(zeroBalanceCount) zeroBalance FROM opportunity_popup_daily WHERE eventDate >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY eventDate ORDER BY eventDate DESC LIMIT 30`);
    return { sourceAvailable: true, last24Hours: recent[0] || {}, retainedDaily: daily, generatedAt: new Date().toISOString() };
  });
}

export function lifecycleIdempotencyKey(userId: number, offerId: number, action: string) {
  return crypto.createHash("sha256").update(`${userId}:${offerId}:${action}`).digest("hex").slice(0, 32);
}
