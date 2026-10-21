import { describe, expect, it } from "vitest";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  normalizeNotificationPageSize,
} from "./notification-pagination";

describe("notification history pagination", () => {
  it("round-trips the stable timestamp/id cursor", () => {
    const createdAt = new Date("2026-10-21T01:38:00.123Z");
    const cursor = encodeNotificationCursor(createdAt, 42);
    expect(decodeNotificationCursor(cursor)).toEqual({ createdAt, id: 42 });
  });

  it("rejects malformed, unsafe and oversized cursors", () => {
    for (const cursor of [undefined, null, "", "!!!!", "MTIzOm5hbg", "MTIzOjA", "OTAwNzE5OTI1NDc0MDk5MTox", "x".repeat(101)]) {
      expect(decodeNotificationCursor(cursor)).toBeNull();
    }
  });

  it("clamps page sizes and uses a safe default", () => {
    expect(normalizeNotificationPageSize(undefined)).toBe(50);
    expect(normalizeNotificationPageSize(0)).toBe(50);
    expect(normalizeNotificationPageSize(1.5)).toBe(50);
    expect(normalizeNotificationPageSize(25)).toBe(25);
    expect(normalizeNotificationPageSize(1000)).toBe(100);
  });
});
