export const NOTIFICATION_CATEGORIES = [
  "account",
  "transaction",
  "deposit",
  "withdrawal",
  "ledger_credit",
  "ledger_debit",
  "trading",
  "trading_reward",
  "mining",
  "mining_reward",
  "support",
  "announcement",
  "promotion",
  "platform_update",
  "security",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

// Admin-authored messages are communications, never synthetic financial events.
export const ADMIN_BROADCAST_CATEGORIES = ["announcement", "promotion", "platform_update"] as const;
export type AdminBroadcastCategory = (typeof ADMIN_BROADCAST_CATEGORIES)[number];

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

/** Normalize optional admin broadcast targeting without treating invalid IDs as "all customers". */
export function normalizeBroadcastTargetUserId(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Broadcast target must be a positive integer customer ID");
  }
  return value;
}

/** Split fan-out work into bounded batches to avoid unbounded concurrent writes. */
export function partitionNotificationRecipients<T>(items: readonly T[], batchSize = 50): T[][] {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError("Notification batch size must be an integer between 1 and 500");
  }
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    batches.push(items.slice(offset, offset + batchSize));
  }
  return batches;
}

export function normalizeNotificationText(value: string, maxLength: number, field: string): string {
  if (typeof value !== "string") throw new TypeError("Notification " + field + " must be text");
  // Normalize platform-specific line endings, while rejecting invisible control
  // bytes that can corrupt logs, confuse operators, or render inconsistently.
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new TypeError("Notification " + field + " cannot be empty");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new TypeError("Notification " + field + " contains unsupported control characters");
  }
  if (field !== "body" && field !== "ticket message" && /[\r\n\t]/.test(normalized)) {
    throw new TypeError("Notification " + field + " must be a single line");
  }
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new RangeError("Notification text limit must be a positive safe integer");
  if (normalized.length > maxLength) throw new RangeError("Notification " + field + " exceeds " + maxLength + " characters");
  return normalized;
}

export type NotificationPayloadIdentity = {
  userId: number;
  title: string;
  body: string;
  category: string | null;
  priority: string | null;
  href: string | null;
};

/** A reused event key may only acknowledge the exact same durable notification payload. */
export function assertNotificationPayloadMatches(
  existing: NotificationPayloadIdentity,
  expected: NotificationPayloadIdentity,
): void {
  const fields: (keyof NotificationPayloadIdentity)[] = ["userId", "title", "body", "category", "priority", "href"];
  if (fields.some(field => existing[field] !== expected[field])) {
    throw new Error("Notification event key was already used with a different payload");
  }
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


/** Filter sound/event cursors with the same server-owned visibility policy as the inbox. */
export function filterVisibleNotificationEventCursor<T extends { category?: string | null }>(
  rows: T[],
  visibility: Partial<Record<NotificationCategory, boolean>>,
): T[] {
  return filterNotificationCategories(rows, visibility);
}


export type TradeSettlementNotice = {
  title: string;
  body: string;
  eventKey: string;
  category: "ledger_credit" | "ledger_debit" | "trading_reward" | "trading";
  priority: "normal" | "high";
};

/** Build notices from committed principal, realized result, fee and net profit values. */
export function buildTradeSettlementNotices(input: {
  tradeId: number;
  currency: string;
  principalMinor: number;
  rewardMinor: number;
  grossProfitMinor?: number;
  platformFeeMinor?: number;
  netProfitMinor?: number;
  outcome?: string;
}): TradeSettlementNotice[] {
  if (!Number.isSafeInteger(input.tradeId) || input.tradeId <= 0) {
    throw new RangeError("Trade settlement requires a positive trade ID");
  }
  const grossProfitMinor=input.grossProfitMinor ?? input.rewardMinor;
  const platformFeeMinor=input.platformFeeMinor ?? 0;
  const netProfitMinor=input.netProfitMinor ?? input.rewardMinor;
  if (!Number.isSafeInteger(input.principalMinor) || input.principalMinor < 0 ||
      !Number.isSafeInteger(input.rewardMinor) || input.rewardMinor < 0 ||
      !Number.isSafeInteger(grossProfitMinor) ||
      !Number.isSafeInteger(platformFeeMinor) || platformFeeMinor < 0 ||
      !Number.isSafeInteger(netProfitMinor)) {
    throw new RangeError("Trade settlement amounts must be safe integers");
  }
  const currency = normalizeNotificationText(input.currency, 32, "currency").toUpperCase();
  const notices: TradeSettlementNotice[] = [{
    title: "Trade principal released",
    body: `Trade ${input.tradeId} principal was released to your ${currency} wallet after settlement.`,
    eventKey: `trade-settlement:${input.tradeId}:principal`,
    category: "ledger_credit",
    priority: "normal",
  }];
  if (netProfitMinor > 0) notices.push({
    title: "Net trading profit credited",
    body: `Trade ${input.tradeId} realized gross profit was ${grossProfitMinor} minor units, platform fee was ${platformFeeMinor}, and net profit of ${netProfitMinor} minor units was credited to your ${currency} wallet.`,
    eventKey: `trade-settlement:${input.tradeId}:reward`,
    category: "trading_reward",
    priority: "high",
  });
  if (platformFeeMinor > 0) notices.push({
    title: "Trading platform fee recorded",
    body: `Trade ${input.tradeId} platform fee of ${platformFeeMinor} minor units was deducted from realized gross profit.`,
    eventKey: `trade-settlement:${input.tradeId}:fee`,
    category: "ledger_debit",
    priority: "normal",
  });
  if (grossProfitMinor < 0) notices.push({
    title: "Trading loss recorded",
    body: `Trade ${input.tradeId} recorded a realized loss of ${Math.abs(grossProfitMinor)} minor units. No profit fee was charged.`,
    eventKey: `trade-settlement:${input.tradeId}:loss`,
    category: "ledger_debit",
    priority: "high",
  });
  return notices;
}


/** Only allow same-origin absolute paths for notification navigation. */
export function normalizeNotificationHref(value?: string | null): string | null {
  if (value == null) return null;
  const href = value.trim();
  if (!href) return null;
  // Reject protocol-relative URLs, backslashes (including encoded forms), and
  // literal or percent-encoded ASCII control characters. Different URL parsers,
  // proxies, and routers can normalize these characters differently.
  const hasEncodedControl = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(href);
  if (!href.startsWith("/") || /^\/(?:\/|%2f)/i.test(href) || href.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(href) || /%5c/i.test(href) || hasEncodedControl) {
    throw new TypeError("Notification link must be a safe internal path");
  }
  return href;
}
