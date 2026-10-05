import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderOAuthRoutes } from "./providerOAuth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { createLocalCustomer, getUserByEmail, runAutoTradeCycle } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { createLocalSession, passwordHash, verifyPassword } from "./localAuth";
import { getTicketUploadPolicy } from "../db";
import { ensureMarketDrivenOpportunities, refreshMarketData } from "../marketSync";
import { serveStatic, setupVite } from "./vite";
import { openTransactionConsoleSession } from "../transactionConsole";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const setLocalSession = (req: express.Request, res: express.Response, user: { id: number }) => {
    res.cookie(COOKIE_NAME, createLocalSession(user.id), { ...getSessionCookieOptions(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
  };
  app.post("/api/customer/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string" || password.length < 12) return res.status(400).json({ error: "Use an email and a password of at least 12 characters" });
      const user = await createLocalCustomer({ email, passwordHash: passwordHash(password), name: `${firstName || ""} ${lastName || ""}`.trim() || email });
      setLocalSession(req, res, user);
      await openTransactionConsoleSession(req, res, user.id);
      return res.json({ user });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to register" });
    }
  });
  app.post("/api/customer/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await getUserByEmail(String(email || ""));
      if (!user || user.role !== "user" || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ error: "Invalid email or password" });
      setLocalSession(req, res, user);
      await openTransactionConsoleSession(req, res, user.id);
      return res.json({ user });
    } catch {
      return res.status(503).json({ error: "Authentication service is not configured. Configure DATABASE_URL and run the migrations." });
    }
  });
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await getUserByEmail(String(email || ""));
      if (!user || user.role !== "admin" || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ error: "Invalid administrator credentials" });
      setLocalSession(req, res, user);
      await openTransactionConsoleSession(req, res, user.id);
      return res.json({ user });
    } catch {
      return res.status(503).json({ error: "Authentication service is not configured. Configure DATABASE_URL and run the migrations." });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  app.post("/api/support/attachments/presign", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
      const { fileName, mimeType, sizeBytes } = req.body ?? {};
      const policy = await getTicketUploadPolicy();
      const mimeAllowed = policy.allowedMimeTypes.some(rule => rule === mimeType || (rule.endsWith("/*") && mimeType.startsWith(rule.slice(0, -1))) || (rule.startsWith(".") && fileName.toLowerCase().endsWith(rule.toLowerCase())));
      if (typeof fileName !== "string" || typeof mimeType !== "string" || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > policy.maxAttachmentMb * 1_000_000 || !mimeAllowed) return res.status(400).json({ error: `Attachment rejected. Maximum ${policy.maxAttachmentMb} MB. Allowed: ${policy.allowedMimeTypes.join(", ")}` });
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const key = `support/${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safeName}`;
      const base = process.env.MANUS_API_URL;
      const token = process.env.MANUS_API_KEY;
      if (!base || !token) return res.status(503).json({ error: "Managed storage is not configured" });
      const upstream = await fetch(`${base}/v1/storage/presign/put?path=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await upstream.json() as { url?: string; error?: string };
      if (!upstream.ok || !payload.url) return res.status(502).json({ error: payload.error || "Unable to prepare managed upload" });
      return res.json({ uploadUrl: payload.url, storageKey: key, stableUrl: `/manus-storage/${key}` });
    } catch (error) { return res.status(401).json({ error: error instanceof Error ? error.message : "Authentication required" }); }
  });
  registerOAuthRoutes(app);
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
    const autoTradeTimer = setInterval(() => { void runAutoTradeCycle().catch(error => console.error("[AutoTrade]", error instanceof Error ? error.message : error)); }, 30_000);
    autoTradeTimer.unref();
    void runAutoTradeCycle().catch(error => console.error("[AutoTrade]", error instanceof Error ? error.message : error));
    const marketSyncTimer = setInterval(() => { void refreshMarketData().then(() => ensureMarketDrivenOpportunities()).catch(error => console.error("[MarketSync]", error instanceof Error ? error.message : error)); }, 10 * 60_000);
    marketSyncTimer.unref();
    void refreshMarketData().then(() => ensureMarketDrivenOpportunities()).then(result => console.log("[MarketSync] ready", result)).catch(error => console.error("[MarketSync]", error instanceof Error ? error.message : error));
  } else {
    console.warn("[Database] DATABASE_URL is not configured; database workers are paused until production configuration is supplied.");
  }
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
