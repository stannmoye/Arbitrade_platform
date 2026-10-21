/** Normalize persisted or browser-provided notification volume to a safe 0–100 range. */
export function normalizeNotificationVolume(value: unknown, fallback = 80): number {
  const safeFallback = Number.isFinite(fallback) ? Math.min(100, Math.max(0, fallback)) : 80;
  if (typeof value !== "number" || !Number.isFinite(value)) return safeFallback;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** Convert a user-selected percentage into HTMLAudioElement volume with optional attenuation. */
export function notificationAudioVolume(value: unknown, attenuation = 1): number {
  const safeAttenuation = Number.isFinite(attenuation)
    ? Math.min(1, Math.max(0, attenuation))
    : 1;
  return (normalizeNotificationVolume(value) / 100) * safeAttenuation;
}
