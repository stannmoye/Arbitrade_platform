/**
 * Validate a provider-generated upload URL before sending it to a customer's browser.
 * Presigned URLs are bearer credentials, so only absolute HTTPS URLs without embedded
 * username/password credentials are accepted. The original URL string is returned unchanged
 * after validation because serializing a URL can normalize components used in signatures.
 */
export function getSafePresignedUploadUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // WHATWG URL parsing silently strips tabs/newlines and trims surrounding whitespace.
  // Do not let parser normalization change a signed bearer URL before it reaches the client.
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return value;
  } catch {
    return null;
  }
}


/**
 * Validate a provider-generated download URL before redirecting an authenticated
 * user to it. The signed URL remains a bearer credential; reject malformed,
 * non-HTTPS, credential-bearing, or parser-normalized values.
 */
export function getSafePresignedDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return value;
  } catch {
    return null;
  }
}
