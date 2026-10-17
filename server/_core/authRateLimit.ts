import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
export type AuthRateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  now?: () => number;
};

/**
 * Small process-local limiter for public authentication endpoints.
 * Deployments with multiple workers/replicas should use a shared store at the edge.
 * Uses Express's resolved client IP and deliberately does not trust X-Forwarded-For itself.
 */
export function createAuthRateLimiter(options: AuthRateLimitOptions) {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1 ||
      !Number.isSafeInteger(options.max) || options.max < 1) {
    throw new Error("Invalid authentication rate-limit configuration");
  }
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;

  return function authRateLimit(req: Request, res: Response, next: NextFunction) {
    const current = now();
    // Bound memory usage and remove expired entries opportunistically.
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + options.windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));
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
