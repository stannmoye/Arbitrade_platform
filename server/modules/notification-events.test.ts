import { describe, expect, it } from "vitest";
import { buildNotificationEventKey, filterNotificationCategories, NOTIFICATION_CATEGORIES, normalizeNotificationText } from "./notification-events";

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
      "withdrawal", "ledger_credit", "ledger_debit", "mining", "trading",
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
});
