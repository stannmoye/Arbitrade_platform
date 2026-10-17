import { describe, expect, it, vi } from "vitest";
import { createAuthRateLimiter } from "./authRateLimit";

function harness(ip: string) {
  const headers: Record<string, string> = {};
  const payload: { status?: number; body?: unknown } = {};
  const res = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    status: (status: number) => { payload.status = status; return res; },
    json: (body: unknown) => { payload.body = body; return res; },
  };
  const next = vi.fn();
  const req = { ip, socket: { remoteAddress: ip }, headers: { "x-forwarded-for": "198.51.100.99" } };
  return { req, res, next, headers, payload };
}

describe("authentication endpoint rate limiter", () => {
  it("allows the configured number of requests and then returns 429 with Retry-After", () => {
    let now = 1_000;
    const limit = createAuthRateLimiter({ windowMs: 60_000, max: 2, message: "Try again later", now: () => now });
    const first = harness("203.0.113.1"); limit(first.req as never, first.res as never, first.next);
    const second = harness("203.0.113.1"); limit(second.req as never, second.res as never, second.next);
    const third = harness("203.0.113.1"); limit(third.req as never, third.res as never, third.next);
    expect(first.next).toHaveBeenCalledOnce();
    expect(second.next).toHaveBeenCalledOnce();
    expect(third.next).not.toHaveBeenCalled();
    expect(third.payload.status).toBe(429);
    expect(third.payload.body).toMatchObject({ error: "Try again later", retryAfterSeconds: 60 });
    expect(third.headers["Retry-After"]).toBe("60");
    now += 60_001;
    const afterWindow = harness("203.0.113.1"); limit(afterWindow.req as never, afterWindow.res as never, afterWindow.next);
    expect(afterWindow.next).toHaveBeenCalledOnce();
  });

  it("keeps limits isolated by resolved client IP and ignores the raw forwarded header", () => {
    const limit = createAuthRateLimiter({ windowMs: 60_000, max: 1, message: "Limited", now: () => 1_000 });
    const first = harness("203.0.113.1"); limit(first.req as never, first.res as never, first.next);
    const second = harness("203.0.113.2"); limit(second.req as never, second.res as never, second.next);
    expect(first.next).toHaveBeenCalledOnce();
    expect(second.next).toHaveBeenCalledOnce();
  });

  it("rejects invalid limiter configuration", () => {
    expect(() => createAuthRateLimiter({ windowMs: 0, max: 1, message: "x" })).toThrow();
    expect(() => createAuthRateLimiter({ windowMs: 1_000, max: 0, message: "x" })).toThrow();
  });
});
