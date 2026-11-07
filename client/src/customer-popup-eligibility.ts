const terminalEventStatuses = new Set(["DISMISSED", "EXPIRED", "FAILED", "WITHDRAWN", "TRADED", "SETTLED"]);
const deliverableStatuses = new Set(["delivered", "in_progress", "received", "rendered"]);

/**
 * The latest server feed, not a browser countdown, decides whether an alert
 * still owns the single-popup slot.
 */
export function isServerActiveCustomerPopupSlotOwner(offer: unknown): boolean {
  if (!offer || typeof offer !== "object") return false;
  const current = offer as Record<string, unknown>;
  if (String(current.offerStatus ?? "").trim().toLowerCase() !== "open") return false;
  if (String(current.expiryStatus ?? "").trim().toLowerCase() !== "active") return false;
  const eventStatus = String(current.eventStatus ?? "").trim().toUpperCase();
  const deliveryStatus = String(current.deliveryStatus ?? "").trim().toLowerCase();
  return !terminalEventStatuses.has(eventStatus) && !["dismissed", "expired"].includes(deliveryStatus);
}

/** A fresh alert must correspond to a still-open persisted event that reached delivery. */
export function isFreshCustomerPopupCandidate(offer: Record<string, unknown>, now = Date.now()): boolean {
  if (offer.popupEligible !== true) return false;
  const eventStatus = String(offer.eventStatus ?? "").trim().toUpperCase();
  const deliveryStatus = String(offer.deliveryStatus ?? "").trim().toLowerCase();
  if (terminalEventStatuses.has(eventStatus) || !["DELIVERED", "NOTICED", "OPENED"].includes(eventStatus)) return false;
  if (!deliverableStatuses.has(deliveryStatus)) return false;
  if (deliveryStatus === "in_progress" && (typeof offer.deliveryLeaseToken !== "string" || !offer.deliveryLeaseToken.trim())) return false;
  if (String(offer.offerStatus ?? "").trim().toLowerCase() !== "open") return false;
  const closesAt = new Date(offer.closesAt as string | Date).getTime();
  return Number.isFinite(closesAt) && closesAt > now;
}
