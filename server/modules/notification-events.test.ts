import { describe, expect, it } from "vitest";
import { assertNotificationPayloadMatches, buildNotificationEventKey, buildTradeSettlementNotices, filterNotificationCategories, filterVisibleNotificationEventCursor, NOTIFICATION_CATEGORIES, normalizeBroadcastTargetUserId, normalizeNotificationHref, normalizeNotificationText, partitionNotificationRecipients } from "./notification-events";

describe("admin broadcast recipient validation", () => {
  it("distinguishes a valid single-customer target from an explicit all-customer broadcast", () => {
    expect(normalizeBroadcastTargetUserId(undefined)).toBeNull();
    expect(normalizeBroadcastTargetUserId(null)).toBeNull();
    expect(normalizeBroadcastTargetUserId(42)).toBe(42);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid customer target %s instead of broadening the broadcast",
    target => expect(() => normalizeBroadcastTargetUserId(target)).toThrow(RangeError),
  );
});

describe("bounded notification fan-out", () => {
  it("partitions recipient IDs in order and keeps each batch within the configured limit", () => {
    expect(partitionNotificationRecipients([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(partitionNotificationRecipients([], 2)).toEqual([]);
  });

  it.each([0, -1, 1.5, 501, Number.NaN])("rejects unsafe batch size %s", size => {
    expect(() => partitionNotificationRecipients([1], size)).toThrow(RangeError);
  });
});

describe("notification event identity", () => {
  it("scopes event keys to the recipient", () => {
    expect(buildNotificationEventKey(12, "ledger:123")).toBe("u12:ledger:123");
    expect(buildNotificationEventKey(13, "ledger:123")).toBe("u13:ledger:123");
  });

  it("allows unkeyed notifications to remain non-deduplicated", () => {
    expect(buildNotificationEventKey(12)).toBeNull();
    expect(buildNotificationEventKey(12, "  ")).toBeNull();
  });

  it("rejects invalid recipients and keys that could be truncated into collisions", () => {
    expect(() => buildNotificationEventKey(0, "event")).toThrow(RangeError);
    expect(() => buildNotificationEventKey(12, "x".repeat(180))).toThrow(RangeError);
  });

  it("normalizes and bounds user-facing text", () => {
    expect(normalizeNotificationText("  Wallet credited  ", 200, "title")).toBe("Wallet credited");
    expect(() => normalizeNotificationText("  ", 200, "title")).toThrow(TypeError);
    expect(() => normalizeNotificationText("x".repeat(201), 200, "title")).toThrow(RangeError);
  });
});


describe("notification category visibility", () => {
  it("covers the customer-facing event types independently", () => {
    expect(NOTIFICATION_CATEGORIES).toEqual(expect.arrayContaining([
      "announcement", "support", "platform_update", "promotion", "deposit",
      "withdrawal", "ledger_credit", "ledger_debit", "mining", "mining_reward", "trading", "trading_reward",
    ]));
    expect(new Set(NOTIFICATION_CATEGORIES).size).toBe(NOTIFICATION_CATEGORIES.length);
  });

  it("hides only disabled categories while retaining records for later re-enabling", () => {
    const rows = [
      { id: 1, category: "mining" },
      { id: 2, category: "deposit" },
      { id: 3, category: "announcement" },
      { id: 4, category: "future_category" },
    ];
    const visible = filterNotificationCategories(rows, { mining: false, deposit: false });
    expect(visible.map(row => row.id)).toEqual([3, 4]);
    expect(rows).toHaveLength(4);
    expect(filterNotificationCategories(rows, {}).map(row => row.id)).toEqual([1, 2, 3, 4]);
  });

  it("applies identical visibility rules to inbox rows and live event cursors", () => {
    const rows = [
      { id: 1, category: "mining" },
      { id: 2, category: "deposit" },
      { id: 3, category: "announcement" },
      { id: 4, category: null },
      { id: 5, category: "future_category" },
      { id: 6 },
    ];
    const visibility = { mining: false, deposit: false } as const;
    expect(filterVisibleNotificationEventCursor(rows, visibility)).toEqual(filterNotificationCategories(rows, visibility));
    expect(filterVisibleNotificationEventCursor(rows, visibility).map(row => row.id)).toEqual([3, 4, 5, 6]);
  });

  it("re-enables previously hidden cursor events when category visibility changes", () => {
    const rows = [{ id: 1, category: "mining" }, { id: 2, category: "deposit" }];
    expect(filterVisibleNotificationEventCursor(rows, { mining: false, deposit: false })).toEqual([]);
    expect(filterVisibleNotificationEventCursor(rows, { mining: true, deposit: true })).toEqual(rows);
  });
});


describe("trade settlement notification categories", () => {
  it("separates principal credits from actual trading rewards", () => {
    const notices = buildTradeSettlementNotices({ tradeId: 41, currency: "usd", principalMinor: 10000, rewardMinor: 250 });
    expect(notices.map(notice => notice.category)).toEqual(["ledger_credit", "trading_reward"]);
    expect(notices.map(notice => notice.eventKey)).toEqual(["trade-settlement:41:principal", "trade-settlement:41:reward"]);
    expect(notices[1].title).toBe("Net trading profit credited");
    expect(notices[2].title).toBe("Trading platform fee recorded");
  });

  it("does not create a reward or fee notification for zero profit", () => {
    const notices = buildTradeSettlementNotices({ tradeId: 42, currency: "EUR", principalMinor: 10000, rewardMinor: 0, grossProfitMinor: 0, platformFeeMinor: 0, netProfitMinor: 0 });
    expect(notices).toHaveLength(1);
    expect(notices[0].category).toBe("ledger_credit");
  });

  it("notifies a genuine loss without a profit fee or profit-credit notice", () => {
    const notices = buildTradeSettlementNotices({ tradeId: 43, currency: "EUR", principalMinor: 10000, rewardMinor: 0, grossProfitMinor: -250, platformFeeMinor: 0, netProfitMinor: -250, outcome: "loss" });
    expect(notices.map(notice => notice.eventKey)).toEqual(["trade-settlement:43:principal", "trade-settlement:43:loss"]);
    expect(notices[1].title).toBe("Trading loss recorded");
  });

  it("rejects invalid settlement identities or amounts", () => {
    expect(() => buildTradeSettlementNotices({ tradeId: 0, currency: "USD", principalMinor: 1, rewardMinor: 0 })).toThrow(RangeError);
    expect(() => buildTradeSettlementNotices({ tradeId: 1, currency: "USD", principalMinor: -1, rewardMinor: 0 })).toThrow(RangeError);
  });
});


describe("notification event-key payload consistency", () => {
  const payload = {
    userId: 12,
    title: "Wallet credited",
    body: "Your wallet was credited after the transaction committed.",
    category: "ledger_credit",
    priority: "normal",
    href: "/customer/wallet",
  };

  it("accepts an idempotent retry only when every durable payload field matches", () => {
    expect(() => assertNotificationPayloadMatches({ ...payload }, { ...payload })).not.toThrow();
  });

  it.each(["userId", "title", "body", "category", "priority", "href"] as const)(
    "rejects a reused event key when %s changes",
    field => {
      const changed = { ...payload, [field]: field === "userId" ? 13 : `changed-${field}` };
      expect(() => assertNotificationPayloadMatches(payload, changed)).toThrow(
        "Notification event key was already used with a different payload",
      );
    },
  );
});


describe("notification navigation links", () => {
  it("accepts same-origin paths and normalizes empty values", () => {
    expect(normalizeNotificationHref("  /customer/notifications?id=3  ")).toBe("/customer/notifications?id=3");
    expect(normalizeNotificationHref(undefined)).toBeNull();
    expect(normalizeNotificationHref("   ")).toBeNull();
  });

  it.each([
    "https://example.com",
    "//example.com/path",
    "/%2fexample.com",
    "/\\example.com",
    "/safe%5c..%5cpath",
    "/path\u0000bad",
    "/path%0aInjected: value",
    "/path%00hidden",
    "/path%09tab",
    "/path%1fseparator",
    "/path%7fdelete",
    "/path%0Bvertical-tab",
  ])("rejects unsafe link %s", href => {
    expect(() => normalizeNotificationHref(href)).toThrow(TypeError);
  });
});
