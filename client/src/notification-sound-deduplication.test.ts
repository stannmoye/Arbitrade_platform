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

});
