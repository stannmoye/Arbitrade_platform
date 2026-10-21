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

  it("does not present customer deposit submission or withdrawal initiation as confirmed payout", () => {
    expect(app).toContain("Mock provider flow available for testing");
    expect(app).toContain("Blocked until custody and execution providers are configured");
    expect(app).not.toContain("Deposit completed successfully");
    expect(app).not.toContain("Withdrawal paid successfully");
  });
});
