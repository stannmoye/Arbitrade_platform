import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findNewNotificationSoundEvents, mergeSeenNotificationIds, selectMostImportantNotificationSoundEvent } from "./notification-sound-deduplication";

describe("notification sound reconnect deduplication", () => {
  const rows = [
    { id: 12, category: "deposit", readAt: null },
    { id: 11, category: "support", readAt: null },
    { id: 10, category: "announcement", readAt: null },
    { id: 9, category: "deposit", readAt: new Date() },
  ];

  it("does not play historical events during initial hydration", () => {
    expect(findNewNotificationSoundEvents(rows, null, [], {})).toEqual([]);
  });

  it("plays only newly observed unread events not already persisted as seen", () => {
    expect(findNewNotificationSoundEvents(rows, [11, 10, 9], [12], { support: true }))
      .toEqual([]);
    expect(findNewNotificationSoundEvents(rows, [11, 10, 9], [], { deposit: true, support: true }))
      .toEqual([rows[0]]);
  });

  it("respects category visibility before selecting sound events", () => {
    expect(findNewNotificationSoundEvents(rows, [10, 9], [], { deposit: false, support: true }))
      .toEqual([rows[1]]);
  });

  it("plays at most once for duplicate IDs in one cursor batch", () => {
    const duplicateBatch = [rows[0], { ...rows[0] }, rows[1]];
    expect(findNewNotificationSoundEvents(duplicateBatch, [10, 9], [], { deposit: true, support: true }))
      .toEqual([rows[0], rows[1]]);
  });

  it("treats missing categories as account and ignores malformed event IDs", () => {
    const mixed = [
      { id: 13, category: null, readAt: null },
      { id: 0, category: "deposit", readAt: null },
      { id: Number.NaN, category: "deposit", readAt: null },
      { id: 14, category: "deposit", readAt: null },
    ];
    expect(findNewNotificationSoundEvents(mixed, [10, 9], [], { account: false, deposit: true }))
      .toEqual([mixed[3]]);
  });

  it("merges duplicate IDs and keeps only the newest bounded tail", () => {
    expect(mergeSeenNotificationIds([1, 2, 2], [2, 3, 4], 3)).toEqual([2, 3, 4]);
    expect(mergeSeenNotificationIds([], [1, -1, 1.5, Number.NaN, 2], 10)).toEqual([1, 2]);
    // The API cursor is newest-first; bounded storage must retain the newest IDs.
    expect(mergeSeenNotificationIds([], [1000, 999, 998, 997, 996], 3)).toEqual([998, 999, 1000]);
  });


  it("selects the highest-priority event for a mixed polling batch", () => {
    const mixed = [
      { id: 40, category: "account", priority: "normal" },
      { id: 41, category: "support", priority: "urgent" },
      { id: 42, category: "security", priority: "high" },
      { id: 43, category: "deposit", priority: "urgent" },
    ];
    expect(selectMostImportantNotificationSoundEvent(mixed)).toEqual(mixed[3]);
    expect(selectMostImportantNotificationSoundEvent([])).toBeNull();
  });

  it("rejects unsafe history bounds", () => {
    expect(() => mergeSeenNotificationIds([], [], 0)).toThrow(RangeError);
    expect(() => mergeSeenNotificationIds([], [], 5001)).toThrow(RangeError);
  });

  it("uses the newest ID to break priority ties and safely treats unknown priorities as normal", () => {
    const mixed = [
      { id: 70, priority: "normal" },
      { id: 72, priority: "future-priority" },
      { id: 71, priority: "normal" },
      { id: 99, priority: "low" },
    ];
    expect(selectMostImportantNotificationSoundEvent(mixed)).toEqual(mixed[1]);
  });


  it("does not replay an observed event when its category visibility is later enabled", () => {
    const hiddenEvent = { id: 88, category: "deposit", readAt: null };
    expect(findNewNotificationSoundEvents([hiddenEvent], [10, 9], [], { deposit: false })).toEqual([]);
    // The live header records every cursor ID as observed, independently of visibility.
    expect(findNewNotificationSoundEvents([hiddenEvent], [88], [88], { deposit: true })).toEqual([]);
  });

  it("does not replay previously observed events after sound preferences are reloaded", () => {
    const observed = { id: 89, category: "support", readAt: null };
    const persisted = mergeSeenNotificationIds([], [observed.id]);
    expect(findNewNotificationSoundEvents([observed], [observed.id], persisted, { support: true })).toEqual([]);
  });

});


describe("notification sound header integration contract", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const effectStart = app.indexOf("const previousHeaderNotificationIds=useRef<number[]|null>(null)");
  const effectEnd = app.indexOf("const logout=trpc.auth.logout.useMutation", effectStart);
  const effect = app.slice(effectStart, effectEnd);

  it("persists every observed cursor ID even when category visibility suppresses playback", () => {
    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(effect).toContain("previousHeaderNotificationIds.current=rows.map(item=>item.id)");
    expect(effect).toContain("mergeSeenNotificationIds(persistedIds,rows.map(item=>item.id))");
  });

  it("exposes a customer sound opt-in control that persists preference and unlocks audio from a user gesture", () => {
    expect(app).toContain('className="secondary-button customer-header-sound-toggle"');
    expect(app).toContain("aria-pressed={customerSoundsEnabled}");
    expect(app).toContain('window.localStorage.setItem("wisebond-sound-effects",next?"on":"off")');
    expect(app).toContain("if(next)void unlockNotificationAudio()");
    expect(css).toContain(".portal-session .customer-header-sound-toggle");
  });

  it("passes the persisted administrator volume into customer notification playback", () => {
    expect(effect).toContain("playConfiguredSound(headerSoundSettings[soundKey],soundKey,false,true,headerSoundSettings.volume)");
  });

  it("normalizes persisted sound history before applying the bounded newest-ID window", () => {
    expect(effect).toContain("if(Array.isArray(parsed))persistedIds=mergeSeenNotificationIds([],parsed as number[])");
    expect(effect).not.toContain("parsed.filter((id):id is number=>Number.isSafeInteger(id)&&id>0).slice(-500)");
  });

  it("re-evaluates sound preferences without replaying the current polling window", () => {
    expect(effect).toContain("previousHeaderNotificationIds.current=rows.map(item=>item.id)");
    expect(effect).toContain("headerSoundSettingsQuery.data");
    expect(effect).toContain("findNewNotificationSoundEvents(rows,previousHeaderNotificationIds.current,persistedIds");
  });

  it("reports rejected audio playback and stops only a failed opportunity loop", () => {
    expect(app).toContain("arbitrade:notification-audio-blocked");
    expect(app).toContain("audio.play().catch(reportBlocked)");
    expect(app).toContain("if(kind===\"opportunity\"){if(opportunityLoopTimer)window.clearInterval(opportunityLoopTimer);opportunityLoopTimer=null;}");
  });

  it("stops an opportunity loop for both rejected promises and synchronous audio errors", () => {
    expect(app).toContain("const stopOpportunityLoop=()=>{if(kind===\"opportunity\"){if(opportunityLoopTimer)window.clearInterval(opportunityLoopTimer);opportunityLoopTimer=null;}};");
    expect(app).toContain("audio.play().catch(reportBlocked)");
    expect(app).toContain("}catch{stopOpportunityLoop();try{if(typeof window!==\"undefined\")window.dispatchEvent");
  });

  it("shows accessible audio recovery guidance in both customer and admin settings", () => {
    expect(app).toContain("className=\"test-notice customer-audio-warning\" role=\"status\" aria-live=\"polite\"");
    expect(app).toContain("className=\"test-notice\" role=\"status\" aria-live=\"polite\"");
    expect(app).toContain("this blocked sound will not be replayed automatically");
    expect(css).toContain(".portal-session .customer-audio-warning{position:fixed");
    expect(css).toContain("max-width:min(420px,calc(100vw - 32px))");
    expect(css).toContain(".portal-session .customer-audio-warning button{display:inline-flex!important");
  });
});


describe("authoritative financial-event notification contracts", () => {
  const routers = readFileSync(new URL("../../server/routers.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../../server/db.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("commits admin wallet ledger writes before attempting customer notification", () => {
    const start = db.indexOf("export async function adjustCustomerBalance(");
    const end = db.indexOf("export async function listOpenOffers(", start);
    const adjustment = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(adjustment).toContain("await db.transaction(async tx=>");
    expect(adjustment).toContain("await tx.insert(balanceLedger).values(");
    expect(adjustment).toContain("return {success:true,newAvailableMinor:next");
    const transactionEnd = adjustment.indexOf("}); try { await createNotification(");
    expect(transactionEnd).toBeGreaterThan(adjustment.indexOf("await tx.insert(balanceLedger).values("));
    expect(transactionEnd).toBeLessThan(adjustment.indexOf("await createNotification("));
    expect(adjustment).toContain("after ledger commit");
  });

  it("emits the administrator-session event only after the wallet adjustment service returns", () => {
    const start = routers.indexOf("adjustCustomerBalance: adminProcedure");
    const end = routers.indexOf("settings: adminProcedure", start);
    const route = routers.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(route.indexOf("await adjustCustomerBalance(ctx.user.id, input)")).toBeGreaterThanOrEqual(0);
    expect(route.indexOf("await adjustCustomerBalance(ctx.user.id, input)")).toBeLessThan(route.indexOf("await recordTransactionConsoleEvent"));
    expect(route).toContain("eventType:`ADMIN_${input.mode.toUpperCase()}`");
  });

  it("uses stable event keys for committed trade-settlement notices and keeps delivery best-effort", () => {
    const settlementIndex = db.indexOf("const settlementNotices=[");
    const settlementEnd = db.indexOf("return result;", settlementIndex);
    const settlement = db.slice(settlementIndex, settlementEnd);
    expect(settlementIndex).toBeGreaterThanOrEqual(0);
    expect(settlementEnd).toBeGreaterThan(settlementIndex);
    expect(settlement).toContain('eventKey:`trade-settlement:${result.reference}:principal`');
    expect(settlement).toContain('eventKey:`trade-settlement:${result.reference}:reward`');
    expect(settlement).toContain("result.rewardMinor>0");
    expect(settlement).toContain("await Promise.allSettled(settlementNotices.map(notice=>createNotification(");
    expect(settlement).toContain("after commit");
  });

  it("does not present customer deposit submission or withdrawal initiation as confirmed payout", () => {
    expect(app).toContain("Mock provider flow available for testing");
    expect(app).toContain("Blocked until custody and execution providers are configured");
    expect(app).not.toContain("Deposit completed successfully");
    expect(app).not.toContain("Withdrawal paid successfully");
  });
});



describe("announcement lifecycle persistence contracts", () => {
  const db = readFileSync(new URL("../../server/db.ts", import.meta.url), "utf8");

  it("validates announcement schedule and expiry ordering before persistence", () => {
    const start = db.indexOf("export async function broadcastCustomerNotification(");
    const end = db.indexOf("export async function retryNotificationCampaign(", start);
    const broadcast = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(broadcast).toContain('parseDate(input.scheduledAt,"schedule time")');
    expect(broadcast).toContain('parseDate(input.expiresAt,"expiry time")');
    expect(broadcast).toContain("if(expiresAt && expiresAt.getTime()<=now.getTime())");
    expect(broadcast).toContain("if(scheduledAt && expiresAt && expiresAt.getTime()<=scheduledAt.getTime())");
    expect(broadcast).toContain('status:"scheduled" as const');
    expect(broadcast).toContain('const nextStatus=scheduledAt&&scheduledAt.getTime()>now.getTime()?"scheduled":"published"');
  });

  it("processes due and expired campaigns while counting persisted outcomes", () => {
    const start = db.indexOf("export async function processNotificationCampaignLifecycle()");
    const end = db.indexOf("export async function listAdminNotificationCampaigns()", start);
    const lifecycle = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(lifecycle).toContain('inArray(notificationCampaigns.status,["draft","scheduled","published","failed"])');
    expect(lifecycle).toContain('set({status:"expired"})');
    expect(lifecycle).toContain('inArray(notificationCampaigns.status,["draft","scheduled","published","failed"])');
    expect(lifecycle).toContain("broadcastCustomerNotification(campaign.createdBy");
    expect(lifecycle).toContain('eq(notificationCampaigns.status,"scheduled"),lte(notificationCampaigns.scheduledAt,now)');
    expect(lifecycle).toContain('if(result.status==="published") published++');
    expect(lifecycle).toContain('else if(result.status==="expired") expiredDuringPublish++');
    expect(lifecycle).toContain("let expiredCount=0");
    expect(lifecycle).toContain("const changed=await db.transaction(async tx=>");
    expect(lifecycle).toContain("if(Number(result[0]?.affectedRows||0)===0)return false;");
    expect(lifecycle).toContain("if(changed)expiredCount++");
    expect(lifecycle).toContain("await tx.update(notificationCampaignDeliveries).set({status:\"expired\"})");
    expect(lifecycle).toContain("return {expired:expiredCount+expiredDuringPublish,published,failed}");
  });

  it("withdraws campaigns transactionally, preserves terminal delivery states, and records an audit event", () => {
    const start = db.indexOf("export async function withdrawNotificationCampaign(");
    const end = db.indexOf("export async function processNotificationCampaignLifecycle()", start);
    const withdrawal = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(withdrawal).toContain("return db.transaction(async tx=>");
    expect(withdrawal).toContain('.for("update")');
    expect(withdrawal).toContain('actor.role!=="admin"');
    expect(withdrawal).toContain('set({status:"withdrawn",errorCode:"CAMPAIGN_WITHDRAWN"})');
    expect(withdrawal).toContain('action:"notification.campaign.withdrawn"');
    expect(withdrawal).toContain('status==="withdrawn"');
    expect(withdrawal).toContain('status==="expired"');
  });

  it("reports announcement delivery and read counts from persisted delivery states", () => {
    const start = db.indexOf("export async function listAdminNotificationCampaigns()");
    const end = db.indexOf("export async function ", start + 30);
    const history = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(history).toContain("notificationCampaignDeliveries.status");
    expect(history).toContain('summary.read+=count');
    expect(history).toContain('summary.failed+=count');
    expect(history).toContain('summary.pending+=count');
  });
});



describe("authenticated support lifecycle persistence contracts", () => {
  const routers = readFileSync(new URL("../../server/routers.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../../server/db.ts", import.meta.url), "utf8");

  it("persists ticket and opening message atomically before best-effort notifications", () => {
    const start = db.indexOf("export async function createTicket(");
    const end = db.indexOf("export async function listCustomerTickets(", start);
    const create = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(create).toContain("await db.transaction(async tx=>");
    expect(create).toContain("await tx.insert(supportTickets).values(");
    expect(create).toContain("await tx.insert(supportMessages).values(");
    expect(create.indexOf("await db.transaction(async tx=>")).toBeLessThan(create.indexOf("await Promise.allSettled("));
    expect(create).toContain("support-ticket-created:");
  });

  it("locks ticket assignment, validates administrator roles, and audits changed assignments", () => {
    const start = db.indexOf("export async function assignSupportTicket(");
    const end = db.indexOf("export async function getCustomerTicket(", start);
    const assignment = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(assignment).toContain("const committed=await db.transaction(async tx=>");
    expect(assignment).toContain('.for("update")');
    expect(assignment).toContain('actor.role!=="admin"');
    expect(assignment).toContain('eq(users.role,"admin")');
    expect(assignment).toContain('action:assignedAdminId===null?"support.ticket.unassigned":"support.ticket.assigned"');
    expect(assignment).toContain("if(committed.changed&&committed.assignee)");
  });

  it("authorizes ticket replies against ownership and commits message/status together", () => {
    const start = db.indexOf("export async function addTicketMessage(");
    const end = db.indexOf("export async function reopenSupportTicket(", start);
    const reply = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(reply).toContain("const committed=await db.transaction(async tx=>");
    expect(reply).toContain('if(!isAdmin && ticket.customerId!==actorId)');
    expect(reply).toContain('ticket.status==="closed" || ticket.status==="resolved"');
    expect(reply).toContain("await tx.insert(supportMessages).values(");
    expect(reply).toContain("await tx.update(supportTickets).set({status:nextStatus,updatedAt:new Date()})");
    expect(reply).toContain("Notifications are deliberately post-commit and best-effort");
  });

  it("guards concurrent ticket reopen transitions and uses protected customer routes", () => {
    const start = db.indexOf("export async function reopenSupportTicket(");
    const end = db.indexOf("export async function listTicketMessages(", start);
    const reopen = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(reopen).toContain('or(eq(supportTickets.status,"closed"),eq(supportTickets.status,"resolved"))');
    expect(reopen).toContain("if(affected!==1)");
    expect(routers).toContain("createTicket: protectedProcedure");
    expect(routers).toContain("replyTicket: protectedProcedure");
    expect(routers).toContain("reopenTicket: protectedProcedure");
    expect(routers).toContain("if (!(await getCustomerTicket(ctx.user.id,input.ticketId)))");
  });

  it("validates attachment storage keys and scopes ticket attachments to an authorized customer", () => {
    const start = routers.indexOf("addAttachment: protectedProcedure");
    const end = routers.indexOf("uploadPolicy: protectedProcedure", start);
    const route = routers.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(route).toContain("isValidSupportAttachmentStorageKey(input.storageKey)");
    expect(db).toContain("export async function addTicketAttachment(");
    expect(db).toContain("You do not have access to this ticket");
    expect(db).toContain("isSupportAttachmentStorageKeyForTicket(input.storageKey,input.ticketId)");
  });
});



describe("administrator support and announcement route contracts", () => {
  const routers = readFileSync(new URL("../../server/routers.ts", import.meta.url), "utf8");

  it("keeps support administration endpoints behind administrator authorization", () => {
    const adminStart = routers.indexOf("    tickets: adminProcedure.query(() => listAllTickets())");
    const adminEnd = routers.indexOf("  // TODO: add feature routers here", adminStart);
    const adminSupport = routers.slice(adminStart, adminEnd);
    expect(adminStart).toBeGreaterThanOrEqual(0);
    expect(adminEnd).toBeGreaterThan(adminStart);
    expect(adminSupport).toContain("tickets: adminProcedure");
    expect(adminSupport).toContain("supportAssignees: adminProcedure");
    expect(adminSupport).toContain("assignTicket: adminProcedure");
    expect(adminSupport).toContain("ticketMessages: adminProcedure");
    expect(adminSupport).toContain("ticketAttachments: adminProcedure");
    expect(adminSupport).toContain("replyTicket: adminProcedure");
    expect(adminSupport).toContain("reopenTicket: adminProcedure");
    expect(adminSupport).toContain("getSupportTicketById(input.ticketId)");
  });

  it("validates announcement lifecycle mutations at the administrator route boundary", () => {
    const start = routers.indexOf("    publishAnnouncement: adminProcedure");
    const end = routers.indexOf("    miningDashboard:", start);
    const announcements = routers.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(announcements).toContain("publishAnnouncement: adminProcedure");
    expect(announcements).toContain("scheduledAt:z.string().datetime().optional()");
    expect(announcements).toContain("expiresAt:z.string().datetime().optional()");
    expect(announcements).toContain("announcementHistory: adminProcedure");
    expect(announcements).toContain("retryAnnouncement: adminProcedure");
    expect(announcements).toContain("withdrawAnnouncement: adminProcedure");
  });

  it("protects customer notification reads and announcement delivery from untrusted route access", () => {
    const customerStart = routers.indexOf("    createTicket: protectedProcedure");
    const customerEnd = routers.indexOf("    balances: protectedProcedure", customerStart);
    const customerRoutes = routers.slice(customerStart, customerEnd);
    expect(customerStart).toBeGreaterThanOrEqual(0);
    expect(customerEnd).toBeGreaterThan(customerStart);
    expect(customerRoutes).toContain("tickets: protectedProcedure");
    expect(customerRoutes).toContain("ticketMessages: protectedProcedure");
    expect(customerRoutes).toContain("ticketAttachments: protectedProcedure");
    expect(customerRoutes).toContain("addAttachment: protectedProcedure");
    expect(customerRoutes).toContain("if (!(await getCustomerTicket(ctx.user.id,input.ticketId)))");
  });
});
