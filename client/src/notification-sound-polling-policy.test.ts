import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_POLL_BASE_INTERVAL_MS,
  NOTIFICATION_POLL_MAX_INTERVAL_MS,
  notificationPollingInterval,
} from "./notification-polling-policy";

describe("notification polling recovery policy", () => {
  it("uses the normal short poll interval before failures and after recovery", () => {
    expect(notificationPollingInterval(0)).toBe(NOTIFICATION_POLL_BASE_INTERVAL_MS);
    expect(notificationPollingInterval(0)).toBe(5_000);
  });

  it("backs off repeated failures exponentially while retaining a bounded durable-history poll", () => {
    expect([1, 2, 3, 4, 5].map(notificationPollingInterval)).toEqual([
      10_000,
      20_000,
      40_000,
      NOTIFICATION_POLL_MAX_INTERVAL_MS,
      NOTIFICATION_POLL_MAX_INTERVAL_MS,
    ]);
  });

  it("normalizes malformed and negative failure counts safely", () => {
    for (const count of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(notificationPollingInterval(count)).toBe(NOTIFICATION_POLL_BASE_INTERVAL_MS);
    }
  });
});
