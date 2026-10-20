import { describe, expect, it } from "vitest";
import { findNewNotificationSoundEvents, mergeSeenNotificationIds } from "./notification-sound-deduplication";

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

  it("merges duplicate IDs and keeps only the newest bounded tail", () => {
    expect(mergeSeenNotificationIds([1, 2, 2], [2, 3, 4], 3)).toEqual([2, 3, 4]);
    expect(mergeSeenNotificationIds([], [1, -1, 1.5, Number.NaN, 2], 10)).toEqual([1, 2]);
  });

  it("rejects unsafe history bounds", () => {
    expect(() => mergeSeenNotificationIds([], [], 0)).toThrow(RangeError);
    expect(() => mergeSeenNotificationIds([], [], 5001)).toThrow(RangeError);
  });
});
