import "dotenv/config";
import express from "express";
import { randomBytes } from "node:crypto";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerProviderOAuthRoutes } from "./providerOAuth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { countOutstandingTrades, createLocalCustomer, getAppSetting, getCustomerTicket, getUserByEmail, getUserById, processNotificationCampaignLifecycle, runAutoTradeCycle } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { configuredAuthRateLimitStore, createAuthRateLimiter } from "./authRateLimit";
import { isAllowedAttachmentRequest } from "./attachmentPolicy";
import { createLocalSession, passwordHash, verifyPassword } from "./localAuth";
import { writeStorageObject } from "../storage";
import { getTicketUploadPolicy } from "../db";
import { ensureMarketDrivenOpportunities, refreshMarketData } from "../marketSync";
import { serveStatic, setupVite } from "./vite";
import { openTransactionConsoleSession } from "../transactionConsole";
import { runOpportunityRetention } from "../opportunityLifecycle";
import { getLocalSessionFromRequest } from "./localAuth";
import { confirmEmailVerification, requestEmailVerification, requestPasswordReset, resetPasswordWithCode } from "../emailAuth";
import { startEmailWorkers } from "../emailQueue";
import { startHeartbeatWorker } from "./heartbeat";
import { registerLocalStorageRoutes } from "./localStorageRoutes";
import { refreshMiningPriceFeeds } from "../mining-admin";
import { runMiningWorkerCycle } from "../mining";

const registrationRateLimit = createAuthRateLimiter({ windowMs: 60 * 60_000, max: 5, message: "Too many registration attempts. Try again later.", store: configuredAuthRateLimitStore, scope: "customer-register" });
const customerLoginRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 10, message: "Too many login attempts. Try again later.", store: configuredAuthRateLimitStore, scope: "customer-login" });
const adminLoginRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 8, message: "Too many administrator login attempts. Try again later.", store: configuredAuthRateLimitStore, scope: "admin-login" });
const supportAttachmentPrepareUploadRateLimit = createAuthRateLimiter({ windowMs: 60_000, max: 20, message: "Too many support attachment requests. Try again shortly.", store: configuredAuthRateLimitStore, scope: "support-attachment-prepare-upload" });
const passwordResetRequestRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 5, message: "Too many password-reset requests. Try again later.", store: configuredAuthRateLimitStore, scope: "password-reset-request" });
const passwordResetConfirmRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 10, message: "Too many password-reset attempts. Try again later.", store: configuredAuthRateLimitStore, scope: "password-reset-confirm" });
const emailVerificationRequestRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 5, message: "Too many email-verification requests. Try again later.", store: configuredAuthRateLimitStore, scope: "email-verification-request" });
const emailVerificationConfirmRateLimit = createAuthRateLimiter({ windowMs: 15 * 60_000, max: 10, message: "Too many email-verification attempts. Try again later.", store: configuredAuthRateLimitStore, scope: "email-verification-confirm" });

async function startServer() {
  const app = express();
  registerLocalStorageRoutes(app);
  if (process.env.NODE_ENV === "production" && !configuredAuthRateLimitStore) {
    console.warn("[AuthRateLimit] Using process-local counters. Configure AUTH_RATE_LIMIT_REDIS_REST_URL and AUTH_RATE_LIMIT_REDIS_REST_TOKEN for multi-instance deployments.");
  }
  // Use safe direct-client mode by default. Do not trust forwarded headers
  // unless the actual reverse-proxy topology has been verified by the operator.
  app.set("trust proxy", false);
  const server = createServer(app);
  // Rate-limit local upload preparation requests before JSON parsing so oversized request
  // bodies cannot consume parser resources before the route limiter runs.
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/api/support/attachments/prepare-upload") {
      return supportAttachmentPrepareUploadRateLimit(req, res, next);
    }
    return next();
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const setLocalSession = (req: express.Request, res: express.Response, user: { id: number; authVersion?: number }) => {
    res.cookie(COOKIE_NAME, createLocalSession(user.id, user.authVersion || 0), { ...getSessionCookieOptions(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
  };
  app.post("/api/customer/register", registrationRateLimit, async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string" || password.length < 12) return res.status(400).json({ error: "Use an email and a password of at least 12 characters" });
      const user = await createLocalCustomer({ email, passwordHash: passwordHash(password), name: `${firstName || ""} ${lastName || ""}`.trim() || email });
      setLocalSession(req, res, user);
      void requestEmailVerification(user.id).catch(error => console.error("[Email] Registration verification enqueue failed:", error instanceof Error ? error.name : "UnknownError"));
      await openTransactionConsoleSession(req, res, user.id);
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to register" });
    }
  });
  app.post("/api/customer/login", customerLoginRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await getUserByEmail(String(email || ""));
      // Administrators may sign into their own customer workspace; authorization remains database-role based.
      if (!user || (user.role !== "user" && user.role !== "admin") || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ error: "Invalid email or password" });
      setLocalSession(req, res, user);
      await openTransactionConsoleSession(req, res, user.id);
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch {
      return res.status(503).json({ error: "Authentication service is not configured. Configure DATABASE_URL and run the migrations." });
    }
  });
  app.post("/api/admin/login", adminLoginRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await getUserByEmail(String(email || ""));
      if (!user || user.role !== "admin" || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ error: "Invalid administrator credentials" });
      setLocalSession(req, res, user);
      await openTransactionConsoleSession(req, res, user.id);
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch {
      return res.status(503).json({ error: "Authentication service is not configured. Configure DATABASE_URL and run the migrations." });
    }
  });
  app.post("/api/customer/password-reset/request", passwordResetRequestRateLimit, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    await requestPasswordReset(email);
    return res.status(202).json({ message: "If the account exists and email delivery is configured, a reset code will be sent." });
  });
  app.post("/api/customer/password-reset/confirm", passwordResetConfirmRateLimit, async (req, res) => {
    try {
      const { email, code, password } = req.body || {};
      if (typeof email !== "string" || typeof code !== "string" || typeof password !== "string") return res.status(400).json({ error: "Email, reset code and new password are required" });
      await resetPasswordWithCode(email, code, password);
      return res.json({ success: true });
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "The reset code is invalid or expired" }); }
  });
  app.post("/api/customer/email-verification/request", emailVerificationRequestRateLimit, async (req, res) => {
    const session = getLocalSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: "Authentication required" });
    const user = await getUserById(session.userId);
    if (!user || Number(user.authVersion || 0) !== session.authVersion) return res.status(401).json({ error: "Authentication required" });
    await requestEmailVerification(session.userId);
    return res.status(202).json({ message: "If email delivery is configured, a verification code will be sent." });
  });
  app.post("/api/customer/email-verification/confirm", emailVerificationConfirmRateLimit, async (req, res) => {
    const session = getLocalSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: "Authentication required" });
    try {
      const user = await getUserById(session.userId);
      if (!user || Number(user.authVersion || 0) !== session.authVersion) return res.status(401).json({ error: "Authentication required" });
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      await confirmEmailVerification(session.userId, code);
      return res.json({ success: true });
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "The verification code is invalid or expired" }); }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  const resolveLocalSupportUser = async (req: express.Request, res: express.Response) => {
    const session = getLocalSessionFromRequest(req);
    if (!session) { res.status(401).json({ error: "Authentication required" }); return null; }
    const user = await getUserById(session.userId);
    if (!user || Number(user.authVersion ?? 0) !== Number(session.authVersion ?? 0) || user.loginMethod === "closed") {
      res.status(401).json({ error: "Authentication required" });
      return null;
    }
    return user;
  };

  app.post("/api/support/attachments/prepare-upload", async (req, res) => {
    try {
      const user = await resolveLocalSupportUser(req, res);
      if (!user) return;
      const { ticketId, fileName, mimeType, sizeBytes } = req.body ?? {};
      if (!Number.isSafeInteger(ticketId) || ticketId < 1 || typeof fileName !== "string" || typeof mimeType !== "string" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
        return res.status(400).json({ error: "A valid support attachment is required" });
      }
      if (!(await getCustomerTicket(user.id, ticketId))) return res.status(404).json({ error: "Ticket not found" });
      const policy = await getTicketUploadPolicy();
      if (!isAllowedAttachmentRequest({ fileName, mimeType, sizeBytes }, policy)) {
        return res.status(400).json({ error: `Attachment rejected. Maximum ${policy.maxAttachmentMb} MB. Allowed: ${policy.allowedMimeTypes.join(", ")}` });
      }
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
      const key = `support/${ticketId}/${randomBytes(24).toString("hex")}-${safeName}`;
      res.set("Cache-Control", "no-store, private");
      return res.json({ uploadUrl: `/api/support/attachments/upload?key=${encodeURIComponent(key)}`, storageKey: key, stableUrl: `/storage/${key}` });
    } catch (error) {
      console.error("[SupportAttachmentUpload] Could not prepare local upload", error instanceof Error ? error.name : "UnknownError");
      return res.status(503).json({ error: "Unable to prepare local upload. Please retry." });
    }
  });

  app.put("/api/support/attachments/upload", express.raw({ type: "*/*", limit: "100mb" }), async (req, res) => {
    try {
      const user = await resolveLocalSupportUser(req, res);
      if (!user) return;
      const key = typeof req.query.key === "string" ? req.query.key : "";
      const match = /^support\/(\d+)\/([a-f0-9]{48})-([A-Za-z0-9._-]{1,120})$/.exec(key);
      if (!match) return res.status(400).json({ error: "Invalid local storage key" });
      const ticketId = Number(match[1]);
      if (!(await getCustomerTicket(user.id, ticketId))) return res.status(404).json({ error: "Ticket not found" });
      if (!Buffer.isBuffer(req.body) || req.body.length < 1) return res.status(400).json({ error: "The uploaded file is empty" });
      const mimeType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();
      const fileName = match[3];
      const policy = await getTicketUploadPolicy();
      if (!isAllowedAttachmentRequest({ fileName, mimeType, sizeBytes: req.body.length }, policy)) {
        return res.status(400).json({ error: `Attachment rejected. Maximum ${policy.maxAttachmentMb} MB. Allowed: ${policy.allowedMimeTypes.join(", ")}` });
      }
      await writeStorageObject(key, req.body, mimeType);
      res.set("Cache-Control", "no-store, private");
      return res.status(201).json({ success: true, storageKey: key });
    } catch (error) {
      console.error("[SupportAttachmentUpload] Local disk write failed", error instanceof Error ? error.name : "UnknownError");
      const errorCode = error && typeof error === "object" ? (error as NodeJS.ErrnoException).code : undefined;
      const message = errorCode === "EEXIST" ? "Upload key already exists" : "Unable to save the attachment";
      return res.status(500).json({ error: message });
    }
  });
  registerProviderOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  if (process.env.DATABASE_URL) {
    startEmailWorkers();
    startHeartbeatWorker();
    let notificationCampaignCycleRunning = false;
    const runNotificationCampaignCycle = async () => {
      if(notificationCampaignCycleRunning)return;
      notificationCampaignCycleRunning=true;
      try {
        const result=await processNotificationCampaignLifecycle();
        if(result.expired||result.published||result.failed)console.log("[NotificationCampaigns] lifecycle",result);
      } catch(error) {
        const details = error && typeof error === "object" ? error as { name?: unknown; message?: unknown; code?: unknown; table?: unknown } : {};
        const message = typeof details.message === "string"
          ? details.message.replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]").slice(0, 500)
          : "No error message was provided";
        const code = details.code == null ? undefined : String(details.code).replace(/[^A-Z0-9_]/gi, "").slice(0, 80);
        const table = details.table == null ? undefined : String(details.table).replace(/[^A-Z0-9_]/gi, "").slice(0, 120);
        console.error("[NotificationCampaigns] lifecycle failed", {
          name: typeof details.name === "string" ? details.name.slice(0, 80) : "UnknownError",
          code,
          table,
          message,
        });
      } finally { notificationCampaignCycleRunning=false; }
    };
    const notificationCampaignTimer=setInterval(()=>{void runNotificationCampaignCycle();},30_000);
    notificationCampaignTimer.unref();
    void runNotificationCampaignCycle();
    let miningCycleRunning = false;
    const runMiningCycle = async () => {
      if (miningCycleRunning) return;
      miningCycleRunning = true;
      try {
        const result = await runMiningWorkerCycle();
        if (result.intervalsProcessed || result.conversionJobs.completed || result.conversionJobs.retrying) console.log("[MiningWorker] cycle", result);
      } catch (error) { console.error("[MiningWorker]", error instanceof Error ? error.message : error); }
      finally { miningCycleRunning = false; }
    };
    const miningWorkerTimer = setInterval(() => { void runMiningCycle(); }, 30_000);
    miningWorkerTimer.unref();
    void runMiningCycle();
    const miningFeedTimer = setInterval(() => { void refreshMiningPriceFeeds().then(result => console.log("[MiningFeeds] refreshed", result)).catch(error => console.error("[MiningFeeds]", error instanceof Error ? error.message : error)); }, 5 * 60_000);
    miningFeedTimer.unref();
    const popupRetentionTimer = setInterval(() => { void runOpportunityRetention().then(result => { if (result.deletedEvents || result.deletedDeliveryRows) console.log("[PopupRetention] archived and removed", result); }).catch(error => console.error("[PopupRetention]", error instanceof Error ? error.message : error)); }, 60 * 60_000);
    popupRetentionTimer.unref();
    void runOpportunityRetention().catch(error => console.error("[PopupRetention]", error instanceof Error ? error.message : error));
    const runTradeCycle = async () => {
      const result = await runAutoTradeCycle();
      const outstandingTrades = await countOutstandingTrades();
      const opportunities = await ensureMarketDrivenOpportunities(new Date());
      console.log("[AutoTrade] cycle", { ...result, outstandingTrades, opportunities });
    };
    const autoTradeTimer = setInterval(() => { void runTradeCycle().catch(error => console.error("[AutoTrade]", error instanceof Error ? error.message : error)); }, 30_000);
    autoTradeTimer.unref();
    void runTradeCycle().catch(error => console.error("[AutoTrade]", error instanceof Error ? error.message : error));
    const refreshMinutes = Number(await getAppSetting("market.refreshIntervalMinutes", "120"));
    if (!Number.isFinite(refreshMinutes) || refreshMinutes < 1) { console.error("[MarketSync] Invalid market.refreshIntervalMinutes; using safe 120-minute fallback"); }
    const safeRefreshMinutes = Number.isFinite(refreshMinutes) && refreshMinutes >= 1 ? refreshMinutes : 120;
    const runMarketRefresh = async () => { const result = await refreshMarketData(); const opportunities = await ensureMarketDrivenOpportunities(result.refreshedAt); console.log("[MarketSync] refreshed", { ...result, opportunities }); };
    const marketSyncTimer = setInterval(() => { void runMarketRefresh().catch(error => console.error("[MarketSync]", error instanceof Error ? error.message : error)); }, safeRefreshMinutes * 60_000);
    marketSyncTimer.unref();
    void runMarketRefresh().catch(error => console.error("[MarketSync]", error instanceof Error ? error.message : error));
  } else {
    console.warn("[Database] DATABASE_URL is not configured; database workers are paused until production configuration is supplied.");
  }
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
