export type NotificationSoundEvent = {
  id: number;
  readAt?: unknown;
  category?: string | null;
  priority?: string | null;
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
  const seen = new Set([...previousIds, ...persistedIds]);
  const newlyObserved: T[] = [];
  for (const row of rows) {
    // Treat malformed IDs as non-events, and mark each accepted ID immediately
    // so duplicate rows in a cursor batch can never trigger duplicate sounds.
    if (!Number.isSafeInteger(row.id) || row.id <= 0 || seen.has(row.id) || row.readAt) continue;
    const category = row.category || "account";
    if (visibility?.[category] === false) continue;
    seen.add(row.id);
    newlyObserved.push(row);
  }
  return newlyObserved;
}


/** Select the most important notification in a polling batch for a single sound. */
export function selectMostImportantNotificationSoundEvent<T extends NotificationSoundEvent>(
  rows: readonly T[],
): T | null {
  const priorityRank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
  let selected: T | null = null;
  for (const row of rows) {
    if (!selected) {
      selected = row;
      continue;
    }
    const rank = (value?: string | null) => priorityRank[value || "normal"] ?? 1;
    const currentRank = rank(row.priority);
    const selectedRank = rank(selected.priority);
    if (currentRank > selectedRank || (currentRank === selectedRank && row.id > selected.id)) {
      selected = row;
    }
  }
  return selected;
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
