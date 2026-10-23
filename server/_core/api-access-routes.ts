import type { Express, Request, Response } from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import { authenticateCustomerApiKey, type CustomerApiScope } from "../api-access";
import { getAppSetting, getDb, listBalances, listCurrencies, listCustomerPayoutRequests, listTrades } from "../db";
import { API_AUTOMATION_EVENTS, createCustomerApiWebhook, listApiPlatformIncidents, listCustomerApiNotificationHistory, listCustomerApiWebhooks, revokeCustomerApiWebhook } from "../api-access-automation";
import { listCustomerApiUsage, recordCustomerApiUsage } from "../api-access-usage";
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
    const requestStartedAt = Date.now();
    res.once("finish", () => {
      void recordCustomerApiUsage(identity.userId, identity.keyId, res.statusCode, Date.now() - requestStartedAt);
    });
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


  app.get("/api/v1/account/deposits", apiIpRateLimit, apiHandler("deposits:read", async (_req, res) => {
    res.status(503).json({
      error: "Deposit monitoring is unavailable until an administrator connects and verifies a supported wallet/deposit provider.",
      code: "DEPOSIT_PROVIDER_NOT_CONFIGURED", retryable: false,
    });
  }));

  app.get("/api/v1/account/fees", apiIpRateLimit, apiHandler("fees:read", async (_req, res) => {
    res.status(503).json({
      error: "Customer fee history is not available because the application does not yet have an authoritative fee ledger connected to this API.",
      code: "FEE_LEDGER_NOT_CONFIGURED", retryable: false,
    });
  }));

  app.get("/api/v1/platform/fee-schedule", apiIpRateLimit, apiHandler("fees:read", async (_req, res) => {
    const raw = await getAppSetting("apiAccess.settings");
    let settings: Record<string, unknown> = {};
    try { settings = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { settings = {}; }
    let schedule: unknown = [];
    try { schedule = settings.feeScheduleJson ? JSON.parse(String(settings.feeScheduleJson)) : []; } catch { schedule = null; }
    if (!Array.isArray(schedule)) {
      res.status(503).json({ error: "The published fee schedule is not valid. Ask an administrator to review it.", code: "FEE_SCHEDULE_UNAVAILABLE" });
      return;
    }
    if (!schedule.length) {
      res.status(503).json({ error: "No fee schedule has been published by the administrator.", code: "FEE_SCHEDULE_NOT_PUBLISHED" });
      return;
    }
    res.json({ data: schedule, meta: { source: "administrator-published-schedule", checkedAt: new Date().toISOString() } });
  }));

  app.get("/api/v1/account/api-usage", apiIpRateLimit, apiHandler("usage:read", async (_req, res, identity) => {
    const data = await listCustomerApiUsage(identity.userId);
    res.json({ data, meta: { accountScope: "authenticated-customer", retentionDays: 90, aggregation: "per-key-and-UTC-day", checkedAt: new Date().toISOString() } });
  }));

  app.get("/api/v1/account/exchange-rates", apiIpRateLimit, apiHandler("exchange-rates:read", async (_req, res) => {
    const currencies = await listCurrencies();
    res.json({
      data: currencies.map((currency) => ({
        code: currency.code, scale: currency.scale, usdRate: currency.usdRate, updatedAt: currency.updatedAt ?? null,
      })),
      meta: { baseCurrency: "USD", checkedAt: new Date().toISOString(), note: "Rates reflect the application's stored rate source and update time." },
    });
  }));

  app.get("/api/v1/account/analytics", apiIpRateLimit, apiHandler("analytics:read", async (_req, res, identity) => {
    const [balances, currencies, trades, withdrawals] = await Promise.all([
      listBalances(identity.userId), listCurrencies(), listTrades(identity.userId), listCustomerPayoutRequests(identity.userId),
    ]);
    const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));
    const totals = balances.reduce((result, balance) => {
      const currency = currencyByCode.get(balance.currency);
      const scale = currency?.scale ?? 2;
      const rate = Number(currency?.usdRate) || 0;
      result.availableUsd += Number(balance.availableMinor || 0) / Math.pow(10, scale) * rate;
      result.lockedUsd += Number(balance.lockedMinor || 0) / Math.pow(10, scale) * rate;
      return result;
    }, { availableUsd: 0, lockedUsd: 0 });
    const tradeStatuses = trades.reduce((result: Record<string, number>, item) => {
      result[item.status] = (result[item.status] || 0) + 1; return result;
    }, {});
    const withdrawalStatuses = withdrawals.reduce((result: Record<string, number>, item) => {
      result[item.status] = (result[item.status] || 0) + 1; return result;
    }, {});
    res.json({
      data: {
        balanceCurrencyCount: balances.length, totalsApproximateUsd: totals,
        tradeCount: trades.length, tradeStatuses, withdrawalRequestCount: withdrawals.length, withdrawalStatuses,
      },
      meta: { accountScope: "authenticated-customer", checkedAt: new Date().toISOString(), note: "USD totals use stored currency rates and are estimates, not accounting valuations." },
    });
  }));

  app.get("/api/v1/account/statements/daily", apiIpRateLimit, apiHandler("statements:read", async (req, res, identity) => {
    const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
      res.status(400).json({ error: "date must use YYYY-MM-DD.", code: "INVALID_REPORT_DATE" }); return;
    }
    const start = new Date(date + "T00:00:00.000Z").getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const [balances, currencies, trades, withdrawals] = await Promise.all([
      listBalances(identity.userId), listCurrencies(), listTrades(identity.userId), listCustomerPayoutRequests(identity.userId),
    ]);
    const dayTrades = trades.filter((item) => {
      const time = new Date(item.confirmedAt).getTime(); return time >= start && time < end;
    }).map(({ userId: _owner, ...item }) => item);
    const dayWithdrawals = withdrawals.filter((item) => {
      const time = new Date(item.createdAt).getTime(); return time >= start && time < end;
    }).map((item) => ({
      requestReference: item.requestReference, currency: item.currency, amountMinor: item.amountMinor,
      status: item.status, externalReference: item.externalReference, createdAt: item.createdAt, updatedAt: item.updatedAt,
    }));
    res.json({
      data: {
        date, balances: balances.map((item) => ({
          currency: item.currency, availableMinor: item.availableMinor, lockedMinor: item.lockedMinor,
          promotionalMinor: item.promotionalMinor, earnedMinor: item.earnedMinor,
        })),
        currencies: currencies.map((item) => ({ code: item.code, scale: item.scale, usdRate: item.usdRate })),
        trades: dayTrades, withdrawals: dayWithdrawals, deposits: null, fees: null,
      },
      meta: { accountScope: "authenticated-customer", timeZone: "UTC", generatedAt: new Date().toISOString(),
        completeness: "partial", unavailableSections: ["deposits", "fees"],
        note: "This API statement summarizes stored balances, trade records and withdrawal requests for the UTC date. It is not a complete statement while deposit and fee source systems are unconnected." },
    });
  }));

  app.get("/api/v1/account/tax-support", apiIpRateLimit, apiHandler("tax-support:read", async (req, res, identity) => {
    const year = req.query.year === undefined ? new Date().getUTCFullYear() : Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      res.status(400).json({ error: "year must be a four-digit year from 2000 to 2200.", code: "INVALID_REPORT_YEAR" }); return;
    }
    const trades = await listTrades(identity.userId);
    const rows = trades.filter((item) => {
      const time = new Date(item.confirmedAt).getTime();
      return time >= Date.UTC(year, 0, 1) && time < Date.UTC(year + 1, 0, 1);
    });
    const totals = new Map<string, { tradeCount: number; principalMinor: number; creditedRewardMinor: number }>();
    for (const item of rows) {
      const current = totals.get(item.currency) || { tradeCount: 0, principalMinor: 0, creditedRewardMinor: 0 };
      current.tradeCount += 1;
      current.principalMinor += Number(item.principalMinor || 0);
      current.creditedRewardMinor += Number(item.creditedRewardMinor || 0);
      totals.set(item.currency, current);
    }
    res.json({
      data: { year, currencySummaries: [...totals.entries()].map(([currency, value]) => ({ currency, ...value })),
        tradeRows: rows.map(({ userId: _owner, ...item }) => item), additionalSources: ["deposits", "fees"] },
      meta: { accountScope: "authenticated-customer", checkedAt: new Date().toISOString(), completeness: "partial",
        disclaimer: "This is a tax-support data summary, not a tax calculation or tax advice. It covers available trade records only; deposit and fee sources are not connected and jurisdiction-specific treatment is not assessed." },
    });
  }));

  app.get("/api/v1/webhooks", apiIpRateLimit, apiHandler("webhooks:manage", async (_req, res, identity) => {
    const webhooks = await listCustomerApiWebhooks(identity.userId);
    res.json({ data: webhooks, meta: { accountScope: "authenticated-customer", count: webhooks.length, checkedAt: new Date().toISOString() } });
  }));

  app.post("/api/v1/webhooks", apiIpRateLimit, apiHandler("webhooks:manage", async (req, res, identity) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const name = typeof body.name === "string" ? body.name : "";
    const endpointUrl = typeof body.endpointUrl === "string" ? body.endpointUrl : "";
    const events = Array.isArray(body.events) ? body.events.filter((item): item is typeof API_AUTOMATION_EVENTS[number] =>
      typeof item === "string" && (API_AUTOMATION_EVENTS as readonly string[]).includes(item)) : [];
    if (name.trim().length < 3 || name.trim().length > 80 || endpointUrl.length > 500 || !events.length
      || (Array.isArray(body.events) && events.length !== body.events.length)) {
      res.status(400).json({ error: "Provide a 3–80 character name, a public HTTPS endpoint URL and at least one supported event.", code: "INVALID_WEBHOOK_INPUT" });
      return;
    }
    const created = await createCustomerApiWebhook(identity.userId, name, endpointUrl, events);
    res.status(201).json({ data: created, meta: { note: "The webhook signing secret is shown once. Store it securely before leaving this response." } });
  }));

  app.delete("/api/v1/webhooks/:webhookId", apiIpRateLimit, apiHandler("webhooks:manage", async (req, res, identity) => {
    const webhookId = Number(req.params.webhookId);
    if (!Number.isSafeInteger(webhookId) || webhookId <= 0) {
      res.status(400).json({ error: "webhookId must be a positive integer.", code: "INVALID_WEBHOOK_ID" });
      return;
    }
    await revokeCustomerApiWebhook(identity.userId, webhookId);
    res.json({ data: { success: true, webhookId }, meta: { accountScope: "authenticated-customer" } });
  }));

  app.get("/api/v1/account/notification-history", apiIpRateLimit, apiHandler("notifications:read", async (_req, res, identity) => {
    const items = await listCustomerApiNotificationHistory(identity.userId);
    res.json({ data: items, meta: { accountScope: "authenticated-customer", count: items.length, checkedAt: new Date().toISOString() } });
  }));

  app.get("/api/v1/platform/incidents", apiIpRateLimit, apiHandler("incidents:read", async (_req, res) => {
    const incidents = await listApiPlatformIncidents();
    res.json({ data: incidents.map((incident) => ({
      id: incident.id, status: incident.status, title: incident.title, message: incident.message,
      affectedServices: (() => { try { return JSON.parse(incident.affectedServicesJson) as string[]; } catch { return []; } })(),
      startsAt: incident.startsAt, endsAt: incident.endsAt, createdAt: incident.createdAt, updatedAt: incident.updatedAt,
    })), meta: { checkedAt: new Date().toISOString(), source: "administrator-maintained-incident-log" } });
  }));

  app.get("/api/v1/platform/status", apiIpRateLimit, apiHandler("platform:status", async (_req, res) => {
    const raw = await getAppSetting("apiAccess.settings");
    let settings: Record<string, unknown> = {};
    try { settings = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { settings = {}; }
    const incidents = await listApiPlatformIncidents();
    const now = Date.now();
    const activeIncident = incidents.find((item) => !item.endsAt && (!item.startsAt || item.startsAt.getTime() <= now));
    const declaredStatus = ["operational", "degraded", "maintenance", "offline"].includes(String(settings.platformStatus))
      ? String(settings.platformStatus) : "not-configured";
    const effectiveStatus = activeIncident?.status || declaredStatus;
    res.json({
      data: {
        apiService: "online",
        platformStatus: effectiveStatus,
        maintenanceStatus: effectiveStatus === "maintenance" ? "active" : "not-active-or-not-configured",
        fullServiceHealth: activeIncident || declaredStatus !== "not-configured" ? "administrator-declared" : "not-configured",
        maintenanceMessage: activeIncident?.message || String(settings.maintenanceMessage || ""),
        activeIncident: activeIncident ? {
          id: activeIncident.id, title: activeIncident.title, startsAt: activeIncident.startsAt,
          affectedServices: (() => { try { return JSON.parse(activeIncident.affectedServicesJson) as string[]; } catch { return []; } })(),
        } : null,
      },
      meta: { checkedAt: new Date().toISOString(), source: activeIncident ? "active-incident" : declaredStatus !== "not-configured" ? "administrator-setting" : "api-route-health", note: "Application status is an administrator-declared state until real health probes are configured." },
    });
  }));
}
