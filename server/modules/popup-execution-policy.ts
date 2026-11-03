export type PopupExecutionEligibilityInput = {
  eventStatus: unknown;
  deliveryStatus: unknown;
  executionStatus: unknown;
};

/**
 * Presentation dismissal is deliberately not an execution cancellation.
 * Dispatch/receipt/render acknowledgements are informational and do not gate
 * server-owned allocation. Unknown event/execution states fail closed; RUNNING
 * attempts must not be claimed a second time.
 */
export function isPopupExecutionEligible(input: PopupExecutionEligibilityInput): boolean {
  const eventStatus = String(input.eventStatus ?? "").toUpperCase();
  const executionStatus = String(input.executionStatus ?? "").toUpperCase();

  // Browser-side delivery acknowledgements must never decide allocation.
  return ["DELIVERED", "NOTICED", "OPENED", "DISMISSED"].includes(eventStatus)
    && ["READY", "RETRYING"].includes(executionStatus);
}
