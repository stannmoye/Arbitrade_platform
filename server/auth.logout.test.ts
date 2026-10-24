import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { invalidateUserSessions } from "./authSessions";
import { applyAccountClosureDecision, createAccountClosureTicket, getUserById, getUserForSessionRevocation } from "./db";
import { createLocalSession } from "./_core/localAuth";
import { localIdentityService } from "./_core/localIdentityService";

vi.mock("./authSessions", () => ({
  invalidateUserSessions: vi.fn().mockResolvedValue(undefined),
  invalidateLocalAuthSessions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./transactionConsole", () => ({
  closeTransactionConsoleSession: vi.fn().mockResolvedValue(undefined),
  listTransactionConsoleEvents: vi.fn(),
  recordTransactionConsoleEvent: vi.fn(),
  recordTransactionConsolePulse: vi.fn(),
}));
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    applyAccountClosureDecision: vi.fn().mockResolvedValue({ success: true, decision: "approve", ticketId: 123, ticketNumber: "ARB-TEST-123", customerId: 1 }),
    createAccountClosureTicket: vi.fn().mockResolvedValue({ ticketId: 123, ticketNumber: "ARB-TEST-123", alreadyPending: false }),
    getUserById: vi.fn(),
    getUserForSessionRevocation: vi.fn(),
  };
});

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(cookie?: string, role: "user" | "admin" = "user", authenticated = true): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "email",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user: authenticated ? user : null,
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

  it("invalidates the account session version for local and app-signed OAuth sessions", async () => {
    vi.mocked(invalidateUserSessions).mockClear();
    const { ctx } = createAuthContext();

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(invalidateUserSessions).toHaveBeenCalledOnce();
    expect(invalidateUserSessions).toHaveBeenCalledWith(1);
    expect(result).toEqual({ success: true });
  });

  it("recovers a valid local session when context construction did not attach the user", async () => {
    const token = createLocalSession(1, 0);
    vi.mocked(getUserById).mockResolvedValue({
      id: 1, openId: "sample-user", email: "sample@example.com", name: "Sample User",
      loginMethod: "email", role: "user", authVersion: 0,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as never);
    vi.mocked(invalidateUserSessions).mockClear();
    const { ctx, clearedCookies } = createAuthContext(`${COOKIE_NAME}=${token}`, "user", false);

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(invalidateUserSessions).toHaveBeenCalledWith(1);
    expect(clearedCookies.map(call => call.name)).toContain(COOKIE_NAME);
  });

  it("does not increment an already-revoked local session a second time", async () => {
    const token = createLocalSession(1, 0);
    vi.mocked(getUserById).mockResolvedValue({
      id: 1, openId: "sample-user", email: "sample@example.com", name: "Sample User",
      loginMethod: "email", role: "user", authVersion: 1,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as never);
    vi.mocked(invalidateUserSessions).mockClear();
    const { ctx } = createAuthContext(`${COOKIE_NAME}=${token}`, "user", false);

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("recovers a valid Bearer session when context did not attach the user", async () => {
    const token = "signed-test-token";
    const verifySession = vi.spyOn(sdk, "verifySession").mockImplementation(async (candidate) =>
      candidate === token ? { openId: "sample-user", appId: "test-app", name: "Sample User", authVersion: 0 } : null
    );
    vi.mocked(getUserForSessionRevocation).mockResolvedValue({
      id: 1, openId: "sample-user", email: "sample@example.com", name: "Sample User",
      loginMethod: "email", role: "user", authVersion: 0,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as never);
    vi.mocked(invalidateUserSessions).mockClear();
    const { ctx } = createAuthContext(undefined, "user", false);
    ctx.req.headers.authorization = `Bearer ${token}`;

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(invalidateUserSessions).toHaveBeenCalledWith(1);
    expect(getUserForSessionRevocation).toHaveBeenCalledWith("sample-user");
    verifySession.mockRestore();
  });

  it("does not report logout success if session storage cannot be verified", async () => {
    vi.mocked(getUserById).mockRejectedValueOnce(new Error("Authentication storage is unavailable"));
    const token = createLocalSession(1, 0);
    const { ctx, clearedCookies } = createAuthContext(`${COOKIE_NAME}=${token}`, "user", false);

    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toThrow("Authentication storage is unavailable");
    expect(clearedCookies).toHaveLength(0);
  });

  it("does not report logout success if server-side revocation fails", async () => {
    vi.mocked(invalidateUserSessions).mockRejectedValueOnce(new Error("Authentication storage is unavailable"));
    const { ctx, clearedCookies } = createAuthContext();

    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toThrow();
    expect(clearedCookies).toHaveLength(0);
  });

  it("rejects account-closure requests with fewer than three reasons", async () => {
    vi.mocked(createAccountClosureTicket).mockClear();
    const { ctx } = createAuthContext();

    await expect(appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees"],
      acknowledged: true,
    } as never)).rejects.toThrow();
    expect(createAccountClosureTicket).not.toHaveBeenCalled();
  });

  it("requires the closure disclosure acknowledgment on the server", async () => {
    vi.mocked(createAccountClosureTicket).mockClear();
    const { ctx } = createAuthContext();

    await expect(appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees", "experience"],
      acknowledged: false,
    } as never)).rejects.toThrow();
    expect(createAccountClosureTicket).not.toHaveBeenCalled();
  });

  it("creates a dedicated closure ticket after server-side validation", async () => {
    vi.mocked(createAccountClosureTicket).mockClear();
    vi.mocked(createAccountClosureTicket).mockResolvedValue({ ticketId: 123, ticketNumber: "ARB-TEST-123", alreadyPending: false });
    const { ctx } = createAuthContext();

    const result = await appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees", "experience"],
      acknowledged: true,
    });

    expect(result).toMatchObject({ ticketId: 123, ticketNumber: "ARB-TEST-123", alreadyPending: false });
    expect(createAccountClosureTicket).toHaveBeenCalledWith(1, ["privacy", "fees", "experience"]);
  });

  it("requires an administrator to decide a closure request", async () => {
    vi.mocked(applyAccountClosureDecision).mockClear();
    const { ctx } = createAuthContext(undefined, "user");
    await expect(appRouter.createCaller(ctx).adminOperations.decideAccountClosure({
      ticketId: 123, decision: "approve", reason: "Reviewed account and closure eligibility.",
    })).rejects.toThrow();
    expect(applyAccountClosureDecision).not.toHaveBeenCalled();
  });

  it("requires a substantive administrator decision note", async () => {
    vi.mocked(applyAccountClosureDecision).mockClear();
    const { ctx } = createAuthContext(undefined, "admin");
    await expect(appRouter.createCaller(ctx).adminOperations.decideAccountClosure({
      ticketId: 123, decision: "approve", reason: "too short",
    })).rejects.toThrow();
    expect(applyAccountClosureDecision).not.toHaveBeenCalled();
  });

  it("records an explicit account-closure decision through the admin-only service", async () => {
    vi.mocked(applyAccountClosureDecision).mockClear();
    vi.mocked(applyAccountClosureDecision).mockResolvedValue({
      success: true, decision: "reject", ticketId: 123, ticketNumber: "ARB-TEST-123", customerId: 1,
    });
    const { ctx } = createAuthContext(undefined, "admin");
    const result = await appRouter.createCaller(ctx).adminOperations.decideAccountClosure({
      ticketId: 123, decision: "reject", reason: "The request needs further review before proceeding.",
    });
    expect(result).toMatchObject({ success: true, decision: "reject", ticketId: 123 });
    expect(applyAccountClosureDecision).toHaveBeenCalledWith(1, {
      ticketId: 123, decision: "reject", reason: "The request needs further review before proceeding.",
    });
  });
});
