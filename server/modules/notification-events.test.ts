import { describe, expect, it } from "vitest";
import { buildNotificationEventKey, normalizeNotificationText } from "./notification-events";

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
