import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";
import { buildCompanySpotlightPool, nextCompanySpotlight, parseCompanyCatalogueAdminState, type CompanySpotlightState, type CompanySpotlightRepeatPolicy } from "./modules/company-spotlight-rotation";

type PopupDelivery = {
  userId: number;
  offerId: number;
  quotaDay: string;
  packageName: string;
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
    for (const item of deliveries) {
      const eventKey = `${item.userId}:${item.offerId}:${item.quotaDay}`;
      await connection.beginTransaction();
      try {
        const [alreadyCreated] = await connection.query<any[]>(
          "SELECT id FROM opportunity_popup_events WHERE eventKey=? LIMIT 1",
          [eventKey],
        );
        if (alreadyCreated.length) {
          await connection.commit();
          continue;
        }

        let company: { id: string; name: string; logoUrl: string; metadataJson: string; rotationCycle: number; rotationSequence: number; poolFingerprint: string } | null = null;
        if (item.companyRotationEnabled) {
          // Read-lock the administrator catalogue state for this transaction so a
          // concurrent verify/unverify/archive action cannot race this selection.
          const [catalogueRows] = await connection.query<any[]>(
            "SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1 LOCK IN SHARE MODE",
            ["trade.companyCatalogue.adminState"],
          );
          const catalogueState = parseCompanyCatalogueAdminState(String(catalogueRows[0]?.settingValue || "{}"));
          const pool = buildCompanySpotlightPool(item.companyRotationCountryNames, catalogueState);
          if (pool.length) {
            const stateKey = "trading.companyRotation." + item.userId + "." + item.packageName;
            if (stateKey.length > 120) throw new Error("Company rotation scope key exceeds the storage limit.");
            await connection.execute(
            "INSERT INTO app_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey)",
            [stateKey, "", item.userId],
          );
          const [stateRows] = await connection.query<any[]>(
            "SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE",
            [stateKey],
          );

          // The per-customer/per-tier lock also serializes concurrent workers.
          // Re-check idempotency after waiting for that lock before advancing rotation.
          const [racedEvent] = await connection.query<any[]>(
            // A locking/current read is required here: a prior ordinary SELECT can
            // keep its REPEATABLE READ snapshot while this worker waits for the cursor.
            "SELECT id FROM opportunity_popup_events WHERE eventKey=? LIMIT 1 FOR UPDATE",
            [eventKey],
          );
          if (racedEvent.length) {
            await connection.commit();
            continue;
          }

          let priorState: CompanySpotlightState | null = null;
          try {
            const parsed = JSON.parse(String(stateRows[0]?.settingValue || ""));
            if (parsed && typeof parsed === "object") priorState = parsed as CompanySpotlightState;
          } catch {
            priorState = null;
          }
          const selection = nextCompanySpotlight(
            pool,
            priorState,
            item.userId,
            item.packageName,
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

        await connection.execute(
          `INSERT INTO opportunity_popup_events
            (eventKey,userId,offerId,quotaDay,packageName,symbol,currency,minimumMinor,expectedRewardBps,
             configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds,packagePolicyVersionSnapshot,packageBadgeLabel,
             companyReferenceId,companyDisplayName,companyLogoUrl,companyReferenceMetadataJson,companyReferenceOnly,
             balanceAvailableMinor,balanceStatus,marketObservedAt,marketSnapshotJson,durationSeconds,badgeLabel,badgeStyle,policyVersion,
             eventStatus,deliveredAt,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DELIVERED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE updatedAt=CURRENT_TIMESTAMP`,
          [
            eventKey, item.userId, item.offerId, item.quotaDay, item.packageName, item.symbol, item.currency,
            item.minimumMinor, item.expectedRewardBps, item.configuredProfitRateBps, item.configuredDurationSeconds,
            item.configuredPopupDisplaySeconds, item.packagePolicyVersionSnapshot, item.packageBadgeLabel || null,
            company?.id || null, company?.name || null, company?.logoUrl || null, company?.metadataJson || null, company ? 1 : 0,
            item.balanceAvailableMinor, item.balanceStatus, item.marketObservedAt || null, item.marketSnapshotJson || null,
            item.durationSeconds, item.badgeLabel || null, item.badgeStyle, item.policyVersion,
          ],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    const keys = deliveries.map(item => `${item.userId}:${item.offerId}:${item.quotaDay}`);
    const placeholders = keys.map(() => "?").join(",");
    const [rows] = await connection.query<any[]>(`SELECT id,eventKey FROM opportunity_popup_events WHERE eventKey IN (${placeholders})`, keys);
    return new Map<string, number>(rows.map(row => [String(row.eventKey), Number(row.id)]));
  });
}

export async function updatePopupLifecycle(userId: number, eventId: number, action: "noticed" | "opened" | "dismissed" | "withdrawn" | "traded" | "settled") {
  if (!process.env.DATABASE_URL) return;
  const timestamps: Record<string, string> = { noticed: "noticedAt", opened: "openedAt", dismissed: "dismissedAt", withdrawn: "withdrawnAt", traded: "tradedAt", settled: "settledAt" };
  const statuses: Record<string, string> = { noticed: "NOTICED", opened: "OPENED", dismissed: "DISMISSED", withdrawn: "WITHDRAWN", traded: "TRADED", settled: "SETTLED" };
  const column = timestamps[action];
  await withConnection(async connection => {
    await connection.execute(`UPDATE opportunity_popup_events SET ${column}=COALESCE(${column},CURRENT_TIMESTAMP), eventStatus=?, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=?`, [statuses[action], eventId, userId]);
  });
}

export async function updatePopupLifecycleForOffer(userId: number, offerId: number, action: "traded" | "settled") {
  if (!process.env.DATABASE_URL) return;
  await withConnection(async connection => {
    const [rows] = await connection.query<any[]>("SELECT id FROM opportunity_popup_events WHERE userId=? AND offerId=? ORDER BY deliveredAt DESC LIMIT 1", [userId, offerId]);
    if (rows[0]) await updatePopupLifecycle(userId, Number(rows[0].id), action);
  });
}

export async function updatePopupDeliveryStatus(userId: number, eventId: number, status: "received" | "rendered" | "failed", errorCode?: string) {
  if (!process.env.DATABASE_URL) return;
  const timestamp = status === "received" ? "receivedAt" : status === "rendered" ? "renderedAt" : "updatedAt";
  await withConnection(async connection => {
    await connection.execute(`UPDATE opportunity_popup_events SET deliveryStatus=?, ${timestamp}=CURRENT_TIMESTAMP, lastErrorCode=?, deliveryAttemptCount=deliveryAttemptCount+${status === "failed" ? 1 : 0}, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND userId=?`, [status, errorCode || null, eventId, userId]);
  });
}

export async function runOpportunityRetention() {
  if (!process.env.DATABASE_URL) return { deletedEvents: 0, deletedDeliveryRows: 0 };
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
      const [popupResult] = await connection.execute<any>("DELETE FROM opportunity_popup_events WHERE deliveredAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)");
      const [deliveryResult] = await connection.execute<any>("DELETE FROM opportunity_delivery_events WHERE deliveredAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)");
      await connection.commit();
      return { deletedEvents: Number(popupResult.affectedRows || 0), deletedDeliveryRows: Number(deliveryResult.affectedRows || 0) };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

export async function getOpportunityLifecycleSummary() {
  if (!process.env.DATABASE_URL) return { last24Hours: {}, retainedDaily: [], generatedAt: new Date().toISOString() };
  return withConnection(async connection => {
    const [recent] = await connection.query<any[]>(`SELECT COUNT(*) AS delivered, SUM(noticedAt IS NOT NULL) AS noticed, SUM(openedAt IS NOT NULL) AS opened, SUM(dismissedAt IS NOT NULL) AS dismissed, SUM(withdrawnAt IS NOT NULL) AS withdrawn, SUM(tradedAt IS NOT NULL) AS traded, SUM(settledAt IS NOT NULL) AS settled, SUM(balanceStatus='insufficient') AS zeroBalance FROM opportunity_popup_events WHERE deliveredAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)`);
    const [daily] = await connection.query<any[]>(`SELECT eventDate, SUM(deliveredCount) delivered, SUM(noticedCount) noticed, SUM(openedCount) opened, SUM(dismissedCount) dismissed, SUM(withdrawnCount) withdrawn, SUM(tradedCount) traded, SUM(settledCount) settled, SUM(zeroBalanceCount) zeroBalance FROM opportunity_popup_daily WHERE eventDate >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY eventDate ORDER BY eventDate DESC LIMIT 30`);
    return { last24Hours: recent[0] || {}, retainedDaily: daily, generatedAt: new Date().toISOString() };
  });
}

export function lifecycleIdempotencyKey(userId: number, offerId: number, action: string) {
  return crypto.createHash("sha256").update(`${userId}:${offerId}:${action}`).digest("hex").slice(0, 32);
}
