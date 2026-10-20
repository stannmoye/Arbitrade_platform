export const NOTIFICATION_CATEGORIES = [
  "account",
  "transaction",
  "deposit",
  "withdrawal",
  "ledger_credit",
  "ledger_debit",
  "trading",
  "mining",
  "support",
  "announcement",
  "promotion",
  "platform_update",
  "security",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export function buildNotificationEventKey(userId: number, eventKey?: string | null): string | null {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new RangeError("Notification recipient must be a positive integer user ID");
  }
  if (eventKey == null || eventKey.trim() === "") return null;
  const normalized = eventKey.trim();
  // Prefixing with the recipient makes the key globally unique without allowing
  // one user's event to suppress another user's notification.
  const scoped = `u${userId}:${normalized}`;
  if (scoped.length > 180) {
    throw new RangeError("Notification event key must fit within 180 characters after recipient scoping");
  }
  return scoped;
}

export function normalizeNotificationText(value: string, maxLength: number, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`Notification ${field} cannot be empty`);
  if (normalized.length > maxLength) throw new RangeError(`Notification ${field} exceeds ${maxLength} characters`);
  return normalized;
}

export function filterNotificationCategories<T extends { category?: string | null }>(
  rows: T[],
  visibility: Partial<Record<NotificationCategory, boolean>>,
): T[] {
  // Unknown categories remain visible rather than silently hiding new event types.
  return rows.filter(row => {
    const category = row.category;
    return !category || !(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)
      || visibility[category as NotificationCategory] !== false;
  });
}

