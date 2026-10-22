import { describe, expect, it } from "vitest";
import {
  ADMIN_BROADCAST_CATEGORIES,
  assertNotificationPayloadMatches,
  buildNotificationEventKey,
  filterNotificationCategories,
  filterVisibleNotificationEventCursor,
  normalizeBroadcastTargetUserId,
  normalizeNotificationHref,
  normalizeNotificationText,
  partitionNotificationRecipients,
  buildTradeSettlementNotices,
} from "./notification-events";

describe("notification idempotency payload integrity", () => {
  const original = { userId: 7, title: "Maintenance", body: "Read-only window", category: "announcement", priority: "normal", href: "/notifications" };

  it("accepts a retry only when every persisted payload field matches", () => {
    expect(() => assertNotificationPayloadMatches({ ...original }, { ...original })).not.toThrow();
  });

  it.each([
    ["userId", 8],
    ["title", "Changed title"],
    ["body", "Changed body"],
    ["category", "promotion"],
    ["priority", "high"],
    ["href", "/different"],
  ] as const)("rejects a reused event key with changed %s", (field, value) => {
    const changed = { ...original, [field]: value } as typeof original;
    expect(() => assertNotificationPayloadMatches({ ...original }, changed)).toThrow(/different payload/);
  });

  it("treats null and empty links as distinct payloads", () => {
    expect(() => assertNotificationPayloadMatches({ ...original, href: null }, { ...original, href: "" }))
      .toThrow(/different payload/);
  });
});

describe("Stage 4 notification safety and delivery helpers", () => {
  it("restricts admin-authored broadcasts to non-financial communication categories", () => {
    expect(ADMIN_BROADCAST_CATEGORIES).toEqual(["announcement", "promotion", "platform_update"]);
    expect(ADMIN_BROADCAST_CATEGORIES).not.toContain("deposit");
    expect(ADMIN_BROADCAST_CATEGORIES).not.toContain("ledger_credit");
    expect(ADMIN_BROADCAST_CATEGORIES).not.toContain("trading_reward");
  });

  it("scopes idempotency keys by recipient and trims the event key", () => {
    expect(buildNotificationEventKey(17, "  ledger:42  ")).toBe("u17:ledger:42");
    expect(buildNotificationEventKey(18, "ledger:42")).toBe("u18:ledger:42");
    expect(buildNotificationEventKey(17, "  ")).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid notification recipient ID %s",
    userId => expect(() => buildNotificationEventKey(userId, "event")).toThrow(RangeError),
  );

  it("rejects an event key that exceeds the recipient-scoped database limit", () => {
    expect(() => buildNotificationEventKey(1, "x".repeat(178))).toThrow(/180 characters/);
  });

  it("normalizes Windows and legacy line endings without altering readable message text", () => {
    expect(normalizeNotificationText("  First line\r\nSecond line\rThird line  ", 100, "body"))
      .toBe("First line\nSecond line\nThird line");
  });

  it.each(["", "   ", "bad\u0000text", "bad\u0007text", "bad\u001ftext", "bad\u007ftext"])(
    "rejects empty or unsafe notification text %j",
    value => expect(() => normalizeNotificationText(value, 100, "body")).toThrow(),
  );

  it("keeps titles and event keys single-line while allowing body line breaks", () => {
    expect(() => normalizeNotificationText("subject\nforged", 100, "title")).toThrow(/single line/);
    expect(() => normalizeNotificationText("event\tkey", 100, "event key")).toThrow(/single line/);
    expect(normalizeNotificationText("line one\nline two", 100, "body")).toBe("line one\nline two");
  });

  it("allows multiline support replies while keeping ticket subjects single-line", () => {
    expect(normalizeNotificationText("  First paragraph\r\nSecond paragraph  ", 20000, "ticket message"))
      .toBe("First paragraph\nSecond paragraph");
    expect(() => normalizeNotificationText("Subject\nforged", 200, "ticket subject")).toThrow(/single line/);
  });

  it("rejects non-text runtime values and invalid length bounds", () => {
    expect(() => normalizeNotificationText(null as unknown as string, 100, "body")).toThrow(TypeError);
    expect(() => normalizeNotificationText("message", 0, "body")).toThrow(RangeError);
    expect(() => normalizeNotificationText("x".repeat(5), 4, "body")).toThrow(RangeError);
  });

  it.each([undefined, null, 0, -1, 1.25, Number.MAX_SAFE_INTEGER + 1])(
    "normalizes optional broadcast targets safely (%s)",
    target => {
      if (target == null) expect(normalizeBroadcastTargetUserId(target)).toBeNull();
      else expect(() => normalizeBroadcastTargetUserId(target)).toThrow(RangeError);
    },
  );

  it("keeps broadcast recipient batches ordered and bounded", () => {
    expect(partitionNotificationRecipients([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(partitionNotificationRecipients([], 2)).toEqual([]);
    expect(() => partitionNotificationRecipients([1], 0)).toThrow(RangeError);
    expect(() => partitionNotificationRecipients([1], 501)).toThrow(RangeError);
  });

  it("applies category visibility to sound cursors before they reach customer sessions", () => {
    const rows = [
      { id: 10, category: "deposit", readAt: null },
      { id: 11, category: "announcement", readAt: null },
      { id: 12, category: "future_category", readAt: null },
    ];
    expect(filterVisibleNotificationEventCursor(rows, { deposit: false }))
      .toEqual([rows[1], rows[2]]);
  });

  it("filters disabled categories but leaves unknown future categories visible", () => {
    const rows = [
      { id: 1, category: "deposit" },
      { id: 2, category: "support" },
      { id: 3, category: "future_category" },
      { id: 4, category: null },
    ];
    expect(filterNotificationCategories(rows, { deposit: false, support: true }))
      .toEqual([rows[1], rows[2], rows[3]]);
  });

  it.each([
    "https://example.com/path",
    "//example.com/path",
    "/\\\\example.com/path",
    "/%2f%2fevil.example",
    "/safe%00path",
    "/safe%09path",
    "/safe%7fpath",
    "/safe\\u0000path",
  ])("rejects unsafe notification navigation target %s", href => {
    expect(() => normalizeNotificationHref(href)).toThrow(TypeError);
  });

  it("accepts safe internal paths and maps empty hrefs to no link", () => {
    expect(normalizeNotificationHref("/notifications?filter=unread")).toBe("/notifications?filter=unread");
    expect(normalizeNotificationHref("  ")).toBeNull();
    expect(normalizeNotificationHref(undefined)).toBeNull();
  });

  it("creates a reward notice only when the settled reward is positive", () => {
    expect(buildTradeSettlementNotices({
      tradeId: 21, currency: "usd", principalMinor: 5000, rewardMinor: 0,
    })).toHaveLength(1);
    const notices = buildTradeSettlementNotices({
      tradeId: 21, currency: "usd", principalMinor: 5000, rewardMinor: 250,
    });
    expect(notices).toHaveLength(2);
    expect(notices[1]).toMatchObject({
      eventKey: "trade-settlement:21:reward",
      category: "trading_reward",
      priority: "high",
    });
  });

  it("accepts the exact maximum recipient-scoped event-key length", () => {
    const key = buildNotificationEventKey(1, "x".repeat(177));
    expect(key).toHaveLength(180);
    expect(key?.slice(0, 3)).toBe("u1:");
  });

  it("keeps equal event names independent across recipients even at the storage boundary", () => {
    const event = "x".repeat(177);
    const first = buildNotificationEventKey(1, event);
    const second = buildNotificationEventKey(2, event);
    expect(first).toHaveLength(180);
    expect(second).toHaveLength(180);
    expect(first).not.toBe(second);
  });

});
