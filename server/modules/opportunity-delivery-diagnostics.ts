export const DELIVERY_FAILURE_CATEGORIES = [
  "opportunity_generation_failure",
  "queue_insertion_failure",
  "worker_processing_failure",
  "customer_eligibility_failure",
  "company_approval_failure",
  "delivery_api_failure",
  "browser_acknowledgement_timeout",
  "popup_rendering_failure",
  "expiration_before_delivery",
  "unknown_or_unclassified",
] as const;

export type DeliveryFailureCategory = (typeof DELIVERY_FAILURE_CATEGORIES)[number];

export type DeliveryDiagnosticEventType =
  | "generated"
  | "queue_admission_skipped"
  | "queued"
  | "dispatch_claimed"
  | "delivery_attempted"
  | "retry_scheduled"
  | "browser_received"
  | "browser_acknowledged"
  | "popup_render_confirmed"
  | "noticed"
  | "opened"
  | "dismissed"
  | "withdrawn"
  | "traded"
  | "completed"
  | "expired"
  | "failed";

export function classifyDeliveryFailure(input: {
  errorCode?: string | null;
  assignmentStatus?: string | null;
  deliveryStatus?: string | null;
  isFailure?: boolean;
  receivedAt?: unknown;
  renderedAt?: unknown;
}): DeliveryFailureCategory | null {
  const code = String(input.errorCode || "").trim().toUpperCase();
  if (input.assignmentStatus === "failed" || code === "OPPORTUNITY_GENERATION_FAILED") return "opportunity_generation_failure";
  if (code === "QUEUE_INSERTION_FAILED") return "queue_insertion_failure";
  if (code === "CUSTOMER_ELIGIBILITY_REJECTED") return "customer_eligibility_failure";
  if (code === "COMPANY_APPROVAL_REJECTED") return "company_approval_failure";
  if (code === "DELIVERY_API_FAILED") return "delivery_api_failure";
  if (code === "POPUP_RENDER_FAILED") return "popup_rendering_failure";
  if (code === "OPPORTUNITY_EXPIRED") return input.receivedAt || input.renderedAt ? null : "expiration_before_delivery";
  if (code === "DELIVERY_LEASE_EXPIRED") return "browser_acknowledgement_timeout";
  if (["DELIVERY_ATTEMPTS_EXHAUSTED", "DELIVERY_DUPLICATE_LEGACY", "DELIVERY_PACKAGE_ID_UNRESOLVED"].includes(code)) return "worker_processing_failure";
  if (input.isFailure || input.deliveryStatus === "failed") return "unknown_or_unclassified";
  return null;
}

export function safeDeliveryDiagnosticMessage(errorCode?: string | null, context: { receivedAt?: unknown; renderedAt?: unknown } = {}): string | null {
  switch (String(errorCode || "").trim().toUpperCase()) {
    case "QUEUE_INSERTION_FAILED": return "The delivery record could not be persisted.";
    case "CUSTOMER_ELIGIBILITY_REJECTED": return "Delivery was blocked by an eligibility or approval check.";
    case "COMPANY_APPROVAL_REJECTED": return "The opportunity company was not approved for customer display.";
    case "DELIVERY_API_FAILED": return "A delivery request failed; no customer receipt is confirmed.";
    case "DELIVERY_LEASE_EXPIRED": return "The browser acknowledgement lease expired; the final customer-visible stage is unconfirmed.";
    case "DELIVERY_ATTEMPTS_EXHAUSTED": return "The configured delivery attempt limit was reached.";
    case "DELIVERY_DUPLICATE_LEGACY": return "A duplicate legacy delivery record was marked failed during migration.";
    case "DELIVERY_PACKAGE_ID_UNRESOLVED": return "The delivery package could not be resolved safely.";
    case "OPPORTUNITY_EXPIRED": return context.renderedAt
      ? "The opportunity expired after visible rendering was confirmed."
      : context.receivedAt
        ? "The opportunity expired after browser receipt; visible rendering was not confirmed."
        : "The opportunity expired before browser receipt was confirmed.";
    case "POPUP_RENDER_FAILED": return "The customer popup reported a render failure.";
    case "OPPORTUNITY_GENERATION_FAILED": return "Opportunity generation failed; inspect the linked generation batch record.";
    default: return errorCode ? "A delivery error was recorded; its detailed message is unavailable." : null;
  }
}

export type DeliveryDiagnosticCursor = { generatedAt: string; opportunityId: number };

export function encodeDeliveryDiagnosticCursor(cursor: DeliveryDiagnosticCursor): string {
  if (!Number.isSafeInteger(cursor.opportunityId) || cursor.opportunityId < 1 || !Number.isFinite(Date.parse(cursor.generatedAt))) {
    throw new RangeError("Delivery diagnostics cursor is invalid.");
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeDeliveryDiagnosticCursor(value?: string | null): DeliveryDiagnosticCursor | null {
  if (!value) return null;
  if (value.length > 240 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new RangeError("Delivery diagnostics cursor is invalid.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<DeliveryDiagnosticCursor>;
    if (!Number.isSafeInteger(parsed.opportunityId) || Number(parsed.opportunityId) < 1 || typeof parsed.generatedAt !== "string" || !Number.isFinite(Date.parse(parsed.generatedAt))) {
      throw new Error("invalid cursor fields");
    }
    return { generatedAt: new Date(parsed.generatedAt).toISOString(), opportunityId: Number(parsed.opportunityId) };
  } catch {
    throw new RangeError("Delivery diagnostics cursor is invalid.");
  }
}
