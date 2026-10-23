import { eq, sql } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Revoke stateless local-auth cookies by advancing the user's auth version.
 * Existing signed cookies carry the old version and are rejected by createContext.
 * This intentionally invalidates all local-auth sessions for the account because
 * the current token format has no per-device session identifier.
 */
export async function invalidateLocalAuthSessions(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Authentication storage is unavailable");

  await db
    .update(users)
    .set({ authVersion: sql`${users.authVersion} + 1` })
    .where(eq(users.id, userId));
}
