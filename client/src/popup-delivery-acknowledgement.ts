export type PopupAcknowledgementResult = "acknowledged" | "retry" | "cancelled";

/**
 * Receipt and rendering are separate idempotent acknowledgements. A transport
 * error is ambiguous: the server may have committed before the response was
 * lost, so repeat both operations with the same delivery identity/token.
 * This helper intentionally has no failure transition.
 */
export async function acknowledgePopupDelivery(input: {
  received: () => Promise<unknown>;
  rendered: () => Promise<unknown>;
  isCurrent: () => boolean;
  maxAttempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<PopupAcknowledgementResult> {
  const maxAttempts = input.maxAttempts ?? 3;
  const wait = input.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new RangeError("Popup acknowledgement attempts must be an integer from 1 to 10.");
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!input.isCurrent()) return "cancelled";
    try {
      await input.received();
      await input.rendered();
      return "acknowledged";
    } catch {
      if (attempt + 1 >= maxAttempts) return "retry";
      await wait(Math.min(250 * 2 ** attempt, 2_000));
    }
  }
  return "retry";
}
