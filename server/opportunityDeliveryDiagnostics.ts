import mysql from "mysql2/promise";
import { mysqlConnectionOptions } from "./_core/mysql";
import {
  classifyDeliveryFailure,
  decodeDeliveryDiagnosticCursor,
  encodeDeliveryDiagnosticCursor,
  safeDeliveryDiagnosticMessage,
  type DeliveryDiagnosticEventType,
} from "./modules/opportunity-delivery-diagnostics";

async function withConnection<T>(fn: (connection: mysql.PoolConnection) => Promise<T>) {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), connectionLimit: 3 });
  const connection = await pool.getConnection();
  try { return await fn(connection); } finally { connection.release(); await pool.end(); }
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeRange(fromDate?: string, toDate?: string) {
  const now = new Date();
  const from = fromDate ? new Date(fromDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = toDate ? new Date(toDate) : now;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.getTime() > to.getTime()) {
    throw new RangeError("The delivery diagnostics date range is invalid.");
  }
  if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new RangeError("Choose a delivery diagnostics date range of 90 days or less.");
  }
  return { from, to };
}

function prefixLike(value: string) {
  return value.trim().replace(/[\\%_]/g, "\\$&") + "%";
}

export type OpportunityDeliveryDiagnosticsInput = {
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  pageSize?: number;
  customerId?: number;
  customerQuery?: string;
  packageName?: string;
  companyQuery?: string;
  opportunityId?: number;
  status?: "generated" | "queue_admission_skipped" | "queued" | "in_progress" | "retry_wait" | "received" | "rendered" | "failed" | "expired" | "dismissed" | "pending" | "unconfirmed";
  failedOnly?: boolean;
  pendingOnly?: boolean;
  expiredOnly?: boolean;
  minimumAttempts?: number;
  workerStatus?: "running" | "healthy" | "degraded" | "stale" | "not_started" | "unavailable";
};

export async function listOpportunityDeliveryDiagnostics(input: OpportunityDeliveryDiagnosticsInput = {}) {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, items: [], nextCursor: null, range: null, generatedAt: null };
  const { from, to } = normalizeRange(input.fromDate, input.toDate);
  const pageSize = Math.max(1, Math.min(100, Math.trunc(input.pageSize || 25)));
  const cursor = decodeDeliveryDiagnosticCursor(input.cursor);
  const where = ["g.eventType='generated'", "g.eventAt>=?", "g.eventAt<=?", "a.offerId=g.opportunityId", "a.userId=g.customerId", "o.id=a.offerId", "o.assignedUserId=a.userId"];
  const params: unknown[] = [from, to];
  if (input.customerId) { where.push("a.userId=?"); params.push(input.customerId); }
  if (input.customerQuery?.trim()) {
    const query = input.customerQuery.trim();
    where.push("(CAST(a.userId AS CHAR)=? OR u.name LIKE ? OR u.email LIKE ?)");
    params.push(query, prefixLike(query), prefixLike(query));
  }
  if (input.packageName?.trim()) { where.push("a.packageName=?"); params.push(input.packageName.trim()); }
  if (input.companyQuery?.trim()) { where.push("o.companyDisplayName LIKE ?"); params.push(prefixLike(input.companyQuery)); }
  if (input.opportunityId) { where.push("a.offerId=?"); params.push(input.opportunityId); }
  if (cursor) {
    where.push("(g.eventAt<? OR (g.eventAt=? AND g.opportunityId<?))");
    params.push(new Date(cursor.generatedAt), new Date(cursor.generatedAt), cursor.opportunityId);
  }
  const failed = "(a.status='failed' OR p.deliveryStatus='failed' OR EXISTS (SELECT 1 FROM opportunity_delivery_diagnostic_events fe WHERE fe.opportunityId=a.offerId AND fe.customerId=a.userId AND fe.eventType='failed'))";
  const pending = "(p.deliveryStatus IN ('queued','in_progress','retry_wait'))";
  const expired = "(a.status='expired' OR p.deliveryStatus='expired' OR EXISTS (SELECT 1 FROM opportunity_delivery_diagnostic_events xe WHERE xe.opportunityId=a.offerId AND xe.customerId=a.userId AND xe.eventType='expired'))";
  if (input.status === "generated") where.push("(a.status='generated' AND p.id IS NULL AND NOT EXISTS (SELECT 1 FROM opportunity_delivery_diagnostic_events gef WHERE gef.opportunityId=a.offerId AND gef.customerId=a.userId AND gef.eventType IN ('failed','queue_admission_skipped')))");
  else if (input.status === "queue_admission_skipped") where.push("EXISTS (SELECT 1 FROM opportunity_delivery_diagnostic_events qsf WHERE qsf.opportunityId=a.offerId AND qsf.customerId=a.userId AND qsf.eventType='queue_admission_skipped')");
  else if (input.status === "pending") where.push(pending);
  else if (input.status === "unconfirmed") where.push("(p.id IS NULL AND a.status IN ('delivered','cancelled'))");
  else if (input.status) {
    if (input.status === "failed") where.push(failed);
    else if (input.status === "expired") where.push(expired);
    else where.push("p.deliveryStatus=?"), params.push(input.status);
  }
  if (input.failedOnly) where.push(failed);
  if (input.pendingOnly) where.push(pending);
  if (input.expiredOnly) where.push(expired);
  if (input.minimumAttempts) {
    where.push("GREATEST(COALESCE(p.deliveryAttemptCount,0),COALESCE((SELECT MAX(attemptsEvent.retryAttempt) FROM opportunity_delivery_diagnostic_events attemptsEvent WHERE attemptsEvent.opportunityId=a.offerId AND attemptsEvent.customerId=a.userId),0))>=?");
    params.push(input.minimumAttempts);
  }
  params.push(pageSize + 1);
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>(
      `SELECT a.offerId AS opportunityId,a.userId AS customerId,u.name AS customerName,u.email AS customerEmail,
         a.packageName,a.status AS assignmentStatus,g.eventAt AS generatedAt,o.companyReferenceId,o.companyDisplayName,o.closesAt,
         p.id AS popupEventId,p.deliveryStatus,p.deliveryAttemptCount,p.deliveryRetryAfter,p.lastErrorCode,
         p.createdAt AS popupCreatedAt,p.receivedAt,p.renderedAt,p.openedAt,p.tradedAt,p.settledAt,p.expiredAt,
         (SELECT de.eventType FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId ORDER BY de.id DESC LIMIT 1) AS latestEventType,
         (SELECT MAX(de.eventAt) FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId) AS lastEventAt,
         COALESCE(p.lastErrorCode,(SELECT de.errorCode FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId AND de.errorCode IS NOT NULL ORDER BY de.id DESC LIMIT 1)) AS latestErrorCode,
         (SELECT de.failureCategory FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId AND de.failureCategory IS NOT NULL ORDER BY de.id DESC LIMIT 1) AS failureCategory,
         (SELECT de.eventAt FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId AND de.eventType='popup_render_confirmed' ORDER BY de.id DESC LIMIT 1) AS confirmedRenderedAt,
         (SELECT de.workerId FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId AND de.workerId IS NOT NULL ORDER BY de.id DESC LIMIT 1) AS workerId,
         GREATEST(COALESCE(p.deliveryAttemptCount,0),COALESCE((SELECT MAX(de.retryAttempt) FROM opportunity_delivery_diagnostic_events de WHERE de.opportunityId=a.offerId AND de.customerId=a.userId),0)) AS retryAttempts
       FROM opportunity_delivery_diagnostic_events g
       INNER JOIN opportunity_generation_assignments a ON a.offerId=g.opportunityId AND a.userId=g.customerId
       INNER JOIN opportunity_offers o ON o.id=a.offerId AND o.assignedUserId=a.userId
       LEFT JOIN users u ON u.id=a.userId
       LEFT JOIN opportunity_delivery_idempotency di ON di.userId=a.userId AND di.offerId=a.offerId
       LEFT JOIN opportunity_popup_events p ON p.id=di.popupEventId AND p.offerId=a.offerId AND p.userId=a.userId
       WHERE ${where.join(" AND ")}
       ORDER BY g.eventAt DESC,g.opportunityId DESC LIMIT ?`,
      params,
    );
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const items = page.map(row => {
      const deliveryStatus = row.deliveryStatus || (row.latestEventType === "queue_admission_skipped" ? "queue_admission_skipped" : row.latestEventType === "failed" || row.assignmentStatus === "failed" ? "failed" : row.assignmentStatus === "expired" ? "expired" : row.assignmentStatus === "generated" ? "generated" : "unconfirmed");
      const errorCode = row.latestErrorCode || null;
      return {
        opportunityId: Number(row.opportunityId), customerId: Number(row.customerId),
        customerName: row.customerName || null, customerEmail: row.customerEmail || null,
        packageName: row.packageName, companyReferenceId: row.companyReferenceId || null,
        companyName: row.companyDisplayName || null, generatedAt: toIso(row.generatedAt), closesAt: toIso(row.closesAt),
        assignmentStatus: row.assignmentStatus, deliveryStatus, popupEventId: row.popupEventId ? Number(row.popupEventId) : null,
        retryAttempts: Number(row.retryAttempts || 0), retryAt: toIso(row.deliveryRetryAfter),
        receivedAt: toIso(row.receivedAt), renderedAt: toIso(row.confirmedRenderedAt), openedAt: toIso(row.openedAt),
        completedAt: toIso(row.settledAt), expiredAt: toIso(row.expiredAt), lastEventAt: toIso(row.lastEventAt),
        latestEventType: row.latestEventType || null, lastErrorCode: errorCode,
        failureCategory: row.failureCategory || classifyDeliveryFailure({ errorCode, assignmentStatus: row.assignmentStatus, deliveryStatus, receivedAt:row.receivedAt,renderedAt:row.confirmedRenderedAt }),
        diagnosticMessage: errorCode ? safeDeliveryDiagnosticMessage(errorCode,{receivedAt:row.receivedAt,renderedAt:row.confirmedRenderedAt}) : null,
        workerId: row.workerId || null, dispatchMode: "user_scoped_customer_request",
      };
    });
    const last = page[page.length - 1];
    return {
      sourceAvailable: true,
      items,
      nextCursor: hasMore && last ? encodeDeliveryDiagnosticCursor({ generatedAt: toIso(last.generatedAt)!, opportunityId: Number(last.opportunityId) }) : null,
      range: { from: from.toISOString(), to: to.toISOString(), pageSize },
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getOpportunityDeliveryCustomerDiagnostics(customerId: number) {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, customer: null, summary: null, generatedAt: null };
  return withConnection(async connection => {
    const [customerRows] = await connection.query<any[]>("SELECT id,name,email,packageName FROM users WHERE id=? LIMIT 1", [customerId]);
    if (!customerRows[0]) return { sourceAvailable: true, customer: null, summary: null, generatedAt: new Date().toISOString() };
    const [assignmentRows] = await connection.query<any[]>(
      "SELECT COUNT(*) AS generated FROM opportunity_generation_assignments WHERE userId=?", [customerId],
    );
    const [currentRows]=await connection.query<any[]>(
      `SELECT a.offerId,a.status AS assignmentStatus,p.deliveryStatus,p.createdAt,p.deliveryRetryAfter,p.receivedAt,p.renderedAt,
         (SELECT d.eventType FROM opportunity_delivery_diagnostic_events d WHERE d.opportunityId=a.offerId AND d.customerId=a.userId ORDER BY d.id DESC LIMIT 1) AS latestEventType
       FROM opportunity_generation_assignments a
       LEFT JOIN opportunity_delivery_idempotency di ON di.userId=a.userId AND di.offerId=a.offerId
       LEFT JOIN opportunity_popup_events p ON p.id=di.popupEventId AND p.offerId=a.offerId AND p.userId=a.userId
       WHERE a.userId=? ORDER BY a.generatedAt DESC,a.offerId DESC LIMIT 1`,[customerId],
    );
    const [eventRows] = await connection.query<any[]>(
      `SELECT COUNT(DISTINCT CASE WHEN eventType='delivery_attempted' THEN opportunityId END) AS attempted,
         COUNT(DISTINCT CASE WHEN eventType='retry_scheduled' THEN opportunityId END) AS retried,
         MAX(CASE WHEN eventType IN ('browser_received','popup_render_confirmed') THEN eventAt END) AS lastSuccessfulAt,
         MAX(CASE WHEN eventType='browser_received' THEN eventAt END) AS lastReceivedAt,
         MAX(CASE WHEN eventType='popup_render_confirmed' THEN eventAt END) AS lastRenderedAt,
         MAX(CASE WHEN eventType='failed' THEN eventAt END) AS lastFailureAt
       FROM opportunity_delivery_diagnostic_events WHERE customerId=?`, [customerId],
    );
    const [retryRows]=await connection.query<any[]>(
      `SELECT opportunityId,eventAt,retryAttempt,retryAt,errorCode FROM opportunity_delivery_diagnostic_events
       WHERE customerId=? AND eventType='retry_scheduled' ORDER BY eventAt DESC,id DESC LIMIT 25`,[customerId],
    );
    const [lastFailureRows]=await connection.query<any[]>(
      `SELECT opportunityId,eventAt,errorCode,failureCategory,diagnosticMessage FROM opportunity_delivery_diagnostic_events
       WHERE customerId=? AND eventType='failed' ORDER BY eventAt DESC,id DESC LIMIT 1`,[customerId],
    );
    const [receivedRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS total FROM (
         SELECT opportunityId FROM opportunity_delivery_diagnostic_events WHERE customerId=? AND eventType='browser_received'
         UNION SELECT offerId AS opportunityId FROM opportunity_popup_events WHERE userId=? AND receivedAt IS NOT NULL
       ) received`, [customerId, customerId],
    );
    const [renderedRows] = await connection.query<any[]>(
      "SELECT COUNT(DISTINCT opportunityId) AS total FROM opportunity_delivery_diagnostic_events WHERE customerId=? AND eventType='popup_render_confirmed'", [customerId],
    );
    const [failedRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS total FROM (
         SELECT opportunityId FROM opportunity_delivery_diagnostic_events WHERE customerId=? AND eventType='failed'
         UNION SELECT offerId AS opportunityId FROM opportunity_popup_events WHERE userId=? AND deliveryStatus='failed'
       ) failed`, [customerId, customerId],
    );
    const [expiredRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS total FROM (
         SELECT opportunityId FROM opportunity_delivery_diagnostic_events WHERE customerId=? AND eventType='expired'
         UNION SELECT offerId AS opportunityId FROM opportunity_popup_events WHERE userId=? AND deliveryStatus='expired'
       ) expired`, [customerId, customerId],
    );
    const [pendingRows] = await connection.query<any[]>(
      "SELECT COUNT(DISTINCT offerId) AS total FROM opportunity_popup_events WHERE userId=? AND deliveryStatus IN ('queued','in_progress','retry_wait')", [customerId],
    );
    const [coverageRows] = await connection.query<any[]>(
      "SELECT COUNT(DISTINCT opportunityId) AS tracked FROM opportunity_delivery_diagnostic_events WHERE customerId=? AND eventType='generated'", [customerId],
    );
    const generated = Number(assignmentRows[0]?.generated || 0);
    const current=currentRows[0]||null;
    const currentStatus=current?.deliveryStatus||(current?.latestEventType==="queue_admission_skipped"?"queue_admission_skipped":current?.latestEventType==="failed"?"failed":current?.assignmentStatus==="expired"?"expired":current?.assignmentStatus==="generated"?"generated":current?.assignmentStatus==="delivered"?"delivery_recorded_unconfirmed":"unconfirmed");
    return {
      sourceAvailable: true,
      customer: { id: Number(customerRows[0].id), name: customerRows[0].name || null, email: customerRows[0].email || null, packageName: customerRows[0].packageName || null },
      summary: {
        generated,
        browserReceived: Number(receivedRows[0]?.total || 0),
        rendered: Number(renderedRows[0]?.total || 0),
        pending: Number(pendingRows[0]?.total || 0),
        failed: Number(failedRows[0]?.total || 0),
        expired: Number(expiredRows[0]?.total || 0),
        attempted: Number(eventRows[0]?.attempted || 0),
        retried: Number(eventRows[0]?.retried || 0),
        trackedByDiagnosticHistory: Number(coverageRows[0]?.tracked || 0),
        olderGeneratedWithoutEventHistory: Math.max(0, generated - Number(coverageRows[0]?.tracked || 0)),
        lastSuccessfulAt: toIso(eventRows[0]?.lastSuccessfulAt),
        lastReceivedAt:toIso(eventRows[0]?.lastReceivedAt),
        lastRenderedAt:toIso(eventRows[0]?.lastRenderedAt),
        lastFailureAt: toIso(eventRows[0]?.lastFailureAt),
        currentOpportunityId:current?.offerId?Number(current.offerId):null,
        currentDeliveryStatus:current?currentStatus:null,
        currentStatusAt:toIso(current?.receivedAt||current?.renderedAt||current?.deliveryRetryAfter||current?.createdAt),
        currentRetryAt:toIso(current?.deliveryRetryAfter),
        retryHistory:retryRows.map(row=>({opportunityId:Number(row.opportunityId),eventAt:toIso(row.eventAt),retryAttempt:row.retryAttempt==null?null:Number(row.retryAttempt),retryAt:toIso(row.retryAt),errorCode:row.errorCode||null})),
        mostRecentFailure:lastFailureRows[0]?{opportunityId:Number(lastFailureRows[0].opportunityId),eventAt:toIso(lastFailureRows[0].eventAt),errorCode:lastFailureRows[0].errorCode||null,failureCategory:lastFailureRows[0].failureCategory||null,message:lastFailureRows[0].diagnosticMessage||safeDeliveryDiagnosticMessage(lastFailureRows[0].errorCode)}:null,
      },
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getOpportunityDeliveryOpportunityDiagnostics(opportunityId: number) {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, opportunity: null, history: [], generatedAt: null };
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>(
      `SELECT a.offerId AS opportunityId,a.userId AS customerId,u.name AS customerName,u.email AS customerEmail,
         a.packageName,a.status AS assignmentStatus,a.failureReason,a.generatedAt,a.expiresAt,
         o.status AS offerStatus,o.companyReferenceId,o.companyDisplayName,o.opensAt,o.closesAt,
         p.id AS popupEventId,p.createdAt AS popupCreatedAt,p.deliveryStatus,p.deliveryAttemptCount,p.deliveryRetryAfter,p.lastErrorCode,
         p.receivedAt,p.renderedAt,p.noticedAt,p.openedAt,p.dismissedAt,p.withdrawnAt,p.tradedAt,p.settledAt,p.expiredAt,
         (SELECT MAX(retryAttempt) FROM opportunity_delivery_diagnostic_events WHERE opportunityId=a.offerId AND customerId=a.userId) AS historyRetryCount
       FROM opportunity_generation_assignments a
       INNER JOIN opportunity_offers o ON o.id=a.offerId AND o.assignedUserId=a.userId
       LEFT JOIN users u ON u.id=a.userId
       LEFT JOIN opportunity_delivery_idempotency di ON di.userId=a.userId AND di.offerId=a.offerId
       LEFT JOIN opportunity_popup_events p ON p.id=di.popupEventId AND p.offerId=a.offerId AND p.userId=a.userId
       WHERE a.offerId=? LIMIT 1`, [opportunityId],
    );
    const row = rows[0];
    if (!row) return { sourceAvailable: true, opportunity: null, history: [], generatedAt: new Date().toISOString() };
    const customerId = Number(row.customerId);
    const [eventRows] = await connection.query<any[]>(
      `SELECT id,eventType,eventAt,workerId,retryAttempt,retryAt,errorCode,failureCategory,diagnosticMessage,metadataJson
       FROM opportunity_delivery_diagnostic_events WHERE opportunityId=? AND customerId=? ORDER BY id`, [opportunityId, customerId],
    );
    const knownTypes = new Set<string>(eventRows.map(event => String(event.eventType)));
    const rawEvents = eventRows.map(event => ({
      id: Number(event.id), eventType: String(event.eventType), eventAt: toIso(event.eventAt),
      workerId: event.workerId || null, retryAttempt: event.retryAttempt == null ? null : Number(event.retryAttempt),
      retryAt: toIso(event.retryAt), errorCode: event.errorCode || null, failureCategory: event.failureCategory || null,
      message: event.diagnosticMessage || null, evidenceSource: "append_only_diagnostic_event",
    }));
    const addLegacy = (eventType: DeliveryDiagnosticEventType, timestamp: unknown, evidenceSource = "retained_popup_lifecycle_row") => {
      if (knownTypes.has(eventType)) return;
      const eventAt = toIso(timestamp);
      if (eventAt) rawEvents.push({ id: -rawEvents.length - 1, eventType, eventAt, workerId: null, retryAttempt: null, retryAt: null, errorCode: null, failureCategory: null, message: null, evidenceSource });
    };
    addLegacy("generated", row.generatedAt, "generation_assignment_record");
    if (row.popupEventId) {
      addLegacy("queued", row.popupCreatedAt);
      addLegacy("browser_received", row.receivedAt);
      addLegacy("browser_acknowledged", row.receivedAt);
      if(!knownTypes.has("popup_render_confirmed")&&row.renderedAt){
        const eventAt=toIso(row.renderedAt);
        if(eventAt)rawEvents.push({id:-rawEvents.length-1,eventType:"legacy_render_acknowledgement",eventAt,workerId:null,retryAttempt:null,retryAt:null,errorCode:null,failureCategory:null,message:"A legacy render timestamp exists, but visible foreground rendering was not verified.",evidenceSource:"retained_renderedAt_not_visibility_confirmed"});
      }
      addLegacy("noticed", row.noticedAt);
      addLegacy("opened", row.openedAt);
      addLegacy("dismissed", row.dismissedAt);
      addLegacy("withdrawn", row.withdrawnAt);
      addLegacy("traded", row.tradedAt);
      addLegacy("completed", row.settledAt);
      addLegacy("expired", row.expiredAt);
    }
    if ((row.deliveryStatus === "failed" || row.assignmentStatus === "failed") && !knownTypes.has("failed")) {
      const errorCode = row.lastErrorCode || row.failureReason || null;
      rawEvents.push({ id: -rawEvents.length - 1, eventType: "failed", eventAt: null, workerId: null, retryAttempt: null, retryAt: null, errorCode,
        failureCategory: classifyDeliveryFailure({ errorCode, assignmentStatus: row.assignmentStatus, deliveryStatus: row.deliveryStatus, isFailure: true }),
        message: safeDeliveryDiagnosticMessage(errorCode,{receivedAt:row.receivedAt,renderedAt:row.renderedAt}), evidenceSource: "current_persisted_failure_state_timestamp_unavailable" });
    }
    rawEvents.sort((left, right) => {
      const leftMs = left.eventAt ? Date.parse(left.eventAt) : Number.POSITIVE_INFINITY;
      const rightMs = right.eventAt ? Date.parse(right.eventAt) : Number.POSITIVE_INFINITY;
      return leftMs - rightMs || left.id - right.id;
    });
    const isTerminal = ["failed", "expired", "dismissed", "withdrawn", "traded", "completed"].includes(String(rawEvents[rawEvents.length - 1]?.eventType || ""));
    const now = Date.now();
    const history = rawEvents.map((event, index) => {
      const currentMs = event.eventAt ? Date.parse(event.eventAt) : NaN;
      const next = rawEvents[index + 1];
      const nextMs = next?.eventAt ? Date.parse(next.eventAt) : NaN;
      const durationMs = Number.isFinite(currentMs)
        ? Number.isFinite(nextMs) ? Math.max(0, nextMs - currentMs) : !isTerminal ? Math.max(0, now - currentMs) : null
        : null;
      return { ...event, durationMs };
    });
    const latestEventType = eventRows[eventRows.length - 1]?.eventType;
    const confirmedRenderedAt=eventRows.find(event=>String(event.eventType)==="popup_render_confirmed")?.eventAt||null;
    const deliveryStatus = row.deliveryStatus || (latestEventType === "queue_admission_skipped" ? "queue_admission_skipped" : latestEventType === "failed" || row.assignmentStatus === "failed" ? "failed" : row.assignmentStatus === "expired" ? "expired" : "unconfirmed");
    const lastErrorCode = row.lastErrorCode || [...eventRows].reverse().find(event => event.errorCode)?.errorCode || row.failureReason || null;
    return {
      sourceAvailable: true,
      opportunity: {
        opportunityId: Number(row.opportunityId), customerId, customerName: row.customerName || null, customerEmail: row.customerEmail || null,
        packageName: row.packageName, companyReferenceId: row.companyReferenceId || null, companyName: row.companyDisplayName || null,
        assignmentStatus: row.assignmentStatus, offerStatus: row.offerStatus, deliveryStatus,
        generatedAt: toIso(row.generatedAt), opensAt: toIso(row.opensAt), closesAt: toIso(row.closesAt), expiresAt: toIso(row.expiresAt),
        popupEventId: row.popupEventId ? Number(row.popupEventId) : null,
        retryAttempts: Math.max(Number(row.deliveryAttemptCount || 0), Number(row.historyRetryCount || 0)), retryAt: toIso(row.deliveryRetryAfter),
        receivedAt: toIso(row.receivedAt), renderedAt: toIso(confirmedRenderedAt), noticedAt: toIso(row.noticedAt), openedAt: toIso(row.openedAt),
        dismissedAt: toIso(row.dismissedAt), withdrawnAt: toIso(row.withdrawnAt), tradedAt: toIso(row.tradedAt), completedAt: toIso(row.settledAt), expiredAt: toIso(row.expiredAt),
        lastErrorCode, failureCategory: classifyDeliveryFailure({ errorCode: lastErrorCode, assignmentStatus: row.assignmentStatus, deliveryStatus, isFailure: deliveryStatus === "failed",receivedAt:row.receivedAt,renderedAt:confirmedRenderedAt }),
        dispatcher: "user_scoped_customer_request", dedicatedDeliveryWorker: false,
      },
      history,
      historyAvailable: eventRows.length > 0,
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getOpportunityDeliveryFailureAnalysis(input: { fromDate?: string; toDate?: string } = {}) {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, categories: [], range: null, generatedAt: null };
  const { from, to } = normalizeRange(input.fromDate, input.toDate);
  return withConnection(async connection => {
    const [rows] = await connection.query<any[]>(
      `SELECT COALESCE(failureCategory,'unknown_or_unclassified') AS failureCategory,
         COUNT(DISTINCT CONCAT(customerId,':',opportunityId)) AS opportunities,COUNT(*) AS failureEvents,MAX(eventAt) AS lastFailureAt
       FROM opportunity_delivery_diagnostic_events
       WHERE eventType='failed' AND eventAt>=? AND eventAt<=?
       GROUP BY COALESCE(failureCategory,'unknown_or_unclassified') ORDER BY opportunities DESC`, [from, to],
    );
    return {
      sourceAvailable: true,
      categories: rows.map(row => ({ category: row.failureCategory, opportunities: Number(row.opportunities || 0), failureEvents: Number(row.failureEvents || 0), lastFailureAt: toIso(row.lastFailureAt) })),
      range: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      basis: "Append-only failure events only; legacy popup states without a recorded failure timestamp are excluded.",
    };
  });
}


export async function getOpportunityDeliveryOverview() {
  if (!process.env.DATABASE_URL) return { sourceAvailable: false, windowStart: null, generatedAt: null };
  return withConnection(async connection => {
    const [eventRows] = await connection.query<any[]>(
      `SELECT
         COUNT(DISTINCT CASE WHEN eventType='generated' THEN CONCAT(customerId,':',opportunityId) END) AS generated24h,
         COUNT(DISTINCT CASE WHEN eventType='delivery_attempted' THEN CONCAT(customerId,':',opportunityId) END) AS attempted24h,
         COUNT(DISTINCT CASE WHEN eventType='browser_received' THEN CONCAT(customerId,':',opportunityId) END) AS received24h,
         COUNT(DISTINCT CASE WHEN eventType='browser_acknowledged' THEN CONCAT(customerId,':',opportunityId) END) AS acknowledged24h,
         COUNT(DISTINCT CASE WHEN eventType='popup_render_confirmed' THEN CONCAT(customerId,':',opportunityId) END) AS rendered24h,
         COUNT(DISTINCT CASE WHEN eventType='failed' THEN CONCAT(customerId,':',opportunityId) END) AS failed24h,
         COUNT(DISTINCT CASE WHEN eventType='expired' THEN CONCAT(customerId,':',opportunityId) END) AS expired24h,
         COUNT(DISTINCT CASE WHEN eventType='completed' THEN CONCAT(customerId,':',opportunityId) END) AS completed24h,
         (SELECT COUNT(*) FROM (
           SELECT customerId,opportunityId FROM opportunity_delivery_diagnostic_events
           WHERE eventType='failed' AND eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
           GROUP BY customerId,opportunityId HAVING COUNT(*)>1
         ) repeatedFailures) AS repeatedFailureOpportunities24h
       FROM opportunity_delivery_diagnostic_events
       WHERE eventType IN ('generated','delivery_attempted','browser_received','browser_acknowledged','popup_render_confirmed','failed','expired','completed')
         AND eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)`,
    );
    const [queueRows] = await connection.query<any[]>(
      `SELECT SUM(deliveryStatus IN ('queued','in_progress','retry_wait')) AS pendingTotal,
         SUM(deliveryStatus='queued') AS queued,
         SUM(deliveryStatus='in_progress') AS inProgress,
         SUM(deliveryStatus='retry_wait') AS retryWait,
         SUM(deliveryStatus='failed') AS currentFailed,
         SUM(deliveryStatus='expired') AS currentExpired,
         SUM(deliveryStatus='in_progress' AND deliveryLeaseExpiresAt IS NOT NULL AND deliveryLeaseExpiresAt<=UTC_TIMESTAMP()) AS staleProcessingLeases,
         SUM(deliveryStatus IN ('queued','in_progress','retry_wait') AND o.closesAt<=UTC_TIMESTAMP()) AS pendingPastExpiry
       FROM opportunity_popup_events p INNER JOIN opportunity_offers o ON o.id=p.offerId AND o.assignedUserId=p.userId
       WHERE p.deliveryStatus IN ('queued','in_progress','retry_wait','failed','expired')`,
    );
    const [oldestRows] = await connection.query<any[]>(
      `SELECT p.id AS popupEventId,p.offerId AS opportunityId,p.userId AS customerId,p.deliveryStatus,p.createdAt,p.deliveryRetryAfter,o.closesAt
       FROM opportunity_popup_events p INNER JOIN opportunity_offers o ON o.id=p.offerId AND o.assignedUserId=p.userId
       WHERE p.deliveryStatus IN ('queued','in_progress','retry_wait')
       ORDER BY p.createdAt,p.id LIMIT 1`,
    );
    const [latencyRows] = await connection.query<any[]>(
      `SELECT AVG(CASE WHEN q.eventAt<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) THEN TIMESTAMPDIFF(MICROSECOND,q.eventAt,r.receivedAt)/1000 END) AS prior29DayAverageMilliseconds,
         SUM(q.eventAt<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)) AS prior29DaySampleCount,
         AVG(CASE WHEN q.eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) THEN TIMESTAMPDIFF(MICROSECOND,q.eventAt,r.receivedAt)/1000 END) AS average24HourMilliseconds,
         SUM(q.eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)) AS sampleCount24Hours
       FROM opportunity_delivery_diagnostic_events q
       INNER JOIN (
         SELECT customerId,opportunityId,MIN(eventAt) AS receivedAt
         FROM opportunity_delivery_diagnostic_events
         WHERE eventType='browser_received' AND eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)
         GROUP BY customerId,opportunityId
       ) r ON r.customerId=q.customerId AND r.opportunityId=q.opportunityId
       WHERE q.eventType='queued' AND q.eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND r.receivedAt>=q.eventAt`,
    );
    const latency=latencyRows[0]||{};
    const latencySamples=Number(latency.prior29DaySampleCount||0)+Number(latency.sampleCount24Hours||0);
    const average24h=latency.average24HourMilliseconds==null?null:Number(latency.average24HourMilliseconds);
    const prior29d=latency.prior29DayAverageMilliseconds==null?null:Number(latency.prior29DayAverageMilliseconds);
    const expectedWaitMicros=Math.max(0,Math.round(Number(average24h??prior29d??0)*1000));
    const [riskRows]=await connection.query<any[]>(
      `SELECT SUM(TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(),o.closesAt)>0 AND TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(),o.closesAt)<=?) AS pendingApproachingExpiry,
         SUM(TIMESTAMPDIFF(MICROSECOND,p.createdAt,UTC_TIMESTAMP())>?) AS pendingBeyondObservedWait
       FROM opportunity_popup_events p INNER JOIN opportunity_offers o ON o.id=p.offerId AND o.assignedUserId=p.userId
       WHERE p.deliveryStatus IN ('queued','in_progress','retry_wait')`,[expectedWaitMicros,expectedWaitMicros],
    );
    const [backlogRows]=await connection.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM (
            SELECT MAX(id) AS latestId FROM opportunity_delivery_diagnostic_events
            WHERE eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND eventAt<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR) GROUP BY customerId,opportunityId
          ) baselineCoverage) AS trackedAtBaseline,
         (SELECT COUNT(*) FROM (
            SELECT MAX(id) AS latestId FROM opportunity_delivery_diagnostic_events
            WHERE eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND eventAt<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR) GROUP BY customerId,opportunityId
          ) prior JOIN opportunity_delivery_diagnostic_events e ON e.id=prior.latestId
          WHERE e.eventType IN ('queued','dispatch_claimed','delivery_attempted','retry_scheduled')) AS pendingOneHourAgo,
         (SELECT COUNT(DISTINCT CONCAT(p.userId,':',p.offerId)) FROM opportunity_popup_events p
          INNER JOIN (SELECT DISTINCT customerId,opportunityId FROM opportunity_delivery_diagnostic_events WHERE eventType='generated' AND eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)) tracked
            ON tracked.customerId=p.userId AND tracked.opportunityId=p.offerId
          WHERE p.deliveryStatus IN ('queued','in_progress','retry_wait')) AS trackedPendingNow`,
    );
    const events=eventRows[0]||{};
    const queue=queueRows[0]||{};
    const oldest=oldestRows[0]||null;
    const queued=Number(queue.queued||0),inProgress=Number(queue.inProgress||0),retryWait=Number(queue.retryWait||0);
    const oldestCreatedAt=toIso(oldest?.createdAt);
    const oldestAgeMs=oldestCreatedAt?Math.max(0,Date.now()-Date.parse(oldestCreatedAt)):null;
    return {
      sourceAvailable:true,
      windowStart:new Date(Date.now()-24*60*60*1000).toISOString(),
      generatedAt:new Date().toISOString(),
      generated24h:Number(events.generated24h||0),
      deliveryAttempted24h:Number(events.attempted24h||0),
      successfullyDelivered24h:Number(events.received24h||0),
      browserReceived24h:Number(events.received24h||0),
      browserAcknowledged24h:Number(events.acknowledged24h||0),
      rendered24h:Number(events.rendered24h||0),
      failedEvents24h:Number(events.failed24h||0),
      expiredEvents24h:Number(events.expired24h||0),
      completed24h:Number(events.completed24h||0),
      currentQueue:{queued,inProgress,retryWait,pendingTotal:Number(queue.pendingTotal||0),currentFailed:Number(queue.currentFailed||0),currentExpired:Number(queue.currentExpired||0),staleProcessingLeases:Number(queue.staleProcessingLeases||0),pendingPastExpiry:Number(queue.pendingPastExpiry||0)},
      averageQueueToBrowserReceiptMilliseconds24h:average24h,
      averageLatency24hSampleCount:Number(latency.sampleCount24Hours||0),
      prior29DayAverageLatencyMilliseconds:prior29d,
      prior29DayLatencySampleCount:Number(latency.prior29DaySampleCount||0),
      expectedWaitBasis:latencySamples?"Captured queue-to-browser-receipt average; current 24-hour window, falling back to prior 29-day average when the current window has no samples.":null,
      pendingBeyondObservedWait:latencySamples?Number(riskRows[0]?.pendingBeyondObservedWait||0):null,
      pendingApproachingExpiry:latencySamples?Number(riskRows[0]?.pendingApproachingExpiry||0):null,
      trackedBacklogBaselineCount:Number(backlogRows[0]?.trackedAtBaseline||0),
      trackedBacklogCoverageDays:30,
      backlogOneHourAgo:Number(backlogRows[0]?.trackedAtBaseline||0)>0?Number(backlogRows[0]?.pendingOneHourAgo||0):null,
      trackedPendingNow:Number(backlogRows[0]?.trackedPendingNow||0),
      trackedBacklogDeltaOneHour:Number(backlogRows[0]?.trackedAtBaseline||0)>0?Number(backlogRows[0]?.trackedPendingNow||0)-Number(backlogRows[0]?.pendingOneHourAgo||0):null,
      backlogTrendBasis:"Append-only tracked opportunities generated within the last 30 days only; compares current pending popup rows with the latest recorded lifecycle stage one hour earlier.",
      repeatedFailureOpportunities24h:Number(events.repeatedFailureOpportunities24h||0),
      oldestPending:oldest?{popupEventId:Number(oldest.popupEventId),opportunityId:Number(oldest.opportunityId),customerId:Number(oldest.customerId),deliveryStatus:oldest.deliveryStatus,createdAt:oldestCreatedAt,ageMilliseconds:oldestAgeMs,retryAt:toIso(oldest.deliveryRetryAfter),expiresAt:toIso(oldest.closesAt)}:null,
      oldestPendingAgeMilliseconds:oldestAgeMs,
      attributionNote:"Rolling event metrics use append-only evidence captured by this diagnostics release; existing aggregate history without event timestamps is not backfilled. Current queue counts use persisted popup status. The dispatcher is customer-request scoped, not a dedicated delivery daemon.",
    };
  });
}
