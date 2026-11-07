export const PENDING_DELIVERY_STATUSES = ["queued", "in_progress", "retry_wait"] as const;
export type PendingDeliveryStatus = (typeof PENDING_DELIVERY_STATUSES)[number];
export type DeliveryStatus = PendingDeliveryStatus | "delivered" | "received" | "rendered" | "failed" | "dismissed" | "expired";
export type DeliveryRetryPolicy = "none" | "temporary";

export type DeliveryRetrySchedule = {
  policy: DeliveryRetryPolicy;
  maxAttempts: number;
  intervalsSeconds: number[];
  configured: boolean;
};

export type DeliveryState = {
  deliveryStatus: DeliveryStatus;
  deliveryAttemptCount: number;
  deliveryRetryAfter: Date | null;
  deliveryLeaseToken: string | null;
  eventStatus?: string;
};

export function isPendingDeliveryStatus(status: unknown): status is PendingDeliveryStatus {
  return (PENDING_DELIVERY_STATUSES as readonly unknown[]).includes(status);
}

export function countPendingDeliveries<T extends { deliveryStatus: string }>(rows: readonly T[]): number {
  return rows.reduce((count, row) => count + (isPendingDeliveryStatus(row.deliveryStatus) ? 1 : 0), 0);
}
export function deliveryAdmissionLockKey(userId: number, packageId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(packageId) || packageId < 1) {
    throw new RangeError("Delivery admission identity is invalid");
  }
  return `trading.deliveryAdmission.${userId}.${packageId}`;
}
export function countPendingDeliveriesForPackage<T extends { userId: number; packageId: number; deliveryStatus: string }>(rows: readonly T[], userId: number, packageId: number): number {
  return countPendingDeliveries(rows.filter(row => row.userId === userId && row.packageId === packageId));
}

export function validateDeliveryRetrySchedule(input: DeliveryRetrySchedule): string | null {
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20) {
    return "Maximum delivery attempts must be an integer from 1 to 20.";
  }
  if (!Array.isArray(input.intervalsSeconds) || input.intervalsSeconds.length > 19 ||
      input.intervalsSeconds.some(value => !Number.isSafeInteger(value) || value < 5 || value > 3600)) {
    return "Delivery retry intervals must be whole seconds from 5 to 3,600.";
  }
  if (input.policy === "none") {
    if (input.maxAttempts !== 1) return "Policy none requires exactly one initial dispatch attempt.";
    return input.intervalsSeconds.length === 0 ? null : "Policy none cannot include retry intervals.";
  }
  if (input.policy !== "temporary") return "Delivery retry policy is invalid.";
  if (input.maxAttempts < 2) return "Temporary delivery policy requires 2 to 20 total attempts.";
  if (input.intervalsSeconds.length !== input.maxAttempts - 1) {
    return "Temporary delivery policy requires exactly one interval for each retry.";
  }
  return null;
}

export function isTerminalDeliveryState(state: Pick<DeliveryState, "deliveryStatus" | "eventStatus">): boolean {
  return ["delivered", "rendered", "failed", "dismissed", "expired"].includes(state.deliveryStatus) || state.eventStatus === "DISMISSED";
}

export function claimDeliveryDispatch(input: {
  state: DeliveryState;
  now: Date;
  leaseToken: string;
  offerOpen: boolean;
  offerClosesAt: Date | null;
  retrySchedule: DeliveryRetrySchedule;
}): { claimed: true; state: DeliveryState } | { claimed: false; reason: "terminal" | "offer-closed" | "not-due" | "attempts-exhausted" | "retry-disabled" | "retry-unconfigured" } {
  const { state, now, retrySchedule } = input;
  if (isTerminalDeliveryState(state) || ["delivered", "received", "rendered"].includes(state.deliveryStatus)) {
    return { claimed: false, reason: "terminal" };
  }
  if (!input.offerOpen || !input.offerClosesAt || input.offerClosesAt.getTime() <= now.getTime()) {
    return { claimed: false, reason: "offer-closed" };
  }
  if (state.deliveryStatus === "in_progress") {
    if (retrySchedule.policy === "none") return { claimed: false, reason: "retry-disabled" };
    if (!retrySchedule.configured || validateDeliveryRetrySchedule(retrySchedule)) return { claimed: false, reason: "retry-unconfigured" };
    if (!state.deliveryRetryAfter || state.deliveryRetryAfter.getTime() > now.getTime()) return { claimed: false, reason: "not-due" };
  } else if (state.deliveryStatus === "retry_wait") {
    if (retrySchedule.policy === "none") return { claimed: false, reason: "retry-disabled" };
    if (!retrySchedule.configured || validateDeliveryRetrySchedule(retrySchedule)) return { claimed: false, reason: "retry-unconfigured" };
    if (!state.deliveryRetryAfter || state.deliveryRetryAfter.getTime() > now.getTime()) return { claimed: false, reason: "not-due" };
  } else if (state.deliveryStatus !== "queued") {
    return { claimed: false, reason: "terminal" };
  }
  if (state.deliveryAttemptCount >= retrySchedule.maxAttempts) {
    return { claimed: false, reason: "attempts-exhausted" };
  }
  return {
    claimed: true,
    state: {
      ...state,
      deliveryStatus: "in_progress",
      deliveryAttemptCount: state.deliveryAttemptCount + 1,
      deliveryRetryAfter: null,
      deliveryLeaseToken: input.leaseToken,
    },
  };
}

export function failDeliveryAttempt(input: {
  state: DeliveryState;
  now: Date;
  errorCode: string | null;
  retrySchedule: DeliveryRetrySchedule;
  permanent?: boolean;
}): { state: DeliveryState; retryAt: Date | null; terminal: boolean } {
  const { state, now, retrySchedule } = input;
  if (isTerminalDeliveryState(state) || state.deliveryStatus !== "in_progress") {
    return { state, retryAt: null, terminal: isTerminalDeliveryState(state) };
  }
  const validSchedule = validateDeliveryRetrySchedule(retrySchedule) === null;
  const canRetry = !input.permanent && retrySchedule.policy === "temporary" && retrySchedule.configured && validSchedule &&
    state.deliveryAttemptCount < retrySchedule.maxAttempts;
  if (!canRetry) {
    return {
      state: { ...state, deliveryStatus: "failed", deliveryRetryAfter: null, deliveryLeaseToken: null },
      retryAt: null,
      terminal: true,
    };
  }
  const delaySeconds = retrySchedule.intervalsSeconds[state.deliveryAttemptCount - 1];
  if (!Number.isSafeInteger(delaySeconds) || delaySeconds < 1) {
    return {
      state: { ...state, deliveryStatus: "failed", deliveryRetryAfter: null, deliveryLeaseToken: null },
      retryAt: null,
      terminal: true,
    };
  }
  const retryAt = new Date(now.getTime() + delaySeconds * 1000);
  if (!Number.isFinite(retryAt.getTime())) {
    return {
      state: { ...state, deliveryStatus: "failed", deliveryRetryAfter: null, deliveryLeaseToken: null },
      retryAt: null,
      terminal: true,
    };
  }
  return {
    state: { ...state, deliveryStatus: "retry_wait", deliveryRetryAfter: retryAt, deliveryLeaseToken: null },
    retryAt,
    terminal: false,
  };
}

export function acknowledgeDelivery(input: {
  state: DeliveryState;
  status: "received" | "rendered" | "dismissed";
  leaseToken?: string | null;
}): { state: DeliveryState; changed: boolean } {
  const { state } = input;
  if (isTerminalDeliveryState(state) || ["delivered", "rendered"].includes(state.deliveryStatus)) return { state, changed: false };
  if (!input.leaseToken || !state.deliveryLeaseToken || state.deliveryLeaseToken !== input.leaseToken) return { state, changed: false };
  if (input.status === "dismissed") {
    if (state.deliveryStatus !== "in_progress") return { state, changed: false };
    return { state: { ...state, deliveryStatus: "dismissed", deliveryRetryAfter: null, deliveryLeaseToken: null, eventStatus: "DISMISSED" }, changed: true };
  }
  if (input.status === "received") {
    if (state.deliveryStatus !== "in_progress") return { state, changed: false };
    // Keep the claim token so the same dispatch can acknowledge final rendering.
    return { state: { ...state, deliveryStatus: "received", deliveryRetryAfter: null }, changed: true };
  }
  if (state.deliveryStatus !== "in_progress" && state.deliveryStatus !== "received") return { state, changed: false };
  return { state: { ...state, deliveryStatus: "rendered", deliveryRetryAfter: null, deliveryLeaseToken: null }, changed: true };
}

/** Durable identity deliberately excludes quota day and detail-retention windows. */
export function deliveryIdempotencyKey(userId: number, offerId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(offerId) || offerId < 1) {
    throw new RangeError("Delivery idempotency identity is invalid");
  }
  return `${userId}:${offerId}`;
}

/** Delivery state transitions intentionally have no wallet, ledger, or trade side effects. */
export const DELIVERY_FINANCIAL_EFFECTS = false as const;
