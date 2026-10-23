import { randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  privacyAuditEvents,
  privacyPolicyVersions,
  privacyRequestEvents,
  privacyRequests,
  users,
} from "../drizzle/schema";
import {
  canTransitionPrivacyRequest,
  nextPrivacyVersion,
  privacyRequestStatusMessage,
  type PrivacyPolicySection,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from "../shared/privacy";
import { getDb } from "./db";

const ACTIVE_STATUSES: PrivacyRequestStatus[] = ["submitted", "identity_check", "in_review", "awaiting_customer"];

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, "").trim().slice(0, maxLength);
}

function parseSections(value: string): PrivacyPolicySection[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((section): section is PrivacyPolicySection =>
      Boolean(section) && typeof section.id === "string" && typeof section.title === "string" && typeof section.body === "string"
    ).map((section) => ({ id: section.id, title: section.title, body: section.body }));
  } catch {
    return [];
  }
}

function asCustomerPolicy(row: typeof privacyPolicyVersions.$inferSelect) {
  return {
    id: row.id,
    versionLabel: row.versionLabel,
    title: row.title,
    summary: row.summary,
    sections: parseSections(row.sectionsJson),
    status: row.status,
    effectiveAt: row.effectiveAt,
    publishedAt: row.publishedAt,
  };
}

function asAdminPolicy(row: typeof privacyPolicyVersions.$inferSelect) {
  return {
    ...asCustomerPolicy(row),
    createdBy: row.createdBy,
    publishedBy: row.publishedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asCustomerRequest(row: typeof privacyRequests.$inferSelect, events: Array<typeof privacyRequestEvents.$inferSelect>) {
  return {
    id: row.id,
    requestReference: row.requestReference,
    requestType: row.requestType,
    subject: row.subject,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewedAt: row.reviewedAt,
    events: events.filter((event) => Boolean(event.customerMessage)).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      message: event.customerMessage,
      createdAt: event.createdAt,
    })),
  };
}

function normalizeSections(sections: PrivacyPolicySection[]): PrivacyPolicySection[] {
  if (sections.length < 6 || sections.length > 16) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A privacy notice must contain between 6 and 16 sections." });
  }
  const ids = new Set<string>();
  return sections.map((section) => {
    const id = cleanText(section.id.toLowerCase(), 48);
    const title = cleanText(section.title, 160);
    const body = cleanText(section.body, 8000);
    if (!/^[a-z0-9-]{2,48}$/.test(id) || ids.has(id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Each policy section needs a unique, valid identifier." });
    }
    if (title.length < 3 || body.length < 40) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Each policy section needs a heading and a meaningful explanation." });
    }
    ids.add(id);
    return { id, title, body };
  });
}

export async function getCurrentPrivacyPolicy() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Privacy information is temporarily unavailable." });
  const row = (await db.select().from(privacyPolicyVersions)
    .where(eq(privacyPolicyVersions.status, "published"))
    .orderBy(desc(privacyPolicyVersions.publishedAt), desc(privacyPolicyVersions.id))
    .limit(1))[0];
  return row ? asCustomerPolicy(row) : null;
}

export async function getPrivacyPolicyHistory() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Privacy history is temporarily unavailable." });
  const rows = await db.select().from(privacyPolicyVersions)
    .where(inArray(privacyPolicyVersions.status, ["published", "archived"]))
    .orderBy(desc(privacyPolicyVersions.publishedAt), desc(privacyPolicyVersions.id))
    .limit(25);
  return rows.map(asCustomerPolicy);
}

export async function getAdminPrivacyPolicyState() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Privacy management is temporarily unavailable." });
  const [rows, currentRows, draftRows, recentAudit] = await Promise.all([
    db.select().from(privacyPolicyVersions).orderBy(desc(privacyPolicyVersions.updatedAt), desc(privacyPolicyVersions.id)).limit(40),
    db.select().from(privacyPolicyVersions).where(eq(privacyPolicyVersions.status, "published")).orderBy(desc(privacyPolicyVersions.publishedAt), desc(privacyPolicyVersions.id)).limit(1),
    db.select().from(privacyPolicyVersions).where(eq(privacyPolicyVersions.status, "draft")).orderBy(desc(privacyPolicyVersions.updatedAt)).limit(1),
    db.select().from(privacyAuditEvents).orderBy(desc(privacyAuditEvents.createdAt)).limit(40),
  ]);
  return {
    current: currentRows[0] ? asAdminPolicy(currentRows[0]) : null,
    draft: draftRows[0] ? asAdminPolicy(draftRows[0]) : null,
    versions: rows.filter((row) => row.status !== "draft").map(asAdminPolicy),
    drafts: rows.filter((row) => row.status === "draft").map(asAdminPolicy),
    recentAudit,
  };
}

export async function savePrivacyPolicyDraft(
  adminId: number,
  input: { draftId?: number; title: string; summary: string; sections: PrivacyPolicySection[] },
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Privacy changes could not be saved." });
  const title = cleanText(input.title, 200);
  const summary = cleanText(input.summary, 700);
  const sections = normalizeSections(input.sections);
  if (title.length < 5 || summary.length < 20) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a descriptive notice title and summary before saving." });
  }

  return db.transaction(async (tx) => {
    const draft = input.draftId
      ? (await tx.select().from(privacyPolicyVersions).where(and(eq(privacyPolicyVersions.id, input.draftId), eq(privacyPolicyVersions.status, "draft"))).limit(1).for("update"))[0]
      : (await tx.select().from(privacyPolicyVersions).where(eq(privacyPolicyVersions.status, "draft")).orderBy(desc(privacyPolicyVersions.updatedAt)).limit(1).for("update"))[0];
    if (input.draftId && !draft) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That draft is no longer available. Refresh the Privacy Centre and retry." });
    }
    let draftId: number;
    if (draft) {
      draftId = draft.id;
      await tx.update(privacyPolicyVersions).set({ title, summary, sectionsJson: JSON.stringify(sections), createdBy: draft.createdBy || adminId })
        .where(and(eq(privacyPolicyVersions.id, draftId), eq(privacyPolicyVersions.status, "draft")));
    } else {
      draftId = Number((await tx.insert(privacyPolicyVersions).values({
        versionLabel: "DRAFT-" + randomBytes(7).toString("hex"),
        title,
        summary,
        sectionsJson: JSON.stringify(sections),
        status: "draft",
        createdBy: adminId,
      }))[0].insertId);
    }
    await tx.insert(privacyAuditEvents).values({
      actorUserId: adminId,
      action: "policy.draft.saved",
      entityType: "privacy_policy_version",
      entityId: String(draftId),
      metadataJson: JSON.stringify({ sectionCount: sections.length }),
    });
    return { success: true, draftId, sectionCount: sections.length };
  });
}

export async function publishPrivacyPolicy(adminId: number, draftId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The privacy notice could not be published." });
  return db.transaction(async (tx) => {
    const draft = (await tx.select().from(privacyPolicyVersions).where(and(eq(privacyPolicyVersions.id, draftId), eq(privacyPolicyVersions.status, "draft"))).limit(1).for("update"))[0];
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "The selected draft is no longer available." });
    const sections = normalizeSections(parseSections(draft.sectionsJson));
    const title = cleanText(draft.title, 200);
    const summary = cleanText(draft.summary, 700);
    if (title.length < 5 || summary.length < 20 || sections.length < 6) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The draft is incomplete. Save a valid title, summary, and at least six sections before publication." });
    }
    const latest = (await tx.select().from(privacyPolicyVersions).where(inArray(privacyPolicyVersions.status, ["published", "archived"]))
      .orderBy(desc(privacyPolicyVersions.publishedAt), desc(privacyPolicyVersions.id)).limit(1))[0];
    const nextVersion = nextPrivacyVersion(latest?.versionLabel);
    const now = new Date();
    await tx.update(privacyPolicyVersions).set({ status: "archived" }).where(eq(privacyPolicyVersions.status, "published"));
    await tx.update(privacyPolicyVersions).set({ versionLabel: nextVersion, status: "published", effectiveAt: now, publishedAt: now, publishedBy: adminId })
      .where(and(eq(privacyPolicyVersions.id, draftId), eq(privacyPolicyVersions.status, "draft")));
    await tx.insert(privacyAuditEvents).values({
      actorUserId: adminId,
      action: "policy.published",
      entityType: "privacy_policy_version",
      entityId: String(draftId),
      metadataJson: JSON.stringify({ versionLabel: nextVersion, sectionCount: sections.length }),
    });
    return { success: true, versionLabel: nextVersion, publishedAt: now };
  });
}

export async function listAdminPrivacyRequesters() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The privacy request queue is temporarily unavailable." });
  return db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
}

export async function listMyPrivacyRequests(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your privacy requests are temporarily unavailable." });
  const rows = await db.select().from(privacyRequests).where(eq(privacyRequests.userId, userId))
    .orderBy(desc(privacyRequests.createdAt), desc(privacyRequests.id)).limit(30);
  if (!rows.length) return [];
  const events = await db.select().from(privacyRequestEvents)
    .where(inArray(privacyRequestEvents.requestId, rows.map((row) => row.id)))
    .orderBy(desc(privacyRequestEvents.createdAt), desc(privacyRequestEvents.id));
  return rows.map((row) => asCustomerRequest(row, events.filter((event) => event.requestId === row.id)));
}

export async function createPrivacyRequest(
  userId: number,
  input: { requestType: PrivacyRequestType; subject: string; details?: string; idempotencyKey: string },
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your privacy request could not be submitted." });
  const subject = cleanText(input.subject, 180);
  const details = cleanText(input.details || "", 3000);
  const idempotencyKey = cleanText(input.idempotencyKey, 80);
  if (subject.length < 5 || idempotencyKey.length < 8) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Add a clear subject and retry the request." });
  }

  return db.transaction(async (tx) => {
    const prior = (await tx.select().from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.idempotencyKey, idempotencyKey))).limit(1))[0];
    if (prior) return { id: prior.id, requestReference: prior.requestReference, status: prior.status, duplicate: true };
    const active = (await tx.select({ value: count() }).from(privacyRequests).where(and(
      eq(privacyRequests.userId, userId),
      inArray(privacyRequests.status, ACTIVE_STATUSES),
    )))[0]?.value || 0;
    if (Number(active) >= 5) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You already have several privacy requests awaiting review. Check their status or contact the Support Centre before opening another." });
    }

    const requestReference = "PRV-" + Date.now().toString(36).toUpperCase() + "-" + randomBytes(4).toString("hex").toUpperCase();
    const result = await tx.insert(privacyRequests).values({ requestReference, idempotencyKey, userId, requestType: input.requestType, subject, details: details || null, status: "submitted" });
    const id = Number(result[0].insertId);
    await tx.insert(privacyRequestEvents).values({
      requestId: id,
      actorType: "customer",
      actorUserId: userId,
      eventType: "request.submitted",
      newStatus: "submitted",
      customerMessage: "Your privacy request has been received and is awaiting review.",
    });
    return { id, requestReference, status: "submitted" as const, duplicate: false };
  });
}

export async function cancelMyPrivacyRequest(userId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The request could not be cancelled." });
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(privacyRequests).where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.userId, userId))).limit(1).for("update"))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Privacy request not found." });
    if (row.status !== "submitted") throw new TRPCError({ code: "BAD_REQUEST", message: "A request can only be cancelled while it is awaiting initial review." });
    await tx.update(privacyRequests).set({ status: "cancelled" }).where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.userId, userId), eq(privacyRequests.status, "submitted")));
    await tx.insert(privacyRequestEvents).values({
      requestId,
      actorType: "customer",
      actorUserId: userId,
      eventType: "request.cancelled",
      previousStatus: "submitted",
      newStatus: "cancelled",
      customerMessage: "This privacy request was cancelled at your request.",
    });
    return { success: true, requestReference: row.requestReference, status: "cancelled" as const };
  });
}

export async function listAdminPrivacyRequests(status?: PrivacyRequestStatus) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The privacy request queue is temporarily unavailable." });
  const query = db.select({
    id: privacyRequests.id,
    requestReference: privacyRequests.requestReference,
    userId: privacyRequests.userId,
    customerName: users.name,
    customerEmail: users.email,
    requestType: privacyRequests.requestType,
    subject: privacyRequests.subject,
    status: privacyRequests.status,
    createdAt: privacyRequests.createdAt,
    updatedAt: privacyRequests.updatedAt,
    assignedAdminId: privacyRequests.assignedAdminId,
  }).from(privacyRequests).innerJoin(users, eq(privacyRequests.userId, users.id));
  return status
    ? query.where(eq(privacyRequests.status, status)).orderBy(desc(privacyRequests.createdAt), desc(privacyRequests.id)).limit(100)
    : query.orderBy(desc(privacyRequests.createdAt), desc(privacyRequests.id)).limit(100);
}

export async function getAdminPrivacyRequestDetail(requestId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The privacy request could not be loaded." });
  const request = (await db.select({
    id: privacyRequests.id,
    requestReference: privacyRequests.requestReference,
    userId: privacyRequests.userId,
    customerName: users.name,
    customerEmail: users.email,
    requestType: privacyRequests.requestType,
    subject: privacyRequests.subject,
    details: privacyRequests.details,
    status: privacyRequests.status,
    createdAt: privacyRequests.createdAt,
    updatedAt: privacyRequests.updatedAt,
    assignedAdminId: privacyRequests.assignedAdminId,
    reviewedBy: privacyRequests.reviewedBy,
    reviewedAt: privacyRequests.reviewedAt,
  }).from(privacyRequests).innerJoin(users, eq(privacyRequests.userId, users.id))
    .where(eq(privacyRequests.id, requestId)).limit(1))[0];
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Privacy request not found." });
  const events = await db.select().from(privacyRequestEvents).where(eq(privacyRequestEvents.requestId, requestId))
    .orderBy(desc(privacyRequestEvents.createdAt), desc(privacyRequestEvents.id));
  return { ...request, events };
}

export async function updatePrivacyRequest(
  adminId: number,
  input: { requestId: number; status: PrivacyRequestStatus; customerMessage?: string; internalNote?: string },
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The privacy request could not be updated." });
  const customerMessage = cleanText(input.customerMessage || "", 1500);
  const internalNote = cleanText(input.internalNote || "", 3000);
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(privacyRequests).where(eq(privacyRequests.id, input.requestId)).limit(1).for("update"))[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Privacy request not found." });
    if (!canTransitionPrivacyRequest(row.status, input.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That request status transition is not permitted. Refresh the queue and review the current status." });
    }
    const statusChanged = row.status !== input.status;
    const visibleMessage = customerMessage || (statusChanged ? privacyRequestStatusMessage(input.status) : "");
    if (!statusChanged && !internalNote && !customerMessage) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Change the request status or add a customer message or internal note." });
    }
    await tx.update(privacyRequests).set({
      status: input.status,
      assignedAdminId: row.assignedAdminId || adminId,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    }).where(eq(privacyRequests.id, row.id));
    await tx.insert(privacyRequestEvents).values({
      requestId: row.id,
      actorType: "admin",
      actorUserId: adminId,
      eventType: statusChanged ? "request.status_changed" : "request.note_added",
      previousStatus: row.status,
      newStatus: input.status,
      customerMessage: visibleMessage || null,
      internalNote: internalNote || null,
    });
    await tx.insert(privacyAuditEvents).values({
      actorUserId: adminId,
      action: statusChanged ? "request.status_changed" : "request.note_added",
      entityType: "privacy_request",
      entityId: String(row.id),
      metadataJson: JSON.stringify({ previousStatus: row.status, newStatus: input.status }),
    });
    return { success: true, userId: row.userId, requestReference: row.requestReference, status: input.status, customerMessage: visibleMessage || null };
  });
}
