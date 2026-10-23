import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { invalidateUserSessions } from "./authSessions";
import { createTicket, listCustomerTickets } from "./db";

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
    createTicket: vi.fn().mockResolvedValue({ ticketId: 123, ticketNumber: "ARB-TEST-123" }),
    listCustomerTickets: vi.fn().mockResolvedValue([]),
  };
});

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

  it("invalidates the account session version for local and app-signed OAuth sessions", async () => {
    vi.mocked(invalidateUserSessions).mockClear();
    const { ctx } = createAuthContext();

    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(invalidateUserSessions).toHaveBeenCalledOnce();
    expect(invalidateUserSessions).toHaveBeenCalledWith(1);
    expect(result).toEqual({ success: true });
  });

  it("does not report logout success if server-side revocation fails", async () => {
    vi.mocked(invalidateUserSessions).mockRejectedValueOnce(new Error("Authentication storage is unavailable"));
    const { ctx, clearedCookies } = createAuthContext();

    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toThrow();
    expect(clearedCookies).toHaveLength(1);
  });

  it("rejects account-closure requests with fewer than three reasons", async () => {
    vi.mocked(createTicket).mockClear();
    vi.mocked(listCustomerTickets).mockResolvedValue([]);
    const { ctx } = createAuthContext();

    await expect(appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees"],
      acknowledged: true,
    } as never)).rejects.toThrow();
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("requires the closure disclosure acknowledgment on the server", async () => {
    vi.mocked(createTicket).mockClear();
    vi.mocked(listCustomerTickets).mockResolvedValue([]);
    const { ctx } = createAuthContext();

    await expect(appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees", "experience"],
      acknowledged: false,
    } as never)).rejects.toThrow();
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("creates a high-priority admin-reviewed closure ticket using server-authored disclosure", async () => {
    vi.mocked(createTicket).mockClear();
    vi.mocked(createTicket).mockResolvedValue({ ticketId: 123, ticketNumber: "ARB-TEST-123" });
    vi.mocked(listCustomerTickets).mockResolvedValue([]);
    const { ctx } = createAuthContext();

    const result = await appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees", "experience"],
      acknowledged: true,
    });

    expect(result).toMatchObject({ ticketId: 123, ticketNumber: "ARB-TEST-123", alreadyPending: false });
    expect(createTicket).toHaveBeenCalledWith(1, expect.objectContaining({
      priority: "high",
      category: "account",
      subject: "Account closure request — administrator review required",
      body: expect.stringContaining("The administrator must record an explicit approve/reject decision."),
    }));
  });

  it("returns an existing open closure ticket instead of opening duplicates", async () => {
    vi.mocked(createTicket).mockClear();
    vi.mocked(listCustomerTickets).mockResolvedValue([{
      id: 45,
      ticketNumber: "ARB-EXISTING-45",
      subject: "Account closure request — administrator review required",
      status: "open",
    }] as never);
    const { ctx } = createAuthContext();

    const result = await appRouter.createCaller(ctx).customer.requestAccountClosure({
      reasons: ["privacy", "fees", "experience"],
      acknowledged: true,
    });

    expect(result).toMatchObject({ ticketId: 45, ticketNumber: "ARB-EXISTING-45", alreadyPending: true });
    expect(createTicket).not.toHaveBeenCalled();
  });
});
