import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { createLocalSession, verifyLocalSession } from "./localAuth";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  authVersion?: number;
};

export type AuthenticatedUser = User;

/**
 * Application-owned identity service. Sessions are signed by this application
 * and always resolve to accounts already persisted in its own database.
 */
class LocalIdentityService {
  async createSessionToken(openId: string, _options: { expiresInMs?: number; name?: string } = {}) {
    const user = await db.getUserByOpenId(openId);
    if (!user || user.loginMethod === "closed" || user.openId.startsWith("closed:")) {
      throw new Error("A valid local Arbitrade account is required to create a session");
    }
    return createLocalSession(user.id, Number(user.authVersion ?? 0));
  }

  async signSession(payload: SessionPayload, _options: { expiresInMs?: number } = {}) {
    return this.createSessionToken(payload.openId, { name: payload.name });
  }

  async verifySession(token: string | undefined | null): Promise<{ openId: string; appId: string; name: string; authVersion?: number } | null> {
    try {
      const session = verifyLocalSession(token ?? undefined);
      if (!session) return null;
      const user = await db.getUserById(session.userId);
      if (!user || user.loginMethod === "closed" || user.openId.startsWith("closed:")) return null;
      if (Number(user.authVersion ?? 0) !== Number(session.authVersion ?? 0)) return null;
      return {
        openId: user.openId,
        appId: "arbitrade-local",
        name: user.name ?? "",
        authVersion: Number(user.authVersion ?? 0),
      };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    let token = cookies[COOKIE_NAME];
    if (!token && typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.slice(7);
    }
    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Authentication required");
    const user = await db.getUserByOpenId(session.openId);
    if (!user || user.loginMethod === "closed" || user.openId.startsWith("closed:")) {
      throw ForbiddenError("This local account is unavailable");
    }
    if (Number(user.authVersion ?? 0) !== Number(session.authVersion ?? 0)) {
      throw ForbiddenError("Session has been revoked. Please sign in again.");
    }
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const localIdentityService = new LocalIdentityService();
