import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const appearance = {
  defaultTheme: "clean-light" as const,
  enabledThemes: ["original" as const, "clean-light" as const],
  customerCanSelect: true,
};

describe("administrator appearance settings authorization", () => {
  it("rejects unauthenticated reads before accessing settings storage", async () => {
    const caller = appRouter.createCaller({ user: null } as never);

    await expect(caller.adminOperations.settings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects customer reads before accessing settings storage", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "customer" },
    } as never);

    await expect(caller.adminOperations.settings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects customer appearance-policy writes before persistence", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "customer" },
    } as never);

    await expect(caller.adminOperations.updateSettings({ appearance })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects unauthenticated appearance-policy writes before persistence", async () => {
    const caller = appRouter.createCaller({ user: null } as never);

    await expect(caller.adminOperations.updateSettings({ appearance })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
