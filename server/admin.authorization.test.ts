import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextForRole(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "authorization-test-user",
      email: "authorization-test@example.com",
      name: "Authorization Test",
      loginMethod: "password",
      role,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("administrator procedure authorization", () => {
  it("rejects customer sessions before invoking a sensitive admin operation", async () => {
    const caller = appRouter.createCaller(contextForRole("user"));
    await expect(caller.adminOperations.miningDashboard()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
  });

  it("rejects unauthenticated callers before invoking a sensitive admin operation", async () => {
    const caller = appRouter.createCaller({ ...contextForRole("user"), user: null });
    await expect(caller.adminOperations.miningDashboard()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
  });
});
