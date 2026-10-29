export type PopupExecutionEligibilityInput = {
  eventStatus: unknown;
  deliveryStatus: unknown;
  executionStatus: unknown;
};

/**
 * Presentation dismissal is deliberately not an execution cancellation.
 * A dismissed popup remains eligible for the server-owned automatic worker
 * while its delivery was successful and execution has not reached a terminal state.
 */
export function isPopupExecutionEligible(input: PopupExecutionEligibilityInput): boolean {
  const eventStatus = String(input.eventStatus ?? "").toUpperCase();
  const deliveryStatus = String(input.deliveryStatus ?? "").toLowerCase();
  const executionStatus = String(input.executionStatus ?? "").toUpperCase();

  return ["DELIVERED", "NOTICED", "OPENED", "DISMISSED"].includes(eventStatus)
    && ["delivered", "received", "rendered"].includes(deliveryStatus)
    && ["READY", "RETRYING"].includes(executionStatus);
}
