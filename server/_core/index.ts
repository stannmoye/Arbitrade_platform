import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderOAuthRoutes } from "./providerOAuth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { createLocalCustomer, getUserByEmail } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { getTicketUploadPolicy } from "../db";
import { registerV5Api } from "../v5-api";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const demoPassword = (role: "customer" | "admin") => process.env[`V5_DEMO_${role.toUpperCase()}_PASSWORD`] || (role === "admin" ? "Arbitrade-Admin-2026!" : "Arbitrade-Customer-2026!");
  const demoEmail = (role: "customer" | "admin") => process.env[`V5_DEMO_${role.toUpperCase()}_EMAIL`] || (role === "admin" ? "admin@arbitrade.test" : "customer@arbitrade.test");
  app.post("/api/v5/auth/login", (req, res) => {
    const role = req.body?.role === "admin" ? "admin" : "customer";
    const email = String(req.body?.email || "");
    const password = String(req.body?.password || "");
    if (email !== demoEmail(role) || password !== demoPassword(role)) return res.status(401).json({ error: "Invalid practice credentials" });
    res.cookie("v5_demo_session", role, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ role, email });
  });
  app.get("/api/v5/auth/session", (req, res) => {
    const role = req.headers.cookie?.match(/(?:^|;\s*)v5_demo_session=(customer|admin)(?:;|$)/)?.[1];
    return res.json({ authenticated: Boolean(role), role: role || null });
  });
  app.post("/api/v5/auth/logout", (_req, res) => { res.clearCookie("v5_demo_session"); return res.json({ ok: true }); });
  app.use("/api/v5", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    const role = req.headers.cookie?.match(/(?:^|;\s*)v5_demo_session=(customer|admin)(?:;|$)/)?.[1];
    if (!role) return res.status(401).json({ error: "Practice login required" });
    if (req.path.startsWith("/admin/") && role !== "admin") return res.status(403).json({ error: "Admin practice role required" });
    return next();
  });
  const hashPassword=(password:string)=>crypto.scryptSync(password, process.env.PASSWORD_PEPPER || "arbitrade-local-pepper", 32).toString("hex");
  app.post("/api/customer/register", async (req,res)=>{try{const {email,password,firstName,lastName}=req.body||{};if(typeof email!=="string"||typeof password!=="string"||password.length<10)return res.status(400).json({error:"Use an email and a password of at least 10 characters"});const user=await createLocalCustomer({email,passwordHash:hashPassword(password),name:`${firstName||""} ${lastName||""}`.trim()||email});const token=await sdk.createSessionToken(user.openId,{name:user.name||email});res.cookie(COOKIE_NAME,token,getSessionCookieOptions(req));return res.json({user});}catch(error){return res.status(400).json({error:error instanceof Error?error.message:"Unable to register"});}});
  app.post("/api/customer/login", async (req,res)=>{try{const {email,password}=req.body||{};const user=await getUserByEmail(String(email||""));if(!user?.passwordHash||hashPassword(String(password||""))!==user.passwordHash)return res.status(401).json({error:"Invalid email or password"});const token=await sdk.createSessionToken(user.openId,{name:user.name||user.email||"Customer"});res.cookie(COOKIE_NAME,token,getSessionCookieOptions(req));return res.json({user});}catch(error){return res.status(401).json({error:"Unable to sign in"});}});

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
  registerV5Api(app);
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
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
