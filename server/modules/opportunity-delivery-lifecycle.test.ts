import { describe, expect, it } from "vitest";
import {
  acknowledgeDelivery,
  claimDeliveryDispatch,
  countPendingDeliveries,
  countPendingDeliveriesForPackage,
  deliveryAdmissionLockKey,
  DELIVERY_FINANCIAL_EFFECTS,
  deliveryIdempotencyKey,
  failDeliveryAttempt,
  type DeliveryRetrySchedule,
  type DeliveryState,
  validateDeliveryRetrySchedule,
} from "./opportunity-delivery-lifecycle";

const now = new Date("2026-11-03T12:00:00.000Z");
const openUntil = new Date("2026-11-03T13:00:00.000Z");
const base: DeliveryState = {
  deliveryStatus: "queued",
  deliveryAttemptCount: 0,
  deliveryRetryAfter: null,
  deliveryLeaseToken: null,
  eventStatus: "DELIVERED",
};
const none: DeliveryRetrySchedule = { policy: "none", maxAttempts: 1, intervalsSeconds: [], configured: false };
const temporary: DeliveryRetrySchedule = { policy: "temporary", maxAttempts: 3, intervalsSeconds: [30, 90], configured: true };
const claim = (state: DeliveryState, schedule = temporary, token = "claim-a", at = now) => claimDeliveryDispatch({
  state, now: at, leaseToken: token, offerOpen: true, offerClosesAt: openUntil, retrySchedule: schedule,
});

describe("durable opportunity delivery lifecycle", () => {
  it("uses only queued, in_progress and retry_wait as pending truth", () => {
    const statuses = ["queued", "in_progress", "retry_wait", "failed", "dismissed", "expired", "delivered", "received", "rendered"];
    expect(countPendingDeliveries(statuses.map(deliveryStatus => ({ deliveryStatus })))).toBe(3);
    const renamed = [
      { userId: 9, packageId: 4, packageName: "Old display label", deliveryStatus: "queued" },
      { userId: 9, packageId: 4, packageName: "Renamed label", deliveryStatus: "retry_wait" },
      { userId: 9, packageId: 5, packageName: "Old display label", deliveryStatus: "in_progress" },
    ];
    expect(countPendingDeliveriesForPackage(renamed, 9, 4)).toBe(2);
    expect(deliveryAdmissionLockKey(9, 4)).toBe(deliveryAdmissionLockKey(9, 4));
    expect(deliveryAdmissionLockKey(9, 4)).not.toBe(deliveryAdmissionLockKey(9, 5));
  });

  it("counts first actual dispatch as attempt one and never claims attempt max+1", () => {
    const first = claim(base, temporary);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    expect(first.state.deliveryAttemptCount).toBe(1);
    const failed1 = failDeliveryAttempt({ state: first.state, now, errorCode: "TEMP", retrySchedule: temporary });
    expect(failed1.state.deliveryStatus).toBe("retry_wait");
    const second = claim(failed1.state, temporary, "claim-b", failed1.retryAt!);
    expect(second.claimed).toBe(true);
    if (!second.claimed) return;
    expect(second.state.deliveryAttemptCount).toBe(2);
    const failed2 = failDeliveryAttempt({ state: second.state, now: failed1.retryAt!, errorCode: "TEMP", retrySchedule: temporary });
    const third = claim(failed2.state, temporary, "claim-c", failed2.retryAt!);
    expect(third.claimed).toBe(true);
    if (!third.claimed) return;
    expect(third.state.deliveryAttemptCount).toBe(3);
    const exhausted = failDeliveryAttempt({ state: third.state, now: failed2.retryAt!, errorCode: "TEMP", retrySchedule: temporary });
    expect(exhausted.state.deliveryStatus).toBe("failed");
    expect(claim(exhausted.state, temporary).claimed).toBe(false);
  });

  it("requires exactly one saved delay per retry and uses the configured sequence only", () => {
    expect(validateDeliveryRetrySchedule(temporary)).toBeNull();
    expect(validateDeliveryRetrySchedule({ ...temporary, intervalsSeconds: [30] })).toContain("exactly one interval");
    expect(validateDeliveryRetrySchedule({ ...none, intervalsSeconds: [30] })).toContain("cannot include");
    expect(validateDeliveryRetrySchedule({ ...none, maxAttempts: 2 })).toContain("exactly one initial");
    expect(validateDeliveryRetrySchedule({ ...temporary, maxAttempts: 1, intervalsSeconds: [] })).toContain("2 to 20");
    expect(validateDeliveryRetrySchedule({ ...temporary, intervalsSeconds: [4, 90] })).toContain("5 to 3,600");
    expect(validateDeliveryRetrySchedule({ ...temporary, intervalsSeconds: [30, 3601] })).toContain("5 to 3,600");
    expect(failDeliveryAttempt({ state: { ...base, deliveryStatus: "in_progress", deliveryAttemptCount: 1 }, now, errorCode: "TEMP", retrySchedule: none }).state.deliveryStatus).toBe("failed");
    expect(failDeliveryAttempt({ state: { ...base, deliveryStatus: "in_progress", deliveryAttemptCount: 1 }, now, errorCode: "TEMP", retrySchedule: { ...temporary, configured: false } }).state.deliveryStatus).toBe("failed");
    const result = failDeliveryAttempt({ state: { ...base, deliveryStatus: "in_progress", deliveryAttemptCount: 1 }, now, errorCode: "TEMP", retrySchedule: temporary });
    expect(result.retryAt?.getTime()).toBe(now.getTime() + 30_000);
  });

  it("guards dismiss/expire/failed terminal states and refuses closed or expired offers", () => {
    for (const deliveryStatus of ["failed", "dismissed", "expired"] as const) {
      expect(claim({ ...base, deliveryStatus }, temporary).claimed).toBe(false);
      expect(acknowledgeDelivery({ state: { ...base, deliveryStatus }, status: "received" }).changed).toBe(false);
    }
    expect(claim(base, temporary, "claim", now).claimed).toBe(true);
    expect(claimDeliveryDispatch({ state: base, now, leaseToken: "x", offerOpen: false, offerClosesAt: openUntil, retrySchedule: temporary })).toMatchObject({ claimed: false, reason: "offer-closed" });
    expect(claimDeliveryDispatch({ state: base, now, leaseToken: "x", offerOpen: true, offerClosesAt: now, retrySchedule: temporary })).toMatchObject({ claimed: false, reason: "offer-closed" });
  });

  it("keeps idempotency stable across quota-day rollover and detail retention", () => {
    expect(deliveryIdempotencyKey(19, 41)).toBe(deliveryIdempotencyKey(19, 41));
    expect(deliveryIdempotencyKey(19, 41)).not.toContain("2026-11-03");
    expect(deliveryIdempotencyKey(19, 41)).not.toBe(deliveryIdempotencyKey(19, 42));
  });

  it("fences stale acknowledgements by claim token and ignores terminal transitions", () => {
    const first = claim(base, temporary, "fresh-token");
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    expect(acknowledgeDelivery({ state: first.state, status: "received", leaseToken: "stale-token" }).changed).toBe(false);
    const received = acknowledgeDelivery({ state: first.state, status: "received", leaseToken: "fresh-token" });
    expect(received).toMatchObject({ changed: true, state: { deliveryStatus: "received", deliveryLeaseToken: "fresh-token" } });
    expect(acknowledgeDelivery({ state: received.state, status: "rendered", leaseToken: "fresh-token" })).toMatchObject({ changed: true, state: { deliveryStatus: "rendered", deliveryLeaseToken: null } });
    expect(acknowledgeDelivery({ state: first.state, status: "received" }).changed).toBe(false);
    const dismissed = acknowledgeDelivery({ state: first.state, status: "dismissed", leaseToken: "fresh-token" });
    expect(acknowledgeDelivery({ state: dismissed.state, status: "received" }).changed).toBe(false);
  });

  it("retries a render failure reported after the received acknowledgement", () => {
    const first = claim(base, temporary, "received-lease");
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    const received = acknowledgeDelivery({ state: first.state, status: "received", leaseToken: "received-lease" });
    expect(received.state.deliveryStatus).toBe("received");
    const failedRender = failDeliveryAttempt({
      state: received.state,
      now,
      errorCode: "POPUP_RENDER_FAILED",
      retrySchedule: temporary,
    });
    expect(failedRender).toMatchObject({
      terminal: false,
      state: { deliveryStatus: "retry_wait", deliveryLeaseToken: null },
    });
    expect(failedRender.retryAt?.getTime()).toBe(now.getTime() + 30_000);
    expect(claim(failedRender.state, temporary, "retry-lease", failedRender.retryAt!).claimed).toBe(true);
  });

  it("does not retry permanent failures after received acknowledgement", () => {
    const first = claim(base, temporary, "received-lease");
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    const received = acknowledgeDelivery({ state: first.state, status: "received", leaseToken: "received-lease" });
    const failedRender = failDeliveryAttempt({
      state: received.state,
      now,
      errorCode: "PERMANENT_INVALID_POPUP",
      retrySchedule: temporary,
      permanent: true,
    });
    expect(failedRender).toMatchObject({
      terminal: true,
      retryAt: null,
      state: { deliveryStatus: "failed", deliveryLeaseToken: null },
    });
  });

  it("has no wallet, ledger or trade effects", () => {
    expect(DELIVERY_FINANCIAL_EFFECTS).toBe(false);
    const retry = failDeliveryAttempt({ state: { ...base, deliveryStatus: "in_progress", deliveryAttemptCount: 1 }, now, errorCode: "TEMP", retrySchedule: temporary });
    expect(retry.state).not.toHaveProperty("wallet");
    expect(retry.state).not.toHaveProperty("ledger");
    expect(retry.state).not.toHaveProperty("trade");
  });
});
