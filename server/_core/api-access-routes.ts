import type { Express, Request, Response } from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import { authenticateCustomerApiKey, type CustomerApiScope } from "../api-access";
import { getAppSetting, getDb, listBalances, listCurrencies, listCustomerPayoutRequests } from "../db";
import { opportunityOffers, tradePositions } from "../../drizzle/schema";
import { configuredAuthRateLimitStore, createAuthRateLimiter } from "./authRateLimit";

type ApiIdentity = { userId: number; keyId: number; scopes: CustomerApiScope[] };
type Bucket = { count: number; resetAt: number };
const localBuckets = new Map<number, Bucket>();
const apiIpRateLimit = createAuthRateLimiter({ windowMs: 60_000, max: 300, message: "Too many API requests from this network. Try again shortly.", store: configuredAuthRateLimitStore, scope: "customer-api-ip" });

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
  app.get("/api/v1/account/balances", apiIpRateLimit, apiHandler("balances:read", async (_req, res, identity) => {
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

  app.get("/api/v1/account/trades", apiIpRateLimit, apiHandler("transactions:read", async (req, res, identity) => {
    const requestedLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const beforeId = req.query.beforeId === undefined ? undefined : Number(req.query.beforeId);
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      res.status(400).json({ error: "limit must be an integer between 1 and 100.", code: "INVALID_LIMIT" });
      return;
    }
    if (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId < 1)) {
      res.status(400).json({ error: "beforeId must be a positive integer.", code: "INVALID_CURSOR" });
      return;
    }
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const filters = [eq(tradePositions.userId, identity.userId)];
    if (beforeId !== undefined) filters.push(lt(tradePositions.id, beforeId));
    const rows = await db.select({
      id: tradePositions.id,
      offerId: tradePositions.offerId,
      currency: tradePositions.currency,
      principalMinor: tradePositions.principalMinor,
      expectedRewardMinor: tradePositions.expectedRewardMinor,
      status: tradePositions.status,
      confirmedAt: tradePositions.confirmedAt,
      settlesAt: tradePositions.settlesAt,
      creditAt: tradePositions.creditAt,
      settledAt: tradePositions.settledAt,
      symbol: opportunityOffers.symbol,
      venueFrom: opportunityOffers.venueFrom,
      venueTo: opportunityOffers.venueTo,
    }).from(tradePositions)
      .leftJoin(opportunityOffers, eq(opportunityOffers.id, tradePositions.offerId))
      .where(and(...filters))
      .orderBy(desc(tradePositions.id))
      .limit(requestedLimit + 1);
    const hasMore = rows.length > requestedLimit;
    const page = hasMore ? rows.slice(0, requestedLimit) : rows;
    res.json({
      data: page,
      meta: { accountScope: "authenticated-customer", count: page.length, limit: requestedLimit, nextBeforeId: hasMore ? page[page.length - 1]?.id ?? null : null, checkedAt: new Date().toISOString() },
    });
  }));

  app.get("/api/v1/account/withdrawals", apiIpRateLimit, apiHandler("withdrawals:read", async (_req, res, identity) => {
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

  app.get("/api/v1/platform/status", apiIpRateLimit, apiHandler("platform:status", async (_req, res) => {
    res.json({
      data: { apiService: "online", maintenanceStatus: "not-configured", fullServiceHealth: "not-configured" },
      meta: { checkedAt: new Date().toISOString(), note: "This endpoint reports API availability only until the administrator configures full platform health checks." },
    });
  }));
}
