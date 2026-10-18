import { describe, expect, it, vi } from "vitest";
import { createAuthRateLimiter, createConfiguredAuthRateLimitStore, createUpstashAuthRateLimitStore } from "./authRateLimit";

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

  it("keys local limits by Express's resolved client IP, not the raw forwarded header", () => {
    const limit = createAuthRateLimiter({ windowMs: 60_000, max: 1, message: "Limited", now: () => 1_000 });
    const first = harness("203.0.113.1"); limit(first.req as never, first.res as never, first.next);
    const second = harness("203.0.113.1");
    second.req.headers["x-forwarded-for"] = "198.51.100.123";
    limit(second.req as never, second.res as never, second.next);
    expect(first.next).toHaveBeenCalledOnce();
    expect(second.next).not.toHaveBeenCalled();
    expect(second.payload.status).toBe(429);
  });

  it("keeps local limits isolated between distinct resolved client IPs", () => {
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

  it("requires a route-specific scope when a shared store is supplied", () => {
    const store = { consume: vi.fn(async () => ({ count: 1, resetMs: 60_000 })) };
    expect(() => createAuthRateLimiter({ windowMs: 60_000, max: 5, message: "x", store })).toThrow(/scope/i);
    expect(() => createAuthRateLimiter({ windowMs: 60_000, max: 5, message: "x", store, scope: "login:customer" })).not.toThrow();
  });

  it("fails closed with 503 when the configured shared store is unavailable", async () => {
    const store = { consume: vi.fn(async () => { throw new Error("backend unavailable; credential=private-test-value"); }) };
    const limit = createAuthRateLimiter({ windowMs: 60_000, max: 5, message: "Limited", store, scope: "customer-login" });
    const call = harness("203.0.113.1");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      limit(call.req as never, call.res as never, call.next);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(call.payload.status).toBe(503);
      expect(call.next).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "[AuthRateLimit] Shared store unavailable; rejecting authentication request",
        "Error",
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private-test-value");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns shared-store 429 responses with rate-limit headers", async () => {
    const store = { consume: vi.fn(async () => ({ count: 3, resetMs: 12_000 })) };
    const limit = createAuthRateLimiter({ windowMs: 60_000, max: 2, message: "Limited", store, scope: "customer-login" });
    const call = harness("203.0.113.1");
    limit(call.req as never, call.res as never, call.next);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.consume).toHaveBeenCalledWith("customer-login:203.0.113.1", 60_000);
    expect(call.payload.status).toBe(429);
    expect(call.headers["RateLimit-Limit"]).toBe("2");
    expect(call.headers["RateLimit-Remaining"]).toBe("0");
    expect(call.headers["Retry-After"]).toBe("12");
  });
});

describe("shared Redis REST rate-limit store", () => {

  it("rejects non-success HTTP responses without exposing response bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("sensitive proxy response body", { status: 502 }));
    const store = createUpstashAuthRateLimitStore({ url: "https://redis.example.com", token: "test-token", fetchImpl });
    await expect(store.consume("customer-login:203.0.113.1", 60_000))
      .rejects.toThrow("Shared authentication rate-limit store returned HTTP 502");
  });

  it("rejects malformed JSON and invalid counter results", async () => {
    const malformedJson = createUpstashAuthRateLimitStore({
      url: "https://redis.example.com",
      token: "test-token",
      fetchImpl: vi.fn(async () => new Response("not-json", { status: 200 })),
    });
    await expect(malformedJson.consume("customer-login:203.0.113.1", 60_000))
      .rejects.toThrow("Shared authentication rate-limit store returned invalid JSON");

    const invalidCounter = createUpstashAuthRateLimitStore({
      url: "https://redis.example.com",
      token: "test-token",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ result: [0, -1] }), { status: 200 })),
    });
    await expect(invalidCounter.consume("customer-login:203.0.113.1", 60_000))
      .rejects.toThrow("Shared authentication rate-limit store returned invalid counter values");
  });

  it("rejects an invalid response shape instead of silently allowing authentication", async () => {
    const store = createUpstashAuthRateLimitStore({
      url: "https://redis.example.com",
      token: "test-token",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ result: "unlimited" }), { status: 200 })),
    });
    await expect(store.consume("customer-login:203.0.113.1", 60_000))
      .rejects.toThrow("Shared authentication rate-limit store returned an invalid counter result");
  });


  it("requires a clean HTTPS endpoint and a non-empty token", () => {
    expect(() => createUpstashAuthRateLimitStore({ url: "http://redis.example.com", token: "secret" })).toThrow(/HTTPS/i);
    expect(() => createUpstashAuthRateLimitStore({ url: "https://user:pass@redis.example.com", token: "secret" })).toThrow(/without credentials/i);
    expect(() => createUpstashAuthRateLimitStore({ url: "https://redis.example.com?token=leak", token: "secret" })).toThrow(/query/i);
    expect(() => createUpstashAuthRateLimitStore({ url: "https://redis.example.com/#fragment", token: "secret" })).toThrow(/fragment/i);
    expect(() => createUpstashAuthRateLimitStore({ url: "https://redis.example.com", token: " " })).toThrow(/token/i);
  });

  it("increments atomically and hashes client identifiers before sending Redis keys", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: [2, 15_000] }), { status: 200 }));
    const store = createUpstashAuthRateLimitStore({ url: "https://redis.example.com", token: "test-token", fetchImpl });
    const result = await store.consume("customer-login:203.0.113.1", 60_000);
    expect(result).toEqual({ count: 2, resetMs: 15_000 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://redis.example.com/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const command = JSON.parse(String(init.body)) as string[];
    expect(command.slice(0, 3)).toEqual(["EVAL", expect.any(String), "1"]);
    expect(command[3]).toMatch(/^arbitrade:auth-rate-limit:[a-f0-9]{64}$/);
    expect(command[3]).not.toContain("203.0.113.1");
    expect(command[4]).toBe("60000");
  });

  it("does not configure a shared store unless both settings are supplied", () => {
    expect(createConfiguredAuthRateLimitStore({})).toBeUndefined();
    expect(() => createConfiguredAuthRateLimitStore({ AUTH_RATE_LIMIT_REDIS_REST_URL: "https://redis.example.com" })).toThrow(/both/i);
    expect(() => createConfiguredAuthRateLimitStore({ AUTH_RATE_LIMIT_REDIS_REST_TOKEN: "secret" })).toThrow(/both/i);
    expect(createConfiguredAuthRateLimitStore({
      AUTH_RATE_LIMIT_REDIS_REST_URL: "https://redis.example.com",
      AUTH_RATE_LIMIT_REDIS_REST_TOKEN: "secret",
    })).toBeDefined();
  });
});
