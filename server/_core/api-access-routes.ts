import type { Express, Request, Response } from "express";
import { authenticateCustomerApiKey, type CustomerApiScope } from "../api-access";
import { getAppSetting, listBalances, listCurrencies, listCustomerPayoutRequests, listTrades } from "../db";
import { configuredAuthRateLimitStore } from "./authRateLimit";

type ApiIdentity = { userId: number; keyId: number; scopes: CustomerApiScope[] };
type Bucket = { count: number; resetAt: number };
const localBuckets = new Map<number, Bucket>();

async function loadPolicy() {
  try {
    const stored = JSON.parse((await getAppSetting("apiAccess.settings")) || "{}");
    return {
      enabled: stored.apiEnabled === true,
      requestsPerMinute: Number.isSafeInteger(stored.requestsPerMinute) && stored.requestsPerMinute >= 10 && stored.requestsPerMinute <= 600
        ? stored.requestsPerMinute : 60,
    };
  } catch {
    return { enabled: false, requestsPerMinute: 60 };
  }
}

async function consumeKeyRateLimit(keyId: number, max: number) {
  if (configuredAuthRateLimitStore) {
    try {
      const result = await configuredAuthRateLimitStore.consume("customer-api-key:" + keyId, 60_000);
      return { allowed: result.count <= max, remaining: Math.max(0, max - result.count), retryAfterSeconds: Math.max(1, Math.ceil(result.resetMs / 1000)) };
    } catch {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60, unavailable: true };
    }
  }
  const now = Date.now();
  for (const [id, bucket] of localBuckets) if (bucket.resetAt <= now) localBuckets.delete(id);
  let bucket = localBuckets.get(keyId);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60_000 };
    localBuckets.set(keyId, bucket);
  }
  bucket.count += 1;
  if (localBuckets.size > 10_000) { const oldest = localBuckets.keys().next().value; if (oldest !== undefined && oldest !== keyId) localBuckets.delete(oldest); }
  return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

function apiHandler(scope: CustomerApiScope, handler: (req: Request, res: Response, identity: ApiIdentity) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const authorization = req.header("authorization") || "";
    const match = /^Bearer (\S+)$/.exec(authorization);
    if (!match) return res.status(401).json({ error: "Provide an API key in the Authorization: Bearer header.", code: "API_KEY_REQUIRED" });
    const identity = await authenticateCustomerApiKey(match[1]);
    if (!identity) return res.status(401).json({ error: "The API key is invalid, revoked, or no longer belongs to an active customer.", code: "API_KEY_INVALID" });
    const policy = await loadPolicy();
    if (!policy.enabled) return res.status(503).json({ error: "Customer API access is disabled by the administrator.", code: "API_ACCESS_DISABLED" });
    if (!identity.scopes.includes(scope)) return res.status(403).json({ error: "This API key does not have the required permission.", code: "API_SCOPE_REQUIRED", requiredScope: scope });
    const limit = await consumeKeyRateLimit(identity.keyId, policy.requestsPerMinute);
    res.setHeader("RateLimit-Limit", String(policy.requestsPerMinute));
    res.setHeader("RateLimit-Remaining", String(limit.remaining));
    res.setHeader("RateLimit-Policy", `${policy.requestsPerMinute};w=60`);
    if ("unavailable" in limit && limit.unavailable) return res.status(503).json({ error: "API rate-limit protection is temporarily unavailable.", code: "API_RATE_LIMIT_UNAVAILABLE" });
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({ error: "This API key has exceeded its per-minute request limit.", code: "API_RATE_LIMITED", retryAfterSeconds: limit.retryAfterSeconds });
    }
    try {
      await handler(req, res, identity);
    } catch (error) {
      console.error("[CustomerAPI] Request failed:", error instanceof Error ? error.name : "UnknownError");
      if (!res.headersSent) res.status(503).json({ error: "The requested account data is temporarily unavailable.", code: "API_DATA_UNAVAILABLE" });
    }
  };
}

export function registerCustomerApiAccessRoutes(app: Express) {
  app.get("/api/v1/account/balances", apiHandler("balances:read", async (_req, res, identity) => {
    const [balances, currencies] = await Promise.all([listBalances(identity.userId), listCurrencies()]);
    const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));
    res.json({
      data: balances.map((balance) => {
        const currency = currencyByCode.get(balance.currency);
        return {
          currency: balance.currency,
          availableMinor: Number(balance.availableMinor || 0),
          lockedMinor: Number(balance.lockedMinor || 0),
          promotionalMinor: Number(balance.promotionalMinor || 0),
          earnedMinor: Number(balance.earnedMinor || 0),
          scale: currency?.scale ?? 2,
          updatedAt: balance.updatedAt ?? null,
        };
      }),
      meta: { accountScope: "authenticated-customer", units: "minor", checkedAt: new Date().toISOString() },
    });
  }));

  app.get("/api/v1/account/trades", apiHandler("transactions:read", async (_req, res, identity) => {
    const rows = await listTrades(identity.userId);
    res.json({
      data: rows.map(({ userId: _userId, ...trade }) => trade),
      meta: { accountScope: "authenticated-customer", count: rows.length, checkedAt: new Date().toISOString() },
    });
  }));

  app.get("/api/v1/account/withdrawals", apiHandler("withdrawals:read", async (_req, res, identity) => {
    const rows = await listCustomerPayoutRequests(identity.userId);
    res.json({
      data: rows.map((row) => ({
        requestReference: row.requestReference,
        currency: row.currency,
        amountMinor: row.amountMinor,
        status: row.status,
        externalReference: row.externalReference,
        resolutionNote: row.resolutionNote,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: { accountScope: "authenticated-customer", count: rows.length, checkedAt: new Date().toISOString() },
    });
  }));

  app.get("/api/v1/platform/status", apiHandler("platform:status", async (_req, res) => {
    res.json({
      data: { apiService: "online", maintenanceStatus: "not-configured", fullServiceHealth: "not-configured" },
      meta: { checkedAt: new Date().toISOString(), note: "This endpoint reports API availability only until the administrator configures full platform health checks." },
    });
  }));
}
