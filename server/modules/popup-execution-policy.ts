export type PopupExecutionEligibilityInput = {
  eventStatus: unknown;
  deliveryStatus: unknown;
  executionStatus: unknown;
};

/**
 * Presentation dismissal is deliberately not an execution cancellation.
 * A dismissed popup remains eligible for the server-owned automatic worker
 * while delivery succeeded and execution is explicitly READY or RETRYING. Unknown
 * states fail closed; RUNNING attempts must not be claimed a second time.
 */
export function isPopupExecutionEligible(input: PopupExecutionEligibilityInput): boolean {
  const eventStatus = String(input.eventStatus ?? "").toUpperCase();
  const deliveryStatus = String(input.deliveryStatus ?? "").toLowerCase();
  const executionStatus = String(input.executionStatus ?? "").toUpperCase();

  return ["DELIVERED", "NOTICED", "OPENED", "DISMISSED"].includes(eventStatus)
    && ["delivered", "received", "rendered"].includes(deliveryStatus)
    && ["READY", "RETRYING"].includes(executionStatus);
}
