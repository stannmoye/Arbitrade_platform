/**
 * Resolve the explicit number of trusted reverse-proxy hops for Express.
 * Default to direct-client mode: never trust forwarded headers unless the operator
 * configures the exact proxy topology. A boolean "true" is intentionally unsupported.
 */
export function resolveTrustedProxyHops(value: string | undefined): number | false {
  const raw = value?.trim();
  if (!raw) return false;
  if (!/^\d+$/.test(raw)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 10");
  }
  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 10");
  }
  return hops === 0 ? false : hops;
}
