export const DEFAULT_TICKET_UPLOAD_POLICY = {
  maxAttachmentMb: 25,
  allowedMimeTypes: ["image/*", "application/pdf", "text/plain", ".doc", ".docx", ".xls", ".xlsx"],
} as const;

/**
 * Parse persisted ticket-upload settings defensively. Older or partially
 * migrated databases may not contain one or both settings yet.
 */
export function normalizeTicketUploadPolicy(
  maxValue: string | undefined,
  typesValue: string | undefined,
) {
  const parsedMax = Number(maxValue);
  const maxAttachmentMb =
    Number.isInteger(parsedMax) && parsedMax > 0
      ? Math.min(parsedMax, 100)
      : DEFAULT_TICKET_UPLOAD_POLICY.maxAttachmentMb;

  const allowedMimeTypes = (typesValue ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  return {
    maxAttachmentMb,
    allowedMimeTypes: allowedMimeTypes.length > 0
      ? allowedMimeTypes
      : [...DEFAULT_TICKET_UPLOAD_POLICY.allowedMimeTypes],
  };
}
