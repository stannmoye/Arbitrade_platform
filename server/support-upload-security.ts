/**
 * Validate a provider-generated upload URL before sending it to a customer's browser.
 * Presigned URLs are bearer credentials, so only absolute HTTPS URLs without embedded
 * username/password credentials are accepted. Query parameters are preserved unchanged.
 */
export function getSafePresignedUploadUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // WHATWG URL parsing silently strips tabs/newlines and trims surrounding whitespace.
  // Do not let parser normalization change a signed bearer URL before it reaches the client.
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
