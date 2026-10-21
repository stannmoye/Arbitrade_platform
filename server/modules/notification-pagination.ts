export interface NotificationCursor {
  createdAt: Date;
  id: number;
}

export function normalizeNotificationPageSize(value: unknown, fallback = 50, maximum = 100): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

export function encodeNotificationCursor(createdAt: Date, id: number): string {
  const timestamp = createdAt.getTime();
  if (!Number.isFinite(timestamp) || !Number.isSafeInteger(id) || id < 1) {
    throw new RangeError("Invalid notification cursor values");
  }
  return Buffer.from(`${timestamp}:${id}`, "utf8").toString("base64url");
}

export function decodeNotificationCursor(value: unknown): NotificationCursor | null {
  if (typeof value !== "string" || value.length < 4 || value.length > 100 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const match = /^(0|[1-9]\d*):([1-9]\d*)$/.exec(decoded);
    if (!match) return null;
    const timestamp = Number(match[1]);
    const id = Number(match[2]);
    if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(id) || id < 1) return null;
    const createdAt = new Date(timestamp);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
