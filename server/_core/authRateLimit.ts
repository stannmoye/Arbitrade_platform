import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
export type AuthRateLimitStoreResult = { count: number; resetMs: number };
export type AuthRateLimitStore = {
  consume(key: string, windowMs: number): Promise<AuthRateLimitStoreResult>;
};
export type AuthRateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  now?: () => number;
  /** Stable route-specific key prefix, required when using a shared store. */
  scope?: string;
  store?: AuthRateLimitStore;
};

const UPSTASH_INCREMENT_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end",
  "return {count, ttl}",
].join("\n");

type UpstashStoreOptions = {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
};

/**
 * Atomic, shared fixed-window counters backed by Upstash Redis REST.
 * IP addresses are SHA-256 hashed before they become Redis keys.
 */
export function createUpstashAuthRateLimitStore(options: UpstashStoreOptions): AuthRateLimitStore {
  let endpoint: URL;
  try {
    endpoint = new URL(options.url);
  } catch {
    throw new Error("AUTH_RATE_LIMIT_REDIS_REST_URL must be a valid HTTPS URL");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("AUTH_RATE_LIMIT_REDIS_REST_URL must be an HTTPS endpoint without credentials, query, or fragment");
  }
  if (!options.token.trim()) throw new Error("AUTH_RATE_LIMIT_REDIS_REST_TOKEN must not be empty");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async consume(key, windowMs) {
      const redisKey = `arbitrade:auth-rate-limit:${crypto.createHash("sha256").update(key).digest("hex")}`;
      let response: globalThis.Response;
      try {
        response = await fetchImpl(endpoint.toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["EVAL", UPSTASH_INCREMENT_SCRIPT, "1", redisKey, String(windowMs)]),
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        throw new Error("Shared authentication rate-limit store request failed");
      }
      if (!response.ok) throw new Error(`Shared authentication rate-limit store returned HTTP ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Shared authentication rate-limit store returned invalid JSON");
      }
      const result = (payload as { result?: unknown } | null)?.result;
      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error("Shared authentication rate-limit store returned an invalid counter result");
      }
      const count = Number(result[0]);
      const resetMs = Number(result[1]);
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(resetMs) || resetMs < 0) {
        throw new Error("Shared authentication rate-limit store returned invalid counter values");
      }
      return { count, resetMs };
    },
  };
}

/** Returns a shared store when both Redis REST settings are supplied, otherwise undefined. */
export function createConfiguredAuthRateLimitStore(
  env: Record<string, string | undefined> = process.env,
): AuthRateLimitStore | undefined {
  const url = env.AUTH_RATE_LIMIT_REDIS_REST_URL?.trim();
  const token = env.AUTH_RATE_LIMIT_REDIS_REST_TOKEN?.trim();
  if (!url && !token) return undefined;
  if (!url || !token) {
    throw new Error("Configure both AUTH_RATE_LIMIT_REDIS_REST_URL and AUTH_RATE_LIMIT_REDIS_REST_TOKEN, or leave both unset");
  }
  return createUpstashAuthRateLimitStore({ url, token });
}

export const configuredAuthRateLimitStore = createConfiguredAuthRateLimitStore();

function setRateLimitHeaders(res: Response, max: number, remaining: number, resetMs: number) {
  const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  return resetSeconds;
}

/**
 * Bounded process-local limiter for single-process development and deployments
 * without a configured shared store. Multi-instance deployments should configure
 * the shared Redis REST store. Raw forwarded headers are never read here.
 */
export function createAuthRateLimiter(options: AuthRateLimitOptions) {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1 ||
      !Number.isSafeInteger(options.max) || options.max < 1) {
    throw new Error("Invalid authentication rate-limit configuration");
  }
  if (options.store && (!options.scope || !/^[a-z0-9:_-]{1,100}$/i.test(options.scope))) {
    throw new Error("A stable, route-specific scope is required for shared authentication rate limiting");
  }

  if (options.store) {
    return function sharedAuthRateLimit(req: Request, res: Response, next: NextFunction) {
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      void options.store!.consume(`${options.scope}:${ip}`, options.windowMs).then(({ count, resetMs }) => {
        const resetSeconds = setRateLimitHeaders(res, options.max, Math.max(0, options.max - count), resetMs);
        if (count > options.max) {
          res.setHeader("Retry-After", String(resetSeconds));
          return res.status(429).json({ error: options.message, retryAfterSeconds: resetSeconds });
        }
        return next();
      }).catch((error: unknown) => {
        // Fail closed: if a configured shared store is unavailable, do not silently
        // fall back to per-process counters that can be bypassed across replicas.
        console.error("[AuthRateLimit] Shared store unavailable; rejecting authentication request", error instanceof Error ? "Error" : "UnknownError");
        return res.status(503).json({ error: "Authentication protection is temporarily unavailable. Try again shortly." });
      });
    };
  }

  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;
  let cleanupCounter = 0;
  return function localAuthRateLimit(req: Request, res: Response, next: NextFunction) {
    const current = now();
    // Amortize expiry scans instead of walking up to 10,000 keys on every request.
    // The size cap below still bounds memory between cleanup passes.
    cleanupCounter += 1;
    if (cleanupCounter >= 100) {
      cleanupCounter = 0;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= current) buckets.delete(key);
      }
    }
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + options.windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const resetMs = Math.max(0, bucket.resetAt - current);
    const resetSeconds = setRateLimitHeaders(res, options.max, remaining, resetMs);
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return res.status(429).json({ error: options.message, retryAfterSeconds: resetSeconds });
    }
    // Avoid an unbounded map if a burst of unique addresses arrives in one window.
    if (buckets.size > 10_000) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined && oldest !== ip) buckets.delete(oldest);
    }
    return next();
  };
}
