/**
 * Resolve the number of trusted reverse-proxy hops for Express.
 *
 * An absent or invalid value fails closed to direct-client mode (false). This
 * prevents a typo in an optional deployment setting from crashing startup or
 * accidentally enabling trust in forwarded headers. Operators should set the
 * exact hop count only when the network topology is known.
 */
export function resolveTrustedProxyHops(value: string | undefined): number | false {
  const raw = value?.trim();
  if (!raw) return false;
  if (!/^\d+$/.test(raw)) return false;

  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 10) return false;
  return hops === 0 ? false : hops;
}
