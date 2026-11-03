import { validateDeliveryRetrySchedule, type DeliveryRetryPolicy, type DeliveryRetrySchedule } from "./opportunity-delivery-lifecycle";

export const DELIVERY_RETRY_POLICY_SETTING_KEY = "trade.deliveryRetryPolicy";
export type PersistedDeliveryRetryPolicy = DeliveryRetrySchedule & {
  version: number;
  effectiveAt: string | null;
  updatedBy: number | null;
  updatedAt: string | null;
  reason: string;
};

export const FAIL_CLOSED_DELIVERY_RETRY_POLICY: PersistedDeliveryRetryPolicy = {
  policy: "none", maxAttempts: 1, intervalsSeconds: [], version: 1,
  effectiveAt: null, updatedBy: null, updatedAt: null,
  reason: "Initial fail-closed delivery retry policy; explicit intervals have not been saved.",
  configured: false,
};

export function canReplaceDeliveryRetryPolicy(current: PersistedDeliveryRetryPolicy, nextEffectiveAt: string, now: Date): boolean {
  const nextTime = Date.parse(nextEffectiveAt);
  if (!Number.isFinite(nextTime) || !Number.isFinite(now.getTime())) return false;
  const currentIsActive = current.configured && (!current.effectiveAt || Date.parse(current.effectiveAt) <= now.getTime());
  return !currentIsActive || nextTime <= now.getTime();
}
export function normalizeDeliveryRetryEffectiveAt(requestedAt: string, savedAt: Date): string {
  const requestedTime = Date.parse(requestedAt);
  if (!Number.isFinite(requestedTime) || !Number.isFinite(savedAt.getTime())) throw new Error("Effective time must be valid.");
  return new Date(requestedTime <= savedAt.getTime() ? savedAt.getTime() : requestedTime).toISOString();
}
export function parseDeliveryRetryPolicy(raw: unknown): PersistedDeliveryRetryPolicy | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const policy = value.policy as DeliveryRetryPolicy;
    if (policy !== "none" && policy !== "temporary") return null;
    if (!Number.isSafeInteger(value.maxAttempts) || !Array.isArray(value.intervalsSeconds) ||
        !value.intervalsSeconds.every(Number.isSafeInteger) || typeof value.configured !== "boolean") return null;
    const schedule: DeliveryRetrySchedule = {
      policy,
      maxAttempts: value.maxAttempts as number,
      intervalsSeconds: value.intervalsSeconds as number[],
      configured: value.configured,
    };
    if (validateDeliveryRetrySchedule(schedule)) return null;
    const version = Number(value.version);
    if (!Number.isSafeInteger(version) || version < 1) return null;
    const effectiveAt = value.effectiveAt === null ? null : typeof value.effectiveAt === "string" && Number.isFinite(Date.parse(value.effectiveAt)) && new Date(value.effectiveAt).toISOString() === value.effectiveAt ? value.effectiveAt : undefined;
    const updatedAt = value.updatedAt === null ? null : typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) && new Date(value.updatedAt).toISOString() === value.updatedAt ? value.updatedAt : undefined;
    if (effectiveAt === undefined || updatedAt === undefined) return null;
    const updatedBy = value.updatedBy === null ? null : Number(value.updatedBy);
    if (updatedBy !== null && (!Number.isSafeInteger(updatedBy) || updatedBy < 1)) return null;
    const reason = typeof value.reason === "string" ? value.reason.slice(0, 500) : "";
    return { ...schedule, version, effectiveAt, updatedBy, updatedAt, reason };
  } catch {
    return null;
  }
}

export function validateDeliveryRetryPolicyInput(input: {
  policy: DeliveryRetryPolicy;
  maxAttempts: number;
  intervalsSeconds: number[];
  effectiveAt: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("A 5–500 character administrator reason is required.");
  if (!Number.isFinite(Date.parse(input.effectiveAt)) || new Date(input.effectiveAt).toISOString() !== input.effectiveAt) {
    throw new Error("Effective time must be a valid ISO timestamp.");
  }
  const error = validateDeliveryRetrySchedule({ ...input, configured: true });
  if (error) throw new Error(error);
  return { ...input, reason };
}
