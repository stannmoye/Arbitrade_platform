import crypto from "node:crypto";
import { sendRenderedEmail } from "./email";
import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

const STAGES = ["EMAIL", "PHONE", "ADDRESS", "IDENTITY_DOCUMENT", "FACE_LIVENESS"] as const;
const stageNames: Record<string, string> = { EMAIL: "Email", PHONE: "Phone", ADDRESS: "Address", IDENTITY_DOCUMENT: "Identity document", FACE_LIVENESS: "Live face & liveness" };
let pool: Pool | null = null;
function db() { if (!pool) { if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured"); pool = mysql.createPool(process.env.DATABASE_URL); } return pool; }
async function rows<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []) { const [result] = await db().query<T[]>(sql, params); return result; }
async function exec(sql: string, params: unknown[] = []) { const [result] = await db().execute<ResultSetHeader>(sql, params); return result; }
function hmac(value: string) { return crypto.createHmac("sha256", process.env.PASSWORD_PEPPER || process.env.SESSION_SECRET || "development-only").update(value).digest("hex"); }
function hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function id() { return crypto.randomBytes(24).toString("hex"); }
function safeJson(value: unknown) { return JSON.stringify(value).slice(0, 100000); }
async function audit(event: string, profileId: number | null, customerId: number | null, actorId: number | null, actorType: string, result?: string, reason?: string, sessionId?: string, provider?: string, providerVersion?: string, payload?: unknown) {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET time_zone = '+00:00'");
    const [previousRows] = await connection.query("SELECT recordHash FROM kyc_audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE");
    const previousHash = (previousRows as any[])[0]?.recordHash || "GENESIS";
    const [timeRows] = await connection.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt");
    const createdAt = String((timeRows as any[])[0]?.createdAt || new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"));
    const payloadJson = safeJson(payload || {});
    const recordHash = hash([previousHash, event, profileId, customerId, actorId, actorType, result || "", reason || "", sessionId || "", createdAt, payloadJson].join("|"));
    const sqlTimestamp = createdAt.replace("T", " ").replace(".000Z", "");
    await connection.execute("INSERT INTO kyc_audit_logs (event,profileId,customerId,actorId,actorType,result,reason,sessionId,provider,providerVersion,payloadJson,previousHash,recordHash,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [event, profileId, customerId, actorId, actorType, result || null, reason || null, sessionId || null, provider || null, providerVersion || null, payloadJson, previousHash, recordHash, sqlTimestamp]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function profileFor(userId: number) {
  const found = await rows<{ id: number; userId: number; currentLevel: string; overallStatus: string; riskLevel: string; grandfathered: number } & RowDataPacket>("SELECT * FROM kyc_profiles WHERE userId=? LIMIT 1", [userId]);
  if (found[0]) return found[0];
  const result = await exec("INSERT INTO kyc_profiles (userId) VALUES (?)", [userId]);
  const profileId = result.insertId;
  for (const stage of STAGES) await exec("INSERT INTO kyc_stage_states (profileId,stageCode) VALUES (?,?)", [profileId, stage]);
  await audit("KYC_STARTED", Number(profileId), userId, userId, "CUSTOMER", "PASS");
  return (await rows<any>("SELECT * FROM kyc_profiles WHERE id=?", [profileId]))[0];
}
async function stageRows(profileId: number) { return rows<any>("SELECT s.stageCode,s.state,s.source,s.verifiedAt,s.failureReason, k.name,k.description,k.whyRequired,k.rank FROM kyc_stage_states s JOIN kyc_stages k ON k.code=s.stageCode WHERE s.profileId=? ORDER BY k.rank", [profileId]); }
function levelFor(stages: any[]) { const verified = new Set(stages.filter(s => s.state === "VERIFIED").map(s => s.stageCode)); if (verified.has("FACE_LIVENESS")) return "L4"; if (verified.has("IDENTITY_DOCUMENT")) return "L3"; if (verified.has("ADDRESS")) return "L2"; if (verified.has("PHONE")) return "L1"; return verified.has("EMAIL") ? "L0" : "L0"; }
function overall(stages: any[]) { if (stages.some(s => s.state === "REVIEW_REQUIRED")) return "REVIEW_REQUIRED"; if (stages.some(s => s.state === "REJECTED")) return "REJECTED"; if (stages.some(s => s.state === "FAILED")) return "RETRY_AVAILABLE"; if (stages.every(s => s.state === "VERIFIED")) return "VERIFIED"; if (stages.some(s => ["IN_PROGRESS", "PROCESSING"].includes(s.state))) return "IN_PROGRESS"; return "NOT_STARTED"; }
async function syncProfile(profileId: number) { const stages = await stageRows(profileId); const level = levelFor(stages); const status = overall(stages); await exec("UPDATE kyc_profiles SET currentLevel=?,overallStatus=? WHERE id=?", [level, status, profileId]); return { level, status, stages }; }
function ensureTransition(from: string, to: string) { const allowed: Record<string, string[]> = { NOT_STARTED: ["IN_PROGRESS"], IN_PROGRESS: ["PROCESSING", "FAILED", "REVIEW_REQUIRED"], PROCESSING: ["VERIFIED", "FAILED", "REVIEW_REQUIRED"], REVIEW_REQUIRED: ["VERIFIED", "REJECTED"], FAILED: ["RETRY_AVAILABLE"], RETRY_AVAILABLE: ["IN_PROGRESS"], VERIFIED: ["EXPIRED"], EXPIRED: ["IN_PROGRESS"] }; if (!allowed[from]?.includes(to)) throw new Error(`Illegal KYC transition ${from} → ${to}`); }
async function assertStageReady(profileId: number, stage: string) { const index = STAGES.indexOf(stage as any); if (index < 0) throw new Error("Unknown KYC stage"); if (index === 0) return; const required = STAGES.slice(0, index); const states = await rows<any>(`SELECT stageCode,state FROM kyc_stage_states WHERE profileId=? AND stageCode IN (${required.map(() => "?").join(",")})`, [profileId, ...required]); const stateByStage = new Map(states.map((x: any) => [x.stageCode, x.state])); const blocked = required.find((code) => stateByStage.get(code) !== "VERIFIED"); if (blocked) throw new Error(`Complete ${stageNames[blocked] || blocked} before continuing to ${stageNames[stage] || stage}.`); }
async function prepareStage(profileId: number, userId: number, stage: string) { await assertStageReady(profileId, stage); const current = (await rows<any>("SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=?", [profileId, stage]))[0]; if (current?.state === "NOT_STARTED" || current?.state === "RETRY_AVAILABLE") await transition(profileId, userId, stage, "IN_PROGRESS", "AUTOMATED"); }
async function transition(profileId: number, userId: number, stage: string, next: string, source: string, reason?: string, sessionId?: string) {
  const current = (await rows<any>("SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE", [profileId, stage]))[0];
  if (!current) throw new Error("Unknown KYC stage");
  ensureTransition(current.state, next);
  await exec("UPDATE kyc_stage_states SET state=?,source=?,verifiedAt=?,failureReason=?,lastAttemptAt=NOW() WHERE profileId=? AND stageCode=?", [next, source, next === "VERIFIED" ? new Date() : null, reason || null, profileId, stage]);
  if (next === "REVIEW_REQUIRED") await exec("INSERT INTO kyc_manual_reviews (profileId,stageCode,status,reason) VALUES (?,?,?,?)", [profileId, stage, "OPEN", reason || "Evidence requires manual review"]);
  await audit(next === "VERIFIED" ? "STAGE_APPROVED" : next === "REJECTED" ? "STAGE_REJECTED" : `${stage}_STATE_CHANGED`, profileId, userId, source === "ADMIN" ? null : userId, source === "ADMIN" ? "ADMIN" : "CUSTOMER", next, reason, sessionId);
  return syncProfile(profileId);
}
export async function getCenter(userId: number) { const profile = await profileFor(userId); const current = await syncProfile(profile.id); const consent = await rows<any>("SELECT purpose,version,consentedAt FROM kyc_consents WHERE profileId=? ORDER BY id DESC LIMIT 1", [profile.id]); return { profile: { ...profile, overallStatus: current.status, currentLevel: current.level }, stages: current.stages, consent: consent[0] || null, demoOnly: process.env.NODE_ENV !== "production", customerMessages: { email: "Verify your email address so we can confirm that you control this account.", phone: "Verify your phone number to protect your account and enable secure account recovery.", address: "Provide your residential address so we can establish where you live." } }; }
export async function startStage(userId: number, stage: string, idempotencyKey: string, deviceMetadata?: unknown) { if (!STAGES.includes(stage as any)) throw new Error("Unknown KYC stage"); const profile = await profileFor(userId); await assertStageReady(profile.id, stage); const prior = await rows<any>("SELECT * FROM kyc_attempts WHERE idempotencyKey=? LIMIT 1", [idempotencyKey]); if (prior[0]) return prior[0]; const sessionId = id(); await exec("INSERT INTO kyc_verification_sessions (id,profileId,expiresAt,deviceMetadata) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 20 MINUTE),?)", [sessionId, profile.id, safeJson(deviceMetadata || {})]); const attempt = await exec("INSERT INTO kyc_attempts (sessionId,profileId,stageCode,idempotencyKey) VALUES (?,?,?,?)", [sessionId, profile.id, stage, idempotencyKey]); const current = (await rows<any>("SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=?", [profile.id, stage]))[0]; if (current.state === "NOT_STARTED" || current.state === "RETRY_AVAILABLE") await transition(profile.id, userId, stage, "IN_PROGRESS", "AUTOMATED", undefined, sessionId); await audit("KYC_STAGE_STARTED", profile.id, userId, userId, "CUSTOMER", "PROCESSING", undefined, sessionId); return { sessionId, attemptId: Number(attempt.insertId), stage, expiresInSeconds: 1200 }; }
export async function issueEmail(userId: number) { const profile = await profileFor(userId); const token = crypto.randomBytes(24).toString("hex"); await exec("UPDATE kyc_email_verifications SET usedAt=NOW() WHERE profileId=? AND usedAt IS NULL", [profile.id]); await exec("INSERT INTO kyc_email_verifications (profileId,tokenHash,expiresAt) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 15 MINUTE))", [profile.id, hash(token)]); const userRows = await rows<any>("SELECT u.email,u.name FROM users u JOIN kyc_profiles p ON p.userId=u.id WHERE p.id=? LIMIT 1", [profile.id]);
  const recipient = userRows[0]?.email;
  if (recipient) { const base = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""); const link = `${base}/customer?kyc_token=${token}`; try { await sendRenderedEmail(recipient, { subject: "Verify your WiseBond email", text: `Hello ${userRows[0]?.name || "Customer"}, use this secure link to continue your KYC verification: ${link}. It expires in 15 minutes.`, html: `<div style="font-family:Arial,sans-serif"><h2>Verify your email address</h2><p>Hello ${userRows[0]?.name || "Customer"}, use the secure link below to continue your KYC verification.</p><p><a href="${link}">Verify my email</a></p><p>This link expires in 15 minutes.</p></div>` }); } catch (error) { if (process.env.NODE_ENV === "production") throw error; console.warn("[KYC DEV EMAIL] transport unavailable; use the returned development token", error instanceof Error ? error.message : error); } }
  if (process.env.NODE_ENV !== "production") console.log(`[KYC DEV EMAIL] ${userId}: ${token}`); return { sent: true, developmentToken: process.env.NODE_ENV === "production" ? undefined : token }; }
export async function verifyEmail(userId: number, token: string) { const profile = await profileFor(userId); const found = await rows<any>("SELECT * FROM kyc_email_verifications WHERE profileId=? AND tokenHash=? AND usedAt IS NULL AND expiresAt>NOW() ORDER BY id DESC LIMIT 1", [profile.id, hash(token)]); if (!found[0]) throw new Error("Invalid or expired email verification token"); await exec("UPDATE kyc_email_verifications SET usedAt=NOW() WHERE id=?", [found[0].id]); await exec("UPDATE customer_controls SET emailVerified=1 WHERE userId=?", [userId]); return transition(profile.id, userId, "EMAIL", "VERIFIED", "AUTOMATED"); }
export async function issuePhone(userId: number, phone: string) { const profile = await profileFor(userId); const otp = String(crypto.randomInt(100000, 1000000)); await exec("UPDATE kyc_phone_verifications SET usedAt=NOW() WHERE profileId=? AND usedAt IS NULL", [profile.id]); await exec("INSERT INTO kyc_phone_verifications (profileId,phone,otpHmac,expiresAt,resendAfter) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),DATE_ADD(NOW(),INTERVAL 60 SECOND))", [profile.id, phone, hmac(`${profile.id}:${otp}`)]); if (process.env.NODE_ENV !== "production") console.log(`[KYC DEV SMS] ${phone}: ${otp}`); return { sent: true, developmentOtp: process.env.NODE_ENV === "production" ? undefined : otp }; }
export async function verifyPhone(userId: number, otp: string) { const profile = await profileFor(userId); await assertStageReady(profile.id, "PHONE"); const found = await rows<any>("SELECT * FROM kyc_phone_verifications WHERE profileId=? AND usedAt IS NULL AND expiresAt>NOW() ORDER BY id DESC LIMIT 1", [profile.id]); if (!found[0] || found[0].attempts >= 5) throw new Error("Invalid or expired phone verification code"); const supplied = hmac(`${profile.id}:${otp}`); if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(found[0].otpHmac))) { await exec("UPDATE kyc_phone_verifications SET attempts=attempts+1 WHERE id=?", [found[0].id]); throw new Error("Invalid or expired phone verification code"); } await exec("UPDATE kyc_phone_verifications SET usedAt=NOW() WHERE id=?", [found[0].id]); return transition(profile.id, userId, "PHONE", "VERIFIED", "AUTOMATED"); }
export async function submitAddress(userId: number, input: any) { const profile = await profileFor(userId); await prepareStage(profile.id, userId, "ADDRESS"); await exec("INSERT INTO kyc_address_verifications (profileId,countryCode,stateProvince,city,district,addressLine,postalCode,method,status) VALUES (?,?,?,?,?,?,?,?,?)", [profile.id,input.countryCode,input.stateProvince || null,input.city,input.district || null,input.addressLine,input.postalCode || null,input.method || "DECLARATION", "MANUAL_REVIEW"]); await transition(profile.id, userId, "ADDRESS", "REVIEW_REQUIRED", "AUTOMATED", "Address declarations require verification"); await audit("ADDRESS_SUBMITTED", profile.id, userId, userId, "CUSTOMER", "REVIEW_REQUIRED"); return getCenter(userId); }
export async function recordConsent(userId: number, purpose: string, version: string, ip?: string) { const profile = await profileFor(userId); await exec("INSERT INTO kyc_consents (profileId,purpose,version,ipAddress) VALUES (?,?,?,?)", [profile.id,purpose,version,ip || null]); await audit("CONSENT_RECORDED", profile.id, userId, userId, "CUSTOMER", "PASS", undefined, undefined, undefined, undefined, { purpose, version }); return { success: true }; }
export async function submitDocument(userId: number, input: any) { const profile = await profileFor(userId); await prepareStage(profile.id, userId, "IDENTITY_DOCUMENT"); const numberHash = input.documentNumber ? hmac(String(input.documentNumber).trim().toUpperCase()) : null; const duplicate = numberHash ? await rows<any>("SELECT profileId FROM kyc_documents WHERE documentNumberHash=? AND profileId<>? LIMIT 1", [numberHash, profile.id]) : []; const result = await exec("INSERT INTO kyc_documents (profileId,documentType,countryCode,frontStorageKey,backStorageKey,documentNumberHash,status) VALUES (?,?,?,?,?,?,?)", [profile.id,input.documentType,input.countryCode,input.frontStorageKey,input.backStorageKey || null,numberHash,duplicate[0] ? "REVIEW_REQUIRED" : "PROCESSING"]); const documentId = Number(result.insertId); await exec("INSERT INTO kyc_document_extractions (documentId,fieldsJson,qualityJson,provider,providerVersion,outcome,confidence) VALUES (?,?,?,?,?,?,?)", [documentId, safeJson(input.fields || {}), safeJson({ serverRecheck: "NOT_ATTEMPTED", note: "Provider adapter not configured" }), "LOCAL_FALLBACK", "1.0", duplicate[0] ? "REVIEW_REQUIRED" : "NOT_ATTEMPTED", 0]); if (duplicate[0]) await audit("DUPLICATE_IDENTITY_FLAGGED", profile.id, userId, userId, "SYSTEM", "REVIEW_REQUIRED"); await transition(profile.id, userId, "IDENTITY_DOCUMENT", duplicate[0] ? "REVIEW_REQUIRED" : "REVIEW_REQUIRED", "AUTOMATED", duplicate[0] ? "Duplicate identity detected" : "Document queued for provider/manual review"); return { documentId, outcome: duplicate[0] ? "REVIEW_REQUIRED" : "REVIEW_REQUIRED", note: "OCR and authenticity are provider signals; this upload is not automatically authentic." }; }
export async function recordFace(userId: number, input: any) { const profile = await profileFor(userId); await assertStageReady(profile.id, "FACE_LIVENESS"); const session = await rows<any>("SELECT * FROM kyc_verification_sessions WHERE id=? AND profileId=? AND status='ACTIVE' AND expiresAt>NOW()", [input.sessionId,profile.id]); if (!session[0]) throw new Error("Verification session expired"); if (process.env.NODE_ENV === "production" && input.demo) throw new Error("Demo mode is disabled in production"); const outcome = input.demoOutcome === "pass" ? "PASS" : input.demoOutcome === "fail" ? "FAIL" : "REVIEW_REQUIRED"; await exec("INSERT INTO kyc_liveness_checks (profileId,sessionId,challengeJson,outcome,provider,providerVersion,confidence) VALUES (?,?,?,?,?,?,?)", [profile.id,input.sessionId,safeJson(input.challenge || {}),outcome,"DEMO_LOCAL","1.0",input.demo ? 0.9 : 0]); await exec("INSERT INTO kyc_face_verifications (profileId,sessionId,similarity,thresholdUsed,outcome,provider,providerVersion) VALUES (?,?,?,?,?,?,?)", [profile.id,input.sessionId,input.demo ? (outcome === "PASS" ? 0.9 : 0.3) : null,0.82,outcome,"DEMO_LOCAL","1.0"]); await exec("UPDATE kyc_verification_sessions SET status='COMPLETE' WHERE id=?", [input.sessionId]); if (outcome === "PASS") await transition(profile.id,userId,"FACE_LIVENESS","VERIFIED","PROVIDER",undefined,input.sessionId); else await transition(profile.id,userId,"FACE_LIVENESS","REVIEW_REQUIRED","PROVIDER","Liveness/face provider requires review",input.sessionId); await audit("FACE_MATCH_COMPLETED", profile.id, userId, userId, "CUSTOMER", outcome, undefined, input.sessionId, "DEMO_LOCAL", "1.0"); return getCenter(userId); }
const CORE_STAGES = ["EMAIL", "PHONE", "ADDRESS", "IDENTITY_DOCUMENT"] as const;

export async function adminQueue() {
  const profiles = await rows<any>(`SELECT p.id profileId,p.userId,p.overallStatus,p.currentLevel,p.riskLevel,p.updatedAt,u.email,u.name
    FROM kyc_profiles p JOIN users u ON u.id=p.userId
    WHERE u.role='user' AND EXISTS (SELECT 1 FROM kyc_stage_states s WHERE s.profileId=p.id AND s.state='REVIEW_REQUIRED')
    ORDER BY p.updatedAt DESC LIMIT 200`);
  const queue: any[] = [];
  for (const profile of profiles) {
    const stages = await stageRows(Number(profile.profileId));
    for (const stage of stages.filter((item: any) => item.state === "REVIEW_REQUIRED")) {
      let evidence: any = null;
      if (stage.stageCode === "ADDRESS") {
        evidence = (await rows<any>("SELECT countryCode,stateProvince,city,method,status,createdAt FROM kyc_address_verifications WHERE profileId=? ORDER BY id DESC LIMIT 1", [profile.profileId]))[0] || null;
      } else if (stage.stageCode === "IDENTITY_DOCUMENT") {
        evidence = (await rows<any>("SELECT documentType,countryCode,status,createdAt FROM kyc_documents WHERE profileId=? ORDER BY id DESC LIMIT 1", [profile.profileId]))[0] || null;
      } else if (stage.stageCode === "FACE_LIVENESS") {
        evidence = (await rows<any>("SELECT outcome,provider,confidence,createdAt FROM kyc_liveness_checks WHERE profileId=? ORDER BY id DESC LIMIT 1", [profile.profileId]))[0] || null;
      }
      queue.push({
        profileId: Number(profile.profileId),
        userId: Number(profile.userId),
        name: profile.name,
        email: profile.email,
        overallStatus: profile.overallStatus,
        currentLevel: profile.currentLevel,
        riskLevel: profile.riskLevel,
        updatedAt: profile.updatedAt,
        stageCode: stage.stageCode,
        stageName: stage.name || stageNames[stage.stageCode],
        stageState: stage.state,
        reviewEvidence: evidence,
      });
    }
  }
  return queue;
}

export async function adminDashboard() {
  const [countRows, reviewRows, stageMetrics] = await Promise.all([
    rows<any>(`SELECT COUNT(*) total,
      SUM(CASE WHEN COALESCE(p.overallStatus,'NOT_STARTED')='NOT_STARTED' THEN 1 ELSE 0 END) notStarted,
      SUM(CASE WHEN p.overallStatus='IN_PROGRESS' THEN 1 ELSE 0 END) inProgress,
      SUM(CASE WHEN p.overallStatus='VERIFIED' THEN 1 ELSE 0 END) verified,
      SUM(CASE WHEN p.riskLevel IN ('HIGH_RISK','CRITICAL_REVIEW') THEN 1 ELSE 0 END) highRisk
      FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id WHERE u.role='user'`),
    rows<any>(`SELECT COUNT(*) manualReview FROM kyc_stage_states s
      JOIN kyc_profiles p ON p.id=s.profileId JOIN users u ON u.id=p.userId
      WHERE u.role='user' AND s.state='REVIEW_REQUIRED'`),
    rows<any>(`SELECT s.stageCode,COUNT(*) started,
      SUM(CASE WHEN s.state='VERIFIED' THEN 1 ELSE 0 END) verified,
      SUM(CASE WHEN s.state='REVIEW_REQUIRED' THEN 1 ELSE 0 END) inReview,
      SUM(CASE WHEN s.state IN ('IN_PROGRESS','PROCESSING') THEN 1 ELSE 0 END) inProgress
      FROM kyc_stage_states s JOIN kyc_profiles p ON p.id=s.profileId
      JOIN users u ON u.id=p.userId WHERE u.role='user' GROUP BY s.stageCode`),
  ]);
  const count = countRows[0] || {};
  return { ...count, manualReview: Number(reviewRows[0]?.manualReview || 0), stageMetrics };
}

export async function adminCustomerDirectory(input: { page?: number; pageSize?: number; search?: string; status?: string } = {}) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(input.pageSize) || 25)));
  const search = String(input.search || "").trim().slice(0, 100);
  const allowedStatuses = new Set(["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "REVIEW_REQUIRED", "RETRY_AVAILABLE", "REJECTED"]);
  const status = input.status && allowedStatuses.has(input.status) ? input.status : "";
  let where = "WHERE u.role='user'";
  const params: unknown[] = [];
  if (search) {
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    where += " AND (COALESCE(u.name,'') LIKE ? OR COALESCE(u.email,'') LIKE ?)";
    params.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (status) { where += " AND COALESCE(p.overallStatus,'NOT_STARTED')=?"; params.push(status); }
  const [countRows, customers] = await Promise.all([
    rows<any>(`SELECT COUNT(*) total FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id ${where}`, params),
    rows<any>(`SELECT u.id customerId,u.email,u.name,u.packageName,p.id profileId,
      COALESCE(p.overallStatus,'NOT_STARTED') overallStatus,COALESCE(p.currentLevel,'L0') currentLevel,
      p.riskLevel,p.updatedAt FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id ${where}
      ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]),
  ]);
  const profileIds = customers.map((item: any) => Number(item.profileId)).filter((id: number) => id > 0);
  const stateRows = profileIds.length ? await rows<any>(`SELECT p.userId,s.stageCode,s.state,s.verifiedAt
    FROM kyc_profiles p JOIN kyc_stage_states s ON s.profileId=p.id
    WHERE p.id IN (${profileIds.map(() => "?").join(",")})`, profileIds) : [];
  const byUser = new Map<number, Map<string, any>>();
  for (const item of stateRows) {
    const userId = Number(item.userId);
    if (!byUser.has(userId)) byUser.set(userId, new Map());
    byUser.get(userId)!.set(item.stageCode, item);
  }
  const items = customers.map((customer: any) => {
    const states = byUser.get(Number(customer.customerId));
    const stages = STAGES.map(stageCode => ({
      stageCode,
      name: stageNames[stageCode],
      state: states?.get(stageCode)?.state || "NOT_STARTED",
      verifiedAt: states?.get(stageCode)?.verifiedAt || null,
      required: (CORE_STAGES as readonly string[]).includes(stageCode),
    }));
    const coreCompleted = stages.filter(stage => stage.required && stage.state === "VERIFIED").length;
    const nextStage = stages.find(stage => stage.required && stage.state !== "VERIFIED")?.stageCode || null;
    return {
      customerId: Number(customer.customerId),
      profileId: customer.profileId ? Number(customer.profileId) : null,
      email: customer.email,
      name: customer.name,
      packageName: customer.packageName,
      overallStatus: customer.overallStatus,
      currentLevel: customer.currentLevel,
      riskLevel: customer.riskLevel || "LOW_RISK",
      updatedAt: customer.updatedAt || null,
      stages,
      coreCompleted,
      coreRequired: CORE_STAGES.length,
      nextStage,
    };
  });
  const total = Number(countRows[0]?.total || 0);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminKycSettings(smtpConfigured: boolean) {
  const [stages, settingRows, providerRows] = await Promise.all([
    rows<any>("SELECT code,name,description,whyRequired,rank,enabled FROM kyc_stages ORDER BY rank"),
    rows<any>("SELECT settingKey,settingValue,updatedAt FROM kyc_settings ORDER BY settingKey"),
    rows<any>("SELECT capability,provider,enabled,healthStatus FROM kyc_provider_configs ORDER BY capability,priority"),
  ]);
  const raw = Object.fromEntries(settingRows.map((item: any) => [item.settingKey, item.settingValue]));
  const numberSetting = (key: string, fallback: number) => Number(raw[key] ?? fallback);
  return {
    draftOnly: true,
    stages: stages.map((stage: any) => ({ ...stage, required: (CORE_STAGES as readonly string[]).includes(stage.code), enabled: Boolean(stage.enabled) })),
    settings: {
      emailExpiryMinutes: numberSetting("email_expiry_minutes", 15),
      phoneExpiryMinutes: numberSetting("phone_expiry_minutes", 10),
      rawRetentionDays: numberSetting("retention_raw_days", 1),
      extractedRetentionDays: numberSetting("retention_extracted_days", 365),
      resultRetentionDays: numberSetting("retention_results_days", 2555),
      faceMatchPassThreshold: numberSetting("face_match_pass_threshold", 0.82),
      faceMatchReviewThreshold: numberSetting("face_match_review_threshold", 0.68),
      reviewSlaHours: numberSetting("review_sla_hours", 24),
    },
    providers: {
      email: { configured: smtpConfigured, label: smtpConfigured ? "Configured" : "Not configured" },
      phone: { configured: false, label: "SMS provider not configured" },
      identityDocument: { configured: false, label: "Secure capture provider not configured" },
      faceLiveness: { configured: false, label: "Liveness provider not configured" },
      screening: { configured: providerRows.some((item: any) => item.enabled && item.healthStatus === "HEALTHY"), label: providerRows.length ? "Provider registry present; verify health before activation" : "Screening provider not configured" },
      registry: providerRows.map((item: any) => ({ capability: item.capability, provider: item.provider, enabled: Boolean(item.enabled), healthStatus: item.healthStatus })),
    },
  };
}

export async function updateAdminKycSettings(adminId: number, input: {
  emailExpiryMinutes: number;
  phoneExpiryMinutes: number;
  rawRetentionDays: number;
  extractedRetentionDays: number;
  resultRetentionDays: number;
  faceMatchPassThreshold: number;
  faceMatchReviewThreshold: number;
  reviewSlaHours: number;
}) {
  if (input.faceMatchReviewThreshold >= input.faceMatchPassThreshold) throw new Error("The review threshold must be lower than the pass threshold.");
  const values: Record<string, number> = {
    email_expiry_minutes: input.emailExpiryMinutes,
    phone_expiry_minutes: input.phoneExpiryMinutes,
    retention_raw_days: input.rawRetentionDays,
    retention_extracted_days: input.extractedRetentionDays,
    retention_results_days: input.resultRetentionDays,
    face_match_pass_threshold: input.faceMatchPassThreshold,
    face_match_review_threshold: input.faceMatchReviewThreshold,
    review_sla_hours: input.reviewSlaHours,
  };
  for (const [settingKey, value] of Object.entries(values)) {
    await exec(`INSERT INTO kyc_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue),updatedBy=VALUES(updatedBy),updatedAt=NOW()`, [settingKey, String(value), adminId]);
  }
  await audit("KYC_POLICY_DRAFT_UPDATED", null, null, adminId, "ADMIN", "SAVED", "Saved KYC settings; provider-backed automated verification is not configured", undefined, undefined, undefined, values);
  return { success: true };
}

export async function adminAuditEvents() {
  return rows<any>(`SELECT l.id,l.event,l.profileId,l.customerId,l.actorId,l.actorType,l.result,l.reason,l.createdAt,
    actor.email actorEmail,customer.email customerEmail
    FROM kyc_audit_logs l LEFT JOIN users actor ON actor.id=l.actorId
    LEFT JOIN users customer ON customer.id=l.customerId
    ORDER BY l.id DESC LIMIT 100`);
}

export async function adminDecision(adminId: number, profileId: number, stage: string, decision: "APPROVE" | "REJECT", reason: string) {
  const rationale = String(reason || "").trim();
  if (rationale.length < 5 || rationale.length > 2000) throw new Error("Enter a review reason between 5 and 2000 characters.");
  if (!STAGES.includes(stage as any)) throw new Error("Unknown KYC stage");
  if (!["ADDRESS", "IDENTITY_DOCUMENT", "FACE_LIVENESS"].includes(stage)) throw new Error("This stage is verified by its provider, not through manual evidence review.");
  const profile = (await rows<any>("SELECT userId FROM kyc_profiles WHERE id=?", [profileId]))[0];
  if (!profile) throw new Error("KYC profile not found");
  await assertStageReady(profileId, stage);
  const current = (await rows<any>("SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=?", [profileId, stage]))[0];
  if (current?.state !== "REVIEW_REQUIRED") throw new Error("Only a stage in manual review can be approved or rejected.");
  let evidence: any[] = [];
  if (stage === "ADDRESS") evidence = await rows<any>("SELECT id FROM kyc_address_verifications WHERE profileId=? ORDER BY id DESC LIMIT 1", [profileId]);
  if (stage === "IDENTITY_DOCUMENT") evidence = await rows<any>("SELECT id FROM kyc_documents WHERE profileId=? ORDER BY id DESC LIMIT 1", [profileId]);
  if (stage === "FACE_LIVENESS") evidence = await rows<any>("SELECT id FROM kyc_liveness_checks WHERE profileId=? ORDER BY id DESC LIMIT 1", [profileId]);
  if (!evidence.length) throw new Error("A review decision cannot be recorded without stage evidence.");
  if (decision === "APPROVE") await exec("INSERT INTO kyc_admin_overrides (profileId,stageCode,requestedBy,status,reason) VALUES (?,?,?,?,?)", [profileId, stage, adminId, "APPLIED", rationale]);
  const nextState = decision === "APPROVE" ? "VERIFIED" : "REJECTED";
  await transition(profileId, Number(profile.userId), stage, nextState, "ADMIN", rationale);
  const reviewStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const update = await exec("UPDATE kyc_manual_reviews SET status=?,assignedAdminId=?,reason=?,updatedAt=NOW() WHERE profileId=? AND stageCode=? AND status='OPEN'", [reviewStatus, adminId, rationale, profileId, stage]);
  if (!update.affectedRows) await exec("INSERT INTO kyc_manual_reviews (profileId,stageCode,status,assignedAdminId,reason) VALUES (?,?,?,?,?)", [profileId, stage, reviewStatus, adminId, rationale]);
  await audit("MANUAL_REVIEW_DECISION", profileId, Number(profile.userId), adminId, "ADMIN", nextState, rationale, undefined, undefined, undefined, { stage, decision });
  return getCenter(Number(profile.userId));
}

export async function adminOverride(adminId: number, profileId: number, stage: string, reason: string) {
  return adminDecision(adminId, profileId, stage, "APPROVE", reason);
}

export async function verifyAuditChain() {
  const connection = await db().getConnection();
  try {
    await connection.query("SET time_zone = '+00:00'");
    const [auditRows] = await connection.query("SELECT id,event,profileId,customerId,actorId,actorType,result,reason,sessionId,payloadJson,previousHash,recordHash,DATE_FORMAT(createdAt, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAtIso FROM kyc_audit_logs ORDER BY id ASC");
    const items = auditRows as any[];
    let previous = "GENESIS";
    for (const item of items) {
      const expected = hash([previous,item.event,item.profileId,item.customerId,item.actorId,item.actorType,item.result || "",item.reason || "",item.sessionId || "",item.createdAtIso,item.payloadJson || "{}"].join("|"));
      if (item.previousHash !== previous || item.recordHash !== expected) return { valid: false, brokenAt: item.id };
      previous = item.recordHash;
    }
    return { valid: true, records: items.length };
  } finally {
    connection.release();
  }
}
