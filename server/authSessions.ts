import { eq, sql } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Revoke every application-issued session for an account by advancing its version.
 * Both local-auth cookies and app-signed OAuth/preview tokens are checked against
 * this version on authenticated requests. The format has no per-device identifier,
 * so a successful logout invalidates sessions for this account on all devices.
 */
export async function invalidateUserSessions(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Authentication storage is unavailable");

  await db
    .update(users)
    .set({ authVersion: sql`${users.authVersion} + 1` })
    .where(eq(users.id, userId));
}

/** @deprecated Use invalidateUserSessions for every application-issued session type. */
export const invalidateLocalAuthSessions = invalidateUserSessions;
