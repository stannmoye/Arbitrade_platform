import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { apiProviderCredentials } from "../drizzle/schema";
import { getDb } from "./db";

type EncryptedEnvelope = { v: 1; iv: string; tag: string; ciphertext: string };

function encryptionKey(): Buffer {
  const configured = process.env.API_ACCESS_ENCRYPTION_KEY;
  if (!configured || configured.trim().length < 32) {
    throw new Error("The API provider secret vault is locked. Configure API_ACCESS_ENCRYPTION_KEY (32 or more characters) before saving provider credentials or webhook signing secrets.");
  }
  return crypto.createHash("sha256").update(configured, "utf8").digest();
}

export function isApiAccessVaultConfigured(): boolean {
  return typeof process.env.API_ACCESS_ENCRYPTION_KEY === "string"
    && process.env.API_ACCESS_ENCRYPTION_KEY.trim().length >= 32;
}

export function encryptVaultValue(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return JSON.stringify(envelope);
}

export function decryptVaultValue(serialized: string): string {
  let envelope: EncryptedEnvelope;
  try { envelope = JSON.parse(serialized) as EncryptedEnvelope; }
  catch { throw new Error("Encrypted provider credential is malformed."); }
  if (!envelope || envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error("Encrypted provider credential has an unsupported format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function saveApiProviderCredential(providerKey: "whatsapp_meta" | "wallet_generic", payload: Record<string, string>, updatedBy: number) {
  if (!isApiAccessVaultConfigured()) throw new Error("Set API_ACCESS_ENCRYPTION_KEY in the server's private environment before saving provider credentials.");
  const serialized = JSON.stringify(payload);
  if (serialized.length > 20_000) throw new Error("Provider configuration is too large.");
  const encryptedPayload = encryptVaultValue(serialized);
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  await db.insert(apiProviderCredentials).values({ providerKey, encryptedPayload, updatedBy })
    .onDuplicateKeyUpdate({ set: { encryptedPayload, updatedBy, updatedAt: new Date() } });
  return { success: true, providerKey, updatedAt: new Date().toISOString() };
}

export async function readApiProviderCredential(providerKey: "whatsapp_meta" | "wallet_generic"): Promise<Record<string, string> | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const row = (await db.select().from(apiProviderCredentials)
    .where(eq(apiProviderCredentials.providerKey, providerKey)).limit(1))[0];
  if (!row) return null;
  const parsed: unknown = JSON.parse(decryptVaultValue(row.encryptedPayload));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored provider credential has an invalid payload.");
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function apiProviderCredentialStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const rows = await db.select({
    providerKey: apiProviderCredentials.providerKey,
    updatedAt: apiProviderCredentials.updatedAt,
  }).from(apiProviderCredentials);
  const configured = new Map(rows.map((row) => [row.providerKey, row.updatedAt]));
  return {
    vaultReady: isApiAccessVaultConfigured(),
    whatsappMeta: { configured: configured.has("whatsapp_meta"), updatedAt: configured.get("whatsapp_meta") ?? null },
    walletGeneric: { configured: configured.has("wallet_generic"), updatedAt: configured.get("wallet_generic") ?? null },
    note: isApiAccessVaultConfigured()
      ? "Secrets are encrypted at rest and are never returned by settings queries."
      : "Provider credentials cannot be saved until API_ACCESS_ENCRYPTION_KEY is configured on the server.",
  };
}

export async function removeApiProviderCredential(providerKey: "whatsapp_meta" | "wallet_generic") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  await db.delete(apiProviderCredentials).where(eq(apiProviderCredentials.providerKey, providerKey));
  return { success: true, providerKey };
}
