import { renderEmail, sendRenderedEmail } from "../email";
import { isEmailDeliveryConfigured } from "../email";

export type NotificationPayload = { title: string; content: string };
const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

function validatePayload(input: NotificationPayload): NotificationPayload {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!title) throw new Error("Notification title is required.");
  if (!content) throw new Error("Notification content is required.");
  if (title.length > TITLE_MAX_LENGTH) throw new Error(`Notification title must be at most ${TITLE_MAX_LENGTH} characters.`);
  if (content.length > CONTENT_MAX_LENGTH) throw new Error(`Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`);
  return { title, content };
}

/**
 * Owner notifications use the application's configured SMTP transport. In-app
 * customer notifications remain in the Arbitrade database; this function is
 * only for optional operational alerts to an explicitly configured mailbox.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const normalized = validatePayload(payload);
  // Owner alerts are optional and remain disabled until a recipient is managed in the admin portal.
  const recipient = "";
  if (!(await isEmailDeliveryConfigured()) || !recipient) return false;
  const rendered = renderEmail("system_notification", { title: normalized.title, body: normalized.content });
  try {
    await sendRenderedEmail(recipient, rendered);
    return true;
  } catch (error) {
    console.warn("[Notification] Local SMTP notification delivery failed:", error instanceof Error ? error.name : "UnknownError");
    return false;
  }
}
