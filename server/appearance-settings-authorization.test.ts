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
  it("rejects an appearance policy whose default is absent from the enabled-theme allow-list", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "admin" },
    } as never);

    await expect(caller.adminOperations.updateSettings({
      appearance: {
        defaultTheme: "aurora-modern",
        enabledThemes: ["original", "clean-light"],
        customerCanSelect: true,
      },
    })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The default theme must be enabled.",
    });
  });

  it("rejects an empty enabled-theme list before attempting persistence", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "admin" },
    } as never);

    await expect(caller.adminOperations.updateSettings({
      appearance: {
        defaultTheme: "original",
        enabledThemes: [],
        customerCanSelect: false,
      },
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unknown theme identifiers before attempting persistence", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "admin" },
    } as never);

    await expect(caller.adminOperations.updateSettings({
      appearance: {
        defaultTheme: "original",
        enabledThemes: ["original", "custom-unregistered-theme"],
        customerCanSelect: false,
      },
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects non-boolean customer selection flags before attempting persistence", async () => {
    const caller = appRouter.createCaller({
      user: { id: 123, role: "admin" },
    } as never);

    await expect(caller.adminOperations.updateSettings({
      appearance: {
        defaultTheme: "original",
        enabledThemes: ["original"],
        customerCanSelect: "true",
      },
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
