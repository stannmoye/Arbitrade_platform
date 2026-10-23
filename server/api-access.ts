import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { customerApiKeys, users } from "../drizzle/schema";

export const CUSTOMER_API_SCOPES = [
  "balances:read",
  "transactions:read",
  "deposits:read",
  "withdrawals:read",
  "fees:read",
  "reports:read",
  "platform:status",
] as const;
export type CustomerApiScope = typeof CUSTOMER_API_SCOPES[number];

const MAX_ACTIVE_KEYS_PER_CUSTOMER = 5;

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

function parseScopes(value: string): CustomerApiScope[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is CustomerApiScope =>
      typeof scope === "string" && (CUSTOMER_API_SCOPES as readonly string[]).includes(scope),
    );
  } catch {
    return [];
  }
}

function safeKeyRecord(row: typeof customerApiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    scopes: parseScopes(row.scopesJson),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    status: row.revokedAt ? "revoked" as const : "active" as const,
  };
}

export async function listCustomerApiKeys(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owner = (await db.select({ id: users.id, role: users.role, loginMethod: users.loginMethod })
    .from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!owner || owner.role !== "user" || owner.loginMethod === "closed") {
    throw new Error("An active customer account is required.");
  }
  const rows = await db.select().from(customerApiKeys)
    .where(eq(customerApiKeys.userId, userId))
    .orderBy(desc(customerApiKeys.createdAt), desc(customerApiKeys.id))
    .limit(50);
  return { keys: rows.map(safeKeyRecord), scopes: CUSTOMER_API_SCOPES, maxActiveKeys: MAX_ACTIVE_KEYS_PER_CUSTOMER };
}

export async function createCustomerApiKey(userId: number, name: string, requestedScopes: CustomerApiScope[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalizedName = name.trim();
  const scopes = [...new Set(requestedScopes)].filter((scope) =>
    (CUSTOMER_API_SCOPES as readonly string[]).includes(scope),
  );
  if (normalizedName.length < 3 || normalizedName.length > 80) throw new Error("Key name must contain 3–80 characters.");
  if (!scopes.length) throw new Error("Choose at least one permission.");
  const owner = (await db.select({ id: users.id, role: users.role, loginMethod: users.loginMethod })
    .from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!owner || owner.role !== "user" || owner.loginMethod === "closed") {
    throw new Error("An active customer account is required.");
  }
  const activeRows = await db.select({ count: sql<number>`count(*)` }).from(customerApiKeys)
    .where(and(eq(customerApiKeys.userId, userId), isNull(customerApiKeys.revokedAt)));
  if (Number(activeRows[0]?.count ?? 0) >= MAX_ACTIVE_KEYS_PER_CUSTOMER) {
    throw new Error(`You can have at most ${MAX_ACTIVE_KEYS_PER_CUSTOMER} active API keys. Revoke one before creating another.`);
  }

  // The raw secret is returned exactly once. Only its SHA-256 hash is persisted.
  const secret = `arb_live_${crypto.randomBytes(32).toString("base64url")}`;
  const prefix = secret.slice(0, 16);
  const inserted = await db.insert(customerApiKeys).values({
    userId,
    name: normalizedName,
    keyPrefix: prefix,
    keyHash: hashApiKey(secret),
    scopesJson: JSON.stringify(scopes),
  });
  const id = Number(inserted[0].insertId);
  const row = (await db.select().from(customerApiKeys)
    .where(and(eq(customerApiKeys.id, id), eq(customerApiKeys.userId, userId))).limit(1))[0];
  if (!row) throw new Error("The API key was created but could not be loaded. Contact support before retrying.");
  return { key: safeKeyRecord(row), secret, warning: "Copy this secret now. It cannot be displayed again." };
}

export async function revokeCustomerApiKey(userId: number, keyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const changed = await db.update(customerApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(customerApiKeys.id, keyId),
      eq(customerApiKeys.userId, userId),
      isNull(customerApiKeys.revokedAt),
    ));
  if (Number(changed[0]?.affectedRows ?? 0) !== 1) {
    const exists = (await db.select({ id: customerApiKeys.id }).from(customerApiKeys)
      .where(and(eq(customerApiKeys.id, keyId), eq(customerApiKeys.userId, userId))).limit(1))[0];
    if (!exists) throw new Error("API key not found for this customer.");
    return { success: true, alreadyRevoked: true };
  }
  return { success: true, alreadyRevoked: false };
}

export async function authenticateCustomerApiKey(rawKey: string) {
  if (!/^arb_live_[A-Za-z0-9_-]{43}$/.test(rawKey)) return null;
  const db = await getDb();
  if (!db) return null;
  const keyHash = hashApiKey(rawKey);
  const row = (await db.select({
    id: customerApiKeys.id,
    userId: customerApiKeys.userId,
    scopesJson: customerApiKeys.scopesJson,
    revokedAt: customerApiKeys.revokedAt,
    role: users.role,
    loginMethod: users.loginMethod,
  }).from(customerApiKeys)
    .innerJoin(users, eq(users.id, customerApiKeys.userId))
    .where(eq(customerApiKeys.keyHash, keyHash)).limit(1))[0];
  if (!row || row.revokedAt || row.role !== "user" || row.loginMethod === "closed") return null;
  // Usage timestamps are best-effort telemetry; never expose or log the secret.
  void db.update(customerApiKeys).set({ lastUsedAt: new Date() })
    .where(and(eq(customerApiKeys.id, row.id), isNull(customerApiKeys.revokedAt)))
    .catch(() => undefined);
  return { userId: row.userId, keyId: row.id, scopes: parseScopes(row.scopesJson) };
}
