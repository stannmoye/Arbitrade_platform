import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";

export type DeliveryDiagnosticsFilters = {
  customerName?: string;
  customerId?: number;
  opportunityId?: number;
  packageName?: string;
  companyName?: string;
  status?: string;
  from?: string;
  to?: string;
  failedOnly?: boolean;
  failureAnalysisOnly?: boolean;
  expiredOnly?: boolean;
  queuedOnly?: boolean;
  stalledOnly?: boolean;
  minRetries?: number;
};

type SqlRow = Record<string, any>;

type DeliveryHistoryRow = {
  id: number;
  userId: number;
  offerId: number;
  eventKey: string;
  eventType: string;
  observedStatus: string | null;
  attemptNumber: number | null;
  errorCode: string | null;
  occurredAt: Date | string;
};

const RECORD_CTES = `
WITH latest_popup AS (
  SELECT e.*
  FROM opportunity_popup_events e
  INNER JOIN (
    SELECT userId,offerId,MAX(id) AS id
    FROM opportunity_popup_events
    GROUP BY userId,offerId
  ) latest ON latest.id=e.id
), record_rows AS (
  SELECT a.userId,a.offerId,a.packageId,a.packageName,a.companyReferenceId,
    COALESCE(p.companyDisplayName,o.companyDisplayName) AS companyDisplayName,
    a.status AS assignmentStatus,a.failureReason,a.generatedAt,a.createdAt AS assignmentPersistedAt,a.assignedAt,
    a.deliveredAt AS assignmentDeliveredAt,a.expiresAt AS assignmentExpiresAt,
    p.id AS popupEventId,p.eventStatus,p.deliveryStatus,p.deliveryAttemptCount,
    p.deliveryRetryAfter,p.deliveryLeaseExpiresAt,p.lastErrorCode,p.createdAt AS popupCreatedAt,
    p.deliveredAt,p.receivedAt,p.renderedAt,p.expiredAt,p.noticedAt,p.openedAt,p.dismissedAt,
    p.withdrawnAt,p.tradedAt,p.settledAt,o.status AS offerStatus,o.closesAt AS offerClosesAt
  FROM opportunity_generation_assignments a
  LEFT JOIN latest_popup p ON p.userId=a.userId AND p.offerId=a.offerId
  LEFT JOIN opportunity_offers o ON o.id=a.offerId AND o.assignedUserId=a.userId
  UNION ALL
  SELECT p.userId,p.offerId,p.packageId,p.packageName,p.companyReferenceId,
    COALESCE(p.companyDisplayName,o.companyDisplayName) AS companyDisplayName,
    NULL AS assignmentStatus,NULL AS failureReason,NULL AS generatedAt,NULL AS assignmentPersistedAt,NULL AS assignedAt,
    NULL AS assignmentDeliveredAt,NULL AS assignmentExpiresAt,
    p.id AS popupEventId,p.eventStatus,p.deliveryStatus,p.deliveryAttemptCount,
    p.deliveryRetryAfter,p.deliveryLeaseExpiresAt,p.lastErrorCode,p.createdAt AS popupCreatedAt,
    p.deliveredAt,p.receivedAt,p.renderedAt,p.expiredAt,p.noticedAt,p.openedAt,p.dismissedAt,
    p.withdrawnAt,p.tradedAt,p.settledAt,o.status AS offerStatus,o.closesAt AS offerClosesAt
  FROM latest_popup p
  LEFT JOIN opportunity_generation_assignments a ON a.userId=p.userId AND a.offerId=p.offerId
  LEFT JOIN opportunity_offers o ON o.id=p.offerId AND (o.assignedUserId=p.userId OR o.assignedUserId IS NULL)
  WHERE a.id IS NULL
)
`;

function validId(value: number | undefined) {
  return value === undefined || (Number.isSafeInteger(value) && value > 0);
}

function escapeLikePrefix(value: string) {
  return value.replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_") + "%";
}

function safeCode(value: unknown): string | null {
  if (value == null || value === "") return null;
  const code = String(value).trim().toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : "UNSAFE_DIAGNOSTIC_CODE_REDACTED";
}

export function safeDeliveryDiagnosticMessage(code: string | null): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    DELIVERY_LEASE_EXPIRED: "The processing lease expired before a valid browser acknowledgement was recorded.",
    DELIVERY_ATTEMPTS_EXHAUSTED: "The configured delivery attempt limit was reached.",
    OPPORTUNITY_EXPIRED: "The opportunity reached its persisted expiry condition before delivery was confirmed.",
    POPUP_EVENT_MISSING: "A legacy quota record exists without a matching persisted popup lifecycle row.",
    DELIVERY_DUPLICATE_LEGACY: "A legacy duplicate delivery row was terminalized during migration.",
    DELIVERY_PACKAGE_ID_UNRESOLVED: "The delivery package identity could not be resolved during migration.",
  };
  return messages[code] ?? "A delivery diagnostic code is stored; detailed internal error text is intentionally withheld.";
}

export function classifyDeliveryFailure(input: {
  assignmentStatus?: string | null;
  deliveryStatus?: string | null;
  errorCode?: string | null;
  receivedAt?: unknown;
  renderedAt?: unknown;
  stalled?: boolean;
}): { category: string; message: string; retryPermitted: false } | null {
  const code = safeCode(input.errorCode);
  if (input.assignmentStatus === "failed") {
    return { category: "Generation/assignment failure", message: "The persisted generation assignment is marked failed.", retryPermitted: false };
  }
  if (input.deliveryStatus === "failed") {
    const category = code === "DELIVERY_ATTEMPTS_EXHAUSTED" ? "Retry exhaustion" : code === "DELIVERY_LEASE_EXPIRED" ? "Claim lease expired" : code ? "Delivery attempt failure" : "Unknown failure";
    return { category, message: safeDeliveryDiagnosticMessage(code) ?? "A failure status is persisted without a safe diagnostic code.", retryPermitted: false };
  }
  if (input.deliveryStatus === "expired" || input.assignmentStatus === "expired") {
    return {
      category: input.receivedAt ? "Expired after browser receipt" : "Expired; receipt not confirmed",
      message: safeDeliveryDiagnosticMessage(code ?? "OPPORTUNITY_EXPIRED")!,
      retryPermitted: false,
    };
  }
  if (input.stalled) {
    return { category: "Browser receipt not confirmed", message: "A processing lease or retry is overdue. This does not prove the customer did not see the popup or that rendering failed.", retryPermitted: false };
  }
  return null;
}

function statusExpression(alias = "r") {
  return `CASE WHEN ${alias}.deliveryStatus='delivered' AND ${alias}.receivedAt IS NULL THEN 'queue_record_unavailable'
    WHEN ${alias}.deliveryStatus IS NOT NULL THEN ${alias}.deliveryStatus
    WHEN ${alias}.assignmentStatus IN ('generated','failed','expired','cancelled') THEN ${alias}.assignmentStatus
    WHEN ${alias}.assignmentStatus='delivered' THEN 'queue_record_unavailable'
    ELSE 'unknown' END`;
}

function buildWhere(filters: DeliveryDiagnosticsFilters, alias = "r") {
  if (!validId(filters.customerId) || !validId(filters.opportunityId)) throw new RangeError("Search identifiers must be positive integers.");
  if (filters.customerName && filters.customerName.trim().length > 100) throw new RangeError("Customer name search is too long.");
  if (filters.packageName && filters.packageName.trim().length > 80) throw new RangeError("Package search is too long.");
  if (filters.companyName && filters.companyName.trim().length > 120) throw new RangeError("Company search is too long.");
  if (filters.from && !Number.isFinite(Date.parse(filters.from))) throw new RangeError("Start date is invalid.");
  if (filters.to && !Number.isFinite(Date.parse(filters.to))) throw new RangeError("End date is invalid.");
  if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) throw new RangeError("Start date must not be after end date.");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.customerId !== undefined) { clauses.push(`${alias}.userId=?`); params.push(filters.customerId); }
  if (filters.opportunityId !== undefined) { clauses.push(`${alias}.offerId=?`); params.push(filters.opportunityId); }
  if (filters.customerName?.trim()) { clauses.push("u.name LIKE ? ESCAPE '!' "); params.push(escapeLikePrefix(filters.customerName.trim())); }
  if (filters.packageName?.trim()) { clauses.push(`COALESCE(${alias}.packageName,'') LIKE ? ESCAPE '!'`); params.push(escapeLikePrefix(filters.packageName.trim())); }
  if (filters.companyName?.trim()) { clauses.push(`COALESCE(${alias}.companyDisplayName,${alias}.companyReferenceId,'') LIKE ? ESCAPE '!'`); params.push(escapeLikePrefix(filters.companyName.trim())); }
  if (filters.status) { clauses.push(`${statusExpression(alias)}=?`); params.push(filters.status); }
  const eventDate = `COALESCE(${alias}.generatedAt,${alias}.popupCreatedAt)`;
  if (filters.from) { clauses.push(`${eventDate}>=?`); params.push(filters.from); }
  if (filters.to) { clauses.push(`${eventDate}<=?`); params.push(filters.to); }
  if (filters.failedOnly) clauses.push(`(${alias}.deliveryStatus='failed' OR ${alias}.assignmentStatus='failed')`);
  if (filters.failureAnalysisOnly) clauses.push(`(${alias}.deliveryStatus IN ('failed','expired') OR ${alias}.assignmentStatus IN ('failed','expired') OR (${alias}.deliveryStatus='in_progress' AND ${alias}.deliveryLeaseExpiresAt IS NOT NULL AND ${alias}.deliveryLeaseExpiresAt<=UTC_TIMESTAMP()) OR (${alias}.deliveryStatus='retry_wait' AND ${alias}.deliveryRetryAfter IS NOT NULL AND ${alias}.deliveryRetryAfter<=UTC_TIMESTAMP()))`);
  if (filters.expiredOnly) clauses.push(`(${alias}.deliveryStatus='expired' OR ${alias}.assignmentStatus='expired')`);
  if (filters.queuedOnly) clauses.push(`${alias}.deliveryStatus IN ('queued','in_progress','retry_wait')`);
  if (filters.minRetries !== undefined && filters.minRetries > 0) { clauses.push(`COALESCE(${alias}.deliveryAttemptCount,0)>=?`); params.push(filters.minRetries); }
  if (filters.stalledOnly) clauses.push(`((${alias}.deliveryStatus='in_progress' AND ${alias}.deliveryLeaseExpiresAt IS NOT NULL AND ${alias}.deliveryLeaseExpiresAt<=UTC_TIMESTAMP()) OR (${alias}.deliveryStatus='retry_wait' AND ${alias}.deliveryRetryAfter IS NOT NULL AND ${alias}.deliveryRetryAfter<=UTC_TIMESTAMP()))`);
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function buildOpportunityDeliveryWhere(filters: DeliveryDiagnosticsFilters) {
  return buildWhere(filters);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function mapRecord(row: SqlRow, now = Date.now()) {
  const userId = Number(row.userId);
  const offerId = Number(row.offerId);
  const generatedAt = iso(row.generatedAt);
  const createdAt = iso(row.popupCreatedAt);
  const ageBase = generatedAt ?? createdAt;
  const ageMs = ageBase ? Math.max(0, now - Date.parse(ageBase)) : null;
  const currentStatus = row.deliveryStatus === "delivered" && !row.receivedAt ? "queue_record_unavailable" : row.deliveryStatus ?? (row.assignmentStatus === "delivered" ? "queue_record_unavailable" : row.assignmentStatus ?? "unknown");
  const errorCode = safeCode(row.lastErrorCode ?? row.failureReason);
  return {
    opportunityId: offerId,
    customerId: userId,
    customerName: String(row.customerName || `Customer ${userId}`),
    packageName: String(row.packageName || "Historical package unavailable"),
    companyName: String(row.companyDisplayName || row.companyReferenceId || "Company unavailable"),
    generatedAt,
    assignmentPersistedAt: iso(row.assignmentPersistedAt),
    assignedAt: iso(row.assignedAt),
    assignmentDeliveredAt: iso(row.assignmentDeliveredAt),
    assignmentExpiresAt: iso(row.assignmentExpiresAt),
    deliveryStatus: String(currentStatus),
    lastAttemptAt: iso(row.lastAttemptAt),
    browserReceivedAt: iso(row.receivedAt),
    popupRenderedAt: iso(row.renderedAt),
    retryCount: Number(row.deliveryAttemptCount ?? 0),
    ageMs,
    lastErrorCode: errorCode,
    lastErrorMessage: safeDeliveryDiagnosticMessage(errorCode),
    failureAt: iso(row.lastFailureAt ?? row.expiredAt),
    lastFailureStatus: row.lastFailureStatus == null ? null : String(row.lastFailureStatus),
    lastFailureErrorCode: safeCode(row.lastFailureErrorCode),
    popupEventId: row.popupEventId == null ? null : Number(row.popupEventId),
    offerStatus: row.offerStatus == null ? null : String(row.offerStatus),
    offerClosesAt: iso(row.offerClosesAt),
    _source: row,
  };
}

async function withConnection<T>(run: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), connectionLimit: 3 });
  const connection = await pool.getConnection();
  try { return await run(connection); } finally { connection.release(); await pool.end(); }
}

export async function listOpportunityDeliveryRecords(input: {
  filters: DeliveryDiagnosticsFilters;
  page: number;
  pageSize: number;
  includeHistory?: boolean;
  includeInternal?: boolean;
}) {
  const { filters } = input;
  if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 10_000) throw new RangeError("Page is outside the supported range.");
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new RangeError("Page size must be from 1 to 100.");
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, rows: [], total: 0, page: input.page, pageSize: input.pageSize, generatedAt: null };
  return withConnection(async connection => {
    const where = buildWhere(filters);
    const [countRows] = await connection.query<any[]>(`${RECORD_CTES}
      SELECT COUNT(*) AS total FROM record_rows r LEFT JOIN users u ON u.id=r.userId ${where.sql}`, where.params);
    const offset = (input.page - 1) * input.pageSize;
    const [rows] = await connection.query<any[]>(`${RECORD_CTES}
      SELECT r.*,u.name AS customerName,
        (SELECT MAX(h.occurredAt) FROM opportunity_delivery_history h WHERE h.userId=r.userId AND h.offerId=r.offerId AND h.eventType='dispatch_claimed') AS lastAttemptAt,
        (SELECT h.occurredAt FROM opportunity_delivery_history h WHERE h.userId=r.userId AND h.offerId=r.offerId AND h.eventType IN ('lease_expired','retry_scheduled','retry_exhausted') ORDER BY h.occurredAt DESC,h.id DESC LIMIT 1) AS lastFailureAt,
        (SELECT h.observedStatus FROM opportunity_delivery_history h WHERE h.userId=r.userId AND h.offerId=r.offerId AND h.eventType IN ('lease_expired','retry_scheduled','retry_exhausted') ORDER BY h.occurredAt DESC,h.id DESC LIMIT 1) AS lastFailureStatus,
        (SELECT h.errorCode FROM opportunity_delivery_history h WHERE h.userId=r.userId AND h.offerId=r.offerId AND h.eventType IN ('lease_expired','retry_scheduled','retry_exhausted') ORDER BY h.occurredAt DESC,h.id DESC LIMIT 1) AS lastFailureErrorCode
      FROM record_rows r LEFT JOIN users u ON u.id=r.userId ${where.sql}
      ORDER BY COALESCE(r.generatedAt,r.popupCreatedAt) DESC,r.offerId DESC,r.userId DESC LIMIT ? OFFSET ?`, [...where.params, input.pageSize, offset]);
    const mapped = rows.map(row => mapRecord(row));
    let histories: DeliveryHistoryRow[] = [];
    if (input.includeHistory && mapped.length) histories = await loadHistory(connection, mapped.map(row => ({ userId: row.customerId, offerId: row.opportunityId })));
    const historyByOffer = new Map<string, DeliveryHistoryRow[]>();
    for (const item of histories) {
      const key = `${item.userId}:${item.offerId}`;
      historyByOffer.set(key, [...(historyByOffer.get(key) ?? []), item]);
    }
    return {
      sourceAvailable: true as const,
      rows: mapped.map(row => {
        const { _source, ...publicRow } = row;
        const events = historyByOffer.get(`${row.customerId}:${row.opportunityId}`) ?? [];
        const stalled = (_source.deliveryStatus === "in_progress" && _source.deliveryLeaseExpiresAt && new Date(_source.deliveryLeaseExpiresAt).getTime() <= Date.now()) || (_source.deliveryStatus === "retry_wait" && _source.deliveryRetryAfter && new Date(_source.deliveryRetryAfter).getTime() <= Date.now());
        const failure = classifyDeliveryFailure({ assignmentStatus: _source.assignmentStatus, deliveryStatus: _source.deliveryStatus, errorCode: row.lastFailureErrorCode ?? row.lastErrorCode, receivedAt: _source.receivedAt, renderedAt: _source.renderedAt, stalled: Boolean(stalled) });
        const lastAttemptEvent = [...events].reverse().find(event => ["lease_expired", "retry_scheduled", "retry_exhausted"].includes(event.eventType));
        return { ...publicRow, failure, lastRetryResult: lastAttemptEvent ? `${lastAttemptEvent.observedStatus ?? lastAttemptEvent.eventType}${lastAttemptEvent.errorCode ? ` · ${safeCode(lastAttemptEvent.errorCode)}` : ""}` : Number(row.retryCount) > 1 ? "Historical retry result unavailable." : "No retry result recorded.", retryPermitted: false as const, ...(input.includeInternal ? { _source } : {}) };
      }),
      total: Number(countRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize, generatedAt: new Date().toISOString(),
    };
  });
}

async function loadHistory(connection: mysql.PoolConnection, records: Array<{ userId: number; offerId: number }>) {
  if (!records.length) return [] as DeliveryHistoryRow[];
  const pairs = records.map(() => "(userId=? AND offerId=?)").join(" OR ");
  const params = records.flatMap(record => [record.userId, record.offerId]);
  const [rows] = await connection.query<any[]>(`SELECT id,userId,offerId,eventKey,eventType,observedStatus,attemptNumber,errorCode,occurredAt
    FROM opportunity_delivery_history WHERE ${pairs} ORDER BY occurredAt ASC,id ASC`, params);
  return rows.map(row => ({ ...row, id: Number(row.id), userId: Number(row.userId), offerId: Number(row.offerId), attemptNumber: row.attemptNumber == null ? null : Number(row.attemptNumber) })) as DeliveryHistoryRow[];
}

export async function getOpportunityDeliveryDetails(customerId: number, offerId: number) {
  if (!Number.isSafeInteger(customerId) || customerId < 1) throw new RangeError("A valid customer ID is required.");
  if (!Number.isSafeInteger(offerId) || offerId < 1) throw new RangeError("A valid opportunity ID is required.");
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, record: null, timeline: [], attempts: [], durationsMs: {}, generatedAt: null };
  const page = await listOpportunityDeliveryRecords({ filters: { customerId, opportunityId: offerId }, page: 1, pageSize: 1, includeHistory: false, includeInternal: true });
  if (!page.sourceAvailable || !page.rows[0]) return { sourceAvailable: true as const, record: null, timeline: [], attempts: [], durationsMs: {}, generatedAt: new Date().toISOString() };
  const record = page.rows[0];
  return withConnection(async connection => {
    const source = (record as any)._source as SqlRow;
    const actual = (record as any);
    const histories = await loadHistory(connection, [{ userId: Number(source.userId), offerId }]);
    const firstClaim = histories.find(item => item.eventType === "dispatch_claimed");
    const final = histories.filter(item => ["lease_expired", "retry_scheduled", "retry_exhausted"].includes(item.eventType));
    const timeline: Array<{ label: string; occurredAt: string | null; evidence: string; status?: string | null; errorCode?: string | null }> = [
      { label: "Opportunity generated", occurredAt: actual.generatedAt, evidence: actual.generatedAt ? "opportunity_generation_assignments.generatedAt" : "Historical event unavailable." },
      { label: "Assignment persisted", occurredAt: actual.assignmentPersistedAt, evidence: actual.assignmentPersistedAt ? "opportunity_generation_assignments.createdAt" : "Historical event unavailable." },
      { label: "Queue record created", occurredAt: iso(source.popupCreatedAt), evidence: source.popupCreatedAt ? "opportunity_popup_events.createdAt" : "Historical event unavailable." },
      { label: "First request-scoped dispatch claim", occurredAt: firstClaim ? iso(firstClaim.occurredAt) : null, evidence: firstClaim ? "Persisted dispatch_claimed event" : Number(source.deliveryAttemptCount || 0) > 0 ? "Historical event unavailable. Attempt count exists but attempt timestamps do not." : "Historical event unavailable." },
      { label: "Browser receipt acknowledgement", occurredAt: iso(source.receivedAt), evidence: source.receivedAt ? "opportunity_popup_events.receivedAt" : source.popupEventId ? "Historical event unavailable. No acknowledgement timestamp is stored." : "Historical event unavailable." },
      { label: "Popup render confirmation", occurredAt: iso(source.renderedAt), evidence: source.renderedAt ? "opportunity_popup_events.renderedAt" : source.popupEventId ? "Historical event unavailable. No render acknowledgement timestamp is stored." : "Historical event unavailable." },
      { label: "Completion (settlement confirmed)", occurredAt: iso(source.settledAt), evidence: source.settledAt ? "opportunity_popup_events.settledAt" : "Historical event unavailable. No persisted settlement confirmation." },
      { label: "Expiration recorded", occurredAt: iso(source.expiredAt), evidence: source.expiredAt ? "opportunity_popup_events.expiredAt" : source.assignmentStatus === "expired" ? "Historical event unavailable. Assignment is marked expired but its exact event timestamp is absent." : "Historical event unavailable." },
      { label: "Latest lease/retry outcome", occurredAt: final.length ? iso(final[final.length - 1]!.occurredAt) : null, evidence: final.length ? "Persisted lease/retry lifecycle history" : source.deliveryStatus === "failed" || source.assignmentStatus === "failed" ? "Historical event unavailable. Failure status is stored but its timestamp is absent." : "Historical event unavailable.", status: final.at(-1)?.observedStatus ?? null, errorCode: safeCode(final.at(-1)?.errorCode) },
    ];
    const lifecycleOrder = new Map(timeline.map((item, index) => [item.label, index]));
    timeline.sort((left, right) => {
      const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || (lifecycleOrder.get(left.label) ?? 0) - (lifecycleOrder.get(right.label) ?? 0);
    });
    const durationsMs: Record<string, number | null> = {
      generationToQueue: durationBetween(actual.generatedAt, iso(source.popupCreatedAt)),
      queueToFirstClaim: durationBetween(iso(source.popupCreatedAt), firstClaim ? iso(firstClaim.occurredAt) : null),
      firstClaimToReceipt: durationBetween(firstClaim ? iso(firstClaim.occurredAt) : null, iso(source.receivedAt)),
      receiptToRender: durationBetween(iso(source.receivedAt), iso(source.renderedAt)),
      generationToRender: durationBetween(actual.generatedAt, iso(source.renderedAt)),
    };
    const attempts = histories.filter(item => ["dispatch_claimed", "lease_expired", "retry_scheduled", "retry_exhausted"].includes(item.eventType)).map(item => ({
      eventType: item.eventType, attemptNumber: item.attemptNumber, occurredAt: iso(item.occurredAt), status: item.observedStatus, errorCode: safeCode(item.errorCode), message: safeDeliveryDiagnosticMessage(safeCode(item.errorCode)),
    }));
    const { _source, ...publicRecord } = record as any;
    return { sourceAvailable: true as const, record: publicRecord, timeline, attempts, durationsMs, generatedAt: new Date().toISOString() };
  });
}

function durationBetween(start: unknown, end: unknown) {
  if (start == null || end == null) return null;
  const startMs = Date.parse(String(start));
  const endMs = Date.parse(String(end));
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : null;
}

export async function searchOpportunityDeliveryCustomers(query: string) {
  const term = String(query ?? "").trim();
  if (term.length < 2 || term.length > 100) return { sourceAvailable: Boolean(process.env.DATABASE_URL), customers: [], generatedAt: new Date().toISOString() };
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, customers: [], generatedAt: null };
  return withConnection(async connection => {
    const searchById = /^\d{1,10}$/.test(term) ? Number(term) : null;
    const [rows] = await connection.query<any[]>(`SELECT id,name,packageName FROM users
      WHERE role='user' AND (name LIKE ? ESCAPE '!'${searchById ? " OR id=?" : ""})
      ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END, name, id LIMIT 20`,
      searchById ? [escapeLikePrefix(term), searchById, searchById] : [escapeLikePrefix(term), 0]);
    return { sourceAvailable: true as const, customers: rows.map(row => ({ id: Number(row.id), name: String(row.name || `Customer ${row.id}`), packageName: String(row.packageName || "Unavailable") })), generatedAt: new Date().toISOString() };
  });
}

export async function getOpportunityDeliveryCustomer(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new RangeError("A valid customer ID is required.");
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, customer: null, aggregates: null, recent: [], generatedAt: null };
  return withConnection(async connection => {
    const [users] = await connection.query<any[]>("SELECT id,name,packageName FROM users WHERE id=? AND role='user' LIMIT 1", [userId]);
    if (!users[0]) return { sourceAvailable: true as const, customer: null, aggregates: null, recent: [], generatedAt: new Date().toISOString() };
    const [aggregateRows] = await connection.query<any[]>(`${RECORD_CTES}
      SELECT COUNT(DISTINCT CASE WHEN r.assignmentStatus IS NOT NULL THEN r.offerId END) AS generated,
        SUM(r.deliveryStatus IN ('queued','in_progress','retry_wait')) AS queued,
        SUM(r.deliveryStatus='received') AS received,SUM(r.deliveryStatus='rendered') AS rendered,
        SUM(r.deliveryStatus='failed' OR r.assignmentStatus='failed') AS failed,
        SUM(r.deliveryStatus='expired' OR r.assignmentStatus='expired') AS expired,
        SUM(r.deliveryStatus IN ('queued','in_progress','retry_wait')) AS pending
      FROM record_rows r WHERE r.userId=?`, [userId]);
    const [timestamps] = await connection.query<any[]>(`${RECORD_CTES}
      SELECT MAX(r.renderedAt) AS lastRenderedAt,
        (SELECT COALESCE(r2.lastErrorCode,r2.failureReason) FROM record_rows r2 WHERE r2.userId=? AND (r2.deliveryStatus='failed' OR r2.assignmentStatus='failed' OR r2.deliveryStatus='expired' OR r2.assignmentStatus='expired') ORDER BY COALESCE(r2.generatedAt,r2.popupCreatedAt) DESC,r2.offerId DESC LIMIT 1) AS mostRecentFailureCode,
        (SELECT COALESCE((SELECT h.occurredAt FROM opportunity_delivery_history h WHERE h.userId=r2.userId AND h.offerId=r2.offerId AND h.eventType IN ('lease_expired','retry_scheduled','retry_exhausted') ORDER BY h.occurredAt DESC,h.id DESC LIMIT 1),r2.expiredAt) FROM record_rows r2 WHERE r2.userId=? AND (r2.deliveryStatus='failed' OR r2.assignmentStatus='failed' OR r2.deliveryStatus='expired' OR r2.assignmentStatus='expired') ORDER BY COALESCE(r2.generatedAt,r2.popupCreatedAt) DESC,r2.offerId DESC LIMIT 1) AS mostRecentFailureAt
      FROM record_rows r WHERE r.userId=?`, [userId,userId,userId]);
    const [latencyRows] = await connection.query<any[]>(`${RECORD_CTES}
      SELECT AVG(TIMESTAMPDIFF(MICROSECOND,a.generatedAt,p.renderedAt)/1000) AS averageMs,COUNT(*) AS samples
      FROM opportunity_generation_assignments a
      INNER JOIN (
        SELECT e.userId,e.offerId,e.renderedAt FROM opportunity_popup_events e
        INNER JOIN (SELECT userId,offerId,MAX(id) AS id FROM opportunity_popup_events GROUP BY userId,offerId) latest ON latest.id=e.id
      ) p ON p.userId=a.userId AND p.offerId=a.offerId
      WHERE a.userId=? AND p.renderedAt IS NOT NULL AND a.generatedAt<=p.renderedAt`, [userId]);
    const list = await listOpportunityDeliveryRecords({ filters: { customerId: userId }, page: 1, pageSize: 20, includeHistory: false });
    return {
      sourceAvailable: true as const,
      customer: { id: Number(users[0].id), name: String(users[0].name || `Customer ${userId}`), packageName: String(users[0].packageName || "Unavailable") },
      aggregates: { generated: Number(aggregateRows[0]?.generated || 0), queued: Number(aggregateRows[0]?.queued || 0), received: Number(aggregateRows[0]?.received || 0), rendered: Number(aggregateRows[0]?.rendered || 0), failed: Number(aggregateRows[0]?.failed || 0), expired: Number(aggregateRows[0]?.expired || 0), pending: Number(aggregateRows[0]?.pending || 0), lastRenderedAt: iso(timestamps[0]?.lastRenderedAt), mostRecentFailureAt: iso(timestamps[0]?.mostRecentFailureAt), mostRecentFailureCode: safeCode(timestamps[0]?.mostRecentFailureCode), mostRecentFailureMessage: safeDeliveryDiagnosticMessage(safeCode(timestamps[0]?.mostRecentFailureCode)), averageDeliveryLatencyMs: latencyRows[0]?.averageMs == null ? null : Number(latencyRows[0].averageMs), averageDeliveryLatencySamples: Number(latencyRows[0]?.samples || 0) },
      recent: list.rows, generatedAt: new Date().toISOString(),
    };
  });
}

export async function getOpportunityDeliveryQueueDiagnostics() {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, generatedAt: null, counts: null, latency: null, backlogGrowth: null };
  return withConnection(async connection => {
    const [queueRows] = await connection.query<any[]>(`SELECT
      SUM(deliveryStatus='queued') AS queued,
      SUM(deliveryStatus='in_progress') AS processing,
      SUM(deliveryStatus='retry_wait') AS waitingRetry,
      SUM(deliveryStatus='failed') AS failed,
      SUM(deliveryStatus='expired') AS expired,
      MIN(CASE WHEN deliveryStatus='queued' THEN createdAt END) AS oldestQueuedAt,
      MIN(CASE WHEN deliveryStatus='in_progress' THEN createdAt END) AS oldestProcessingAt,
      SUM(deliveryStatus='retry_wait' AND deliveryRetryAfter IS NOT NULL AND deliveryRetryAfter<=UTC_TIMESTAMP()) AS overdueRetries,
      SUM(deliveryStatus='in_progress' AND deliveryLeaseExpiresAt IS NOT NULL AND deliveryLeaseExpiresAt<=UTC_TIMESTAMP()) AS expiredLeases,
      SUM(deliveryStatus IN ('queued','in_progress','retry_wait') AND COALESCE(lease_events.expiredCount,0)>=2) AS repeatedLeaseExpiries,
      SUM(deliveryStatus IN ('queued','in_progress','retry_wait') AND deliveryAttemptCount>0 AND offer.closesAt<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)) AS approachingExpiration,
      SUM(deliveryStatus IN ('queued','in_progress','retry_wait') AND offer.closesAt<=UTC_TIMESTAMP()) AS pendingPastDeadline,
      SUM((deliveryStatus='retry_wait' AND deliveryRetryAfter IS NOT NULL AND deliveryRetryAfter>=offer.closesAt) OR (deliveryStatus='in_progress' AND deliveryLeaseExpiresAt IS NOT NULL AND deliveryLeaseExpiresAt>=offer.closesAt)) AS retryOrLeaseBeyondDeadline
      FROM opportunity_popup_events e
      INNER JOIN (SELECT userId,offerId,MAX(id) AS id FROM opportunity_popup_events GROUP BY userId,offerId) latest ON latest.id=e.id
      LEFT JOIN opportunity_offers offer ON offer.id=e.offerId
      LEFT JOIN (SELECT userId,offerId,COUNT(*) AS expiredCount FROM opportunity_delivery_history WHERE eventType='lease_expired' GROUP BY userId,offerId) lease_events ON lease_events.userId=e.userId AND lease_events.offerId=e.offerId`);
    const [latencyRows] = await connection.query<any[]>(`SELECT
      AVG(IF(p.createdAt>=a.generatedAt,TIMESTAMPDIFF(MICROSECOND,a.generatedAt,p.createdAt)/1000,NULL)) AS generationToQueueMs,
      COUNT(IF(p.createdAt>=a.generatedAt,1,NULL)) AS generationToQueueSamples,
      AVG(IF(claim.firstClaimAt>=p.createdAt,TIMESTAMPDIFF(MICROSECOND,p.createdAt,claim.firstClaimAt)/1000,NULL)) AS queueToClaimMs,
      COUNT(IF(claim.firstClaimAt>=p.createdAt,1,NULL)) AS queueToClaimSamples,
      AVG(IF(p.receivedAt>=claim.firstClaimAt,TIMESTAMPDIFF(MICROSECOND,claim.firstClaimAt,p.receivedAt)/1000,NULL)) AS claimToReceiptMs,
      COUNT(IF(p.receivedAt>=claim.firstClaimAt,1,NULL)) AS claimToReceiptSamples,
      AVG(IF(p.renderedAt>=p.receivedAt,TIMESTAMPDIFF(MICROSECOND,p.receivedAt,p.renderedAt)/1000,NULL)) AS receiptToRenderMs,
      COUNT(IF(p.renderedAt>=p.receivedAt,1,NULL)) AS receiptToRenderSamples,
      AVG(IF(p.renderedAt>=a.generatedAt,TIMESTAMPDIFF(MICROSECOND,a.generatedAt,p.renderedAt)/1000,NULL)) AS generationToRenderMs,
      COUNT(IF(p.renderedAt>=a.generatedAt,1,NULL)) AS generationToRenderSamples
      FROM opportunity_generation_assignments a
      INNER JOIN (SELECT e.userId,e.offerId,e.createdAt,e.receivedAt,e.renderedAt FROM opportunity_popup_events e INNER JOIN (SELECT userId,offerId,MAX(id) AS id FROM opportunity_popup_events GROUP BY userId,offerId) latest ON latest.id=e.id) p ON p.userId=a.userId AND p.offerId=a.offerId
      LEFT JOIN (SELECT userId,offerId,MIN(occurredAt) AS firstClaimAt FROM opportunity_delivery_history WHERE eventType='dispatch_claimed' GROUP BY userId,offerId) claim ON claim.userId=a.userId AND claim.offerId=a.offerId`);
    const latency = latencyRows[0] ?? {};
    return {
      sourceAvailable: true as const,
      counts: { queued: Number(queueRows[0]?.queued || 0), processing: Number(queueRows[0]?.processing || 0), waitingRetry: Number(queueRows[0]?.waitingRetry || 0), failed: Number(queueRows[0]?.failed || 0), expired: Number(queueRows[0]?.expired || 0), oldestQueuedAt: iso(queueRows[0]?.oldestQueuedAt), oldestProcessingAt: iso(queueRows[0]?.oldestProcessingAt), overdueRetries: Number(queueRows[0]?.overdueRetries || 0), expiredLeases: Number(queueRows[0]?.expiredLeases || 0), overdueAttempts: Number(queueRows[0]?.overdueRetries || 0) + Number(queueRows[0]?.expiredLeases || 0), repeatedLeaseExpiries: Number(queueRows[0]?.repeatedLeaseExpiries || 0), approachingExpiration: Number(queueRows[0]?.approachingExpiration || 0), pendingPastDeadline: Number(queueRows[0]?.pendingPastDeadline || 0), retryOrLeaseBeyondDeadline: Number(queueRows[0]?.retryOrLeaseBeyondDeadline || 0), leaseDurationSeconds: 60, queueWaitThresholdConfigured: false },
      latency: {
        generationToQueue: { averageMs: latency.generationToQueueMs == null ? null : Number(latency.generationToQueueMs), samples: Number(latency.generationToQueueSamples || 0) },
        queueToClaim: { averageMs: latency.queueToClaimMs == null ? null : Number(latency.queueToClaimMs), samples: Number(latency.queueToClaimSamples || 0) },
        claimToReceipt: { averageMs: latency.claimToReceiptMs == null ? null : Number(latency.claimToReceiptMs), samples: Number(latency.claimToReceiptSamples || 0) },
        receiptToRender: { averageMs: latency.receiptToRenderMs == null ? null : Number(latency.receiptToRenderMs), samples: Number(latency.receiptToRenderSamples || 0) },
        generationToRender: { averageMs: latency.generationToRenderMs == null ? null : Number(latency.generationToRenderMs), samples: Number(latency.generationToRenderSamples || 0) },
      },
      backlogGrowth: { available: false, reason: "Historical queue-size snapshots are not persisted; no backlog growth trend is inferred." },
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function exportOpportunityDeliveryRecords(filters: DeliveryDiagnosticsFilters, maxRows = 10_000) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10_000) throw new RangeError("CSV export is limited to 10,000 records per request.");
  if (!process.env.DATABASE_URL) return { sourceAvailable: false as const, rows: [], total: 0, truncated: false, generatedAt: null };
  return withConnection(async connection => {
    const where = buildWhere(filters);
    const [countRows] = await connection.query<any[]>(`${RECORD_CTES} SELECT COUNT(*) AS total FROM record_rows r LEFT JOIN users u ON u.id=r.userId ${where.sql}`, where.params);
    const [rows] = await connection.query<any[]>(`${RECORD_CTES} SELECT r.*,u.name AS customerName FROM record_rows r LEFT JOIN users u ON u.id=r.userId ${where.sql}
      ORDER BY COALESCE(r.generatedAt,r.popupCreatedAt) DESC,r.offerId DESC,r.userId DESC LIMIT ?`, [...where.params, maxRows]);
    const total = Number(countRows[0]?.total ?? 0);
    return { sourceAvailable: true as const, rows: rows.map(row => { const { _source, ...mapped } = mapRecord(row); void _source; return mapped; }), total, truncated: total > rows.length, generatedAt: new Date().toISOString() };
  });
}
