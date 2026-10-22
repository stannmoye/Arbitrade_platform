import { describe, expect, it } from "vitest";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

function makeContext(user: TrpcContext["user"]): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user,
  };
}

const authorizationProbe = router({
  protectedIdentity: protectedProcedure.query(({ ctx }) => ctx.user.id),
  adminIdentity: adminProcedure.query(({ ctx }) => ctx.user.id),
});

describe("tRPC authorization middleware", () => {
  it("rejects unauthenticated callers from protected procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext(null));

    await expect(caller.protectedIdentity()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("allows authenticated customers through protected procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext({
      id: 17,
      role: "user",
    } as NonNullable<TrpcContext["user"]>));

    await expect(caller.protectedIdentity()).resolves.toBe(17);
  });

  it("allows authenticated administrators through protected procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext({
      id: 23,
      role: "admin",
    } as NonNullable<TrpcContext["user"]>));

    await expect(caller.protectedIdentity()).resolves.toBe(23);
  });

  it("rejects unauthenticated callers from administrator procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext(null));

    await expect(caller.adminIdentity()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects authenticated customers from administrator procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext({
      id: 17,
      role: "user",
    } as NonNullable<TrpcContext["user"]>));

    await expect(caller.adminIdentity()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows administrators through administrator procedures", async () => {
    const caller = authorizationProbe.createCaller(makeContext({
      id: 23,
      role: "admin",
    } as NonNullable<TrpcContext["user"]>));

    await expect(caller.adminIdentity()).resolves.toBe(23);
  });
});
