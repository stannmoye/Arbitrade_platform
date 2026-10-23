import crypto from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { customerApiKeys, customerControls, users, v5AuditEvents } from "../drizzle/schema";

export const CUSTOMER_API_SCOPES = [
  "balances:read",
  "transactions:read",
  "withdrawals:read",
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
  const owner = (await db.select({ id: users.id, role: users.role, loginMethod: users.loginMethod, accountStatus: customerControls.accountStatus })
    .from(users).leftJoin(customerControls, eq(customerControls.userId, users.id)).where(eq(users.id, userId)).limit(1))[0];
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

  return db.transaction(async (tx) => {
    // Serialize key creation for this account so concurrent tabs cannot exceed the active-key cap.
    const owner = (await tx.select({ id: users.id, role: users.role, loginMethod: users.loginMethod, accountStatus: customerControls.accountStatus })
      .from(users).leftJoin(customerControls, eq(customerControls.userId, users.id)).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!owner || owner.role !== "user" || owner.loginMethod === "closed" || (owner.accountStatus !== null && owner.accountStatus !== "active")) {
      throw new Error("An active customer account is required.");
    }
    const activeRows = await tx.select({ count: sql<number>`count(*)` }).from(customerApiKeys)
      .where(and(eq(customerApiKeys.userId, userId), isNull(customerApiKeys.revokedAt)));
    if (Number(activeRows[0]?.count ?? 0) >= MAX_ACTIVE_KEYS_PER_CUSTOMER) {
      throw new Error(`You can have at most ${MAX_ACTIVE_KEYS_PER_CUSTOMER} active API keys. Revoke one before creating another.`);
    }

    // The raw secret is returned exactly once. Only its SHA-256 hash is persisted.
    const secret = `arb_live_${crypto.randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 16);
    const inserted = await tx.insert(customerApiKeys).values({
      userId,
      name: normalizedName,
      keyPrefix: prefix,
      keyHash: hashApiKey(secret),
      scopesJson: JSON.stringify(scopes),
    });
    const id = Number(inserted[0].insertId);
    const row = (await tx.select().from(customerApiKeys)
      .where(and(eq(customerApiKeys.id, id), eq(customerApiKeys.userId, userId))).limit(1))[0];
    if (!row) throw new Error("The API key could not be loaded after creation.");
    await tx.insert(v5AuditEvents).values({ actorUserId: userId, action: "api.key.created", entityType: "customer_api_key", entityId: String(id), reason: "Customer created a scoped API credential", reference: prefix, metadataJson: JSON.stringify({ name: normalizedName, scopes }) });
    return { key: safeKeyRecord(row), secret, warning: "Copy this secret now. It cannot be displayed again." };
  });
}
export async function revokeCustomerApiKey(userId: number, keyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(customerApiKeys)
      .where(and(eq(customerApiKeys.id, keyId), eq(customerApiKeys.userId, userId))).limit(1).for("update"))[0];
    if (!row) throw new Error("API key not found for this customer.");
    if (row.revokedAt) return { success: true, alreadyRevoked: true };
    const revokedAt = new Date();
    await tx.update(customerApiKeys).set({ revokedAt })
      .where(and(eq(customerApiKeys.id, keyId), eq(customerApiKeys.userId, userId), isNull(customerApiKeys.revokedAt)));
    await tx.insert(v5AuditEvents).values({ actorUserId: userId, action: "api.key.revoked", entityType: "customer_api_key", entityId: String(keyId), reason: "Customer revoked an API credential", reference: row.keyPrefix, metadataJson: JSON.stringify({ name: row.name, scopes: parseScopes(row.scopesJson) }) });
    return { success: true, alreadyRevoked: false };
  });
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
    accountStatus: customerControls.accountStatus,
    lastUsedAt: customerApiKeys.lastUsedAt,
  }).from(customerApiKeys)
    .innerJoin(users, eq(users.id, customerApiKeys.userId))
    .leftJoin(customerControls, eq(customerControls.userId, users.id))
    .where(eq(customerApiKeys.keyHash, keyHash)).limit(1))[0];
  if (!row || row.revokedAt || row.role !== "user" || row.loginMethod === "closed" || row.accountStatus === "suspended") return null;
  // Usage timestamps are best-effort telemetry; never expose or log the secret.
  const usageCutoff = new Date(Date.now() - 5 * 60_000);
  if (!row.lastUsedAt || row.lastUsedAt < usageCutoff) {
    void db.update(customerApiKeys).set({ lastUsedAt: new Date() })
      .where(and(eq(customerApiKeys.id, row.id), isNull(customerApiKeys.revokedAt), or(isNull(customerApiKeys.lastUsedAt), lt(customerApiKeys.lastUsedAt, usageCutoff))))
      .catch(() => undefined);
  }
  return { userId: row.userId, keyId: row.id, scopes: parseScopes(row.scopesJson) };
}
