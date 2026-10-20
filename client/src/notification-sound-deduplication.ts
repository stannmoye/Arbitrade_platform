export type NotificationSoundEvent = {
  id: number;
  readAt?: unknown;
  category?: string | null;
};

/**
 * Return only newly observed, unread events that have not already triggered a
 * sound in this browser. Persisted IDs protect against polling-window churn and
 * reconnects where older rows re-enter the bounded event cursor.
 */
export function findNewNotificationSoundEvents<T extends NotificationSoundEvent>(
  rows: readonly T[],
  previousIds: readonly number[] | null,
  persistedIds: readonly number[],
  visibility: Record<string, boolean> | undefined,
): T[] {
  // Initial hydration must establish a baseline without playing historical sounds.
  if (previousIds === null) return [];
  const previous = new Set(previousIds);
  const persisted = new Set(persistedIds);
  return rows.filter((row) => {
    const category = row.category || "account";
    return !row.readAt
      && !previous.has(row.id)
      && !persisted.has(row.id)
      && visibility?.[category] !== false;
  });
}

/** Keep the browser-side deduplication ledger bounded and robust to bad storage data. */
export function mergeSeenNotificationIds(
  persistedIds: readonly number[],
  currentIds: readonly number[],
  maxEntries = 500,
): number[] {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 5000) {
    throw new RangeError("Notification sound history limit must be between 1 and 5000");
  }
  const valid = (id: number) => Number.isSafeInteger(id) && id > 0;
  // Event cursors are returned newest-first. Sort by the monotonic database ID
  // before taking the tail so a large cursor cannot accidentally retain only
  // the oldest notifications and forget the newest ones.
  return [...new Set([...persistedIds, ...currentIds].filter(valid))]
    .sort((left, right) => left - right)
    .slice(-maxEntries);
}
