import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { createLocalSession } from "./_core/localAuth";
import { invalidateLocalAuthSessions } from "./authSessions";

vi.mock("./authSessions", () => ({ invalidateLocalAuthSessions: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./transactionConsole", () => ({
  closeTransactionConsoleSession: vi.fn().mockResolvedValue(undefined),
  listTransactionConsoleEvents: vi.fn(),
  recordTransactionConsoleEvent: vi.fn(),
  recordTransactionConsolePulse: vi.fn(),
}));

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(cookie?: string): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: cookie ? { cookie } : {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("invalidates the server-side local-auth version before reporting success", async () => {
    vi.mocked(invalidateLocalAuthSessions).mockClear();
    const token = createLocalSession(1, 0);
    const { ctx } = createAuthContext(`${COOKIE_NAME}=${token}`);

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(invalidateLocalAuthSessions).toHaveBeenCalledOnce();
    expect(invalidateLocalAuthSessions).toHaveBeenCalledWith(1);
    expect(result).toEqual({ success: true });
  });
});
