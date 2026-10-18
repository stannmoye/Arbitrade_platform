import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adjustCustomerBalance: vi.fn(),
  recordTransactionConsoleEvent: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, adjustCustomerBalance: mocks.adjustCustomerBalance };
});

vi.mock("./transactionConsole", async importOriginal => {
  const actual = await importOriginal<typeof import("./transactionConsole")>();
  return { ...actual, recordTransactionConsoleEvent: mocks.recordTransactionConsoleEvent };
});

import { appRouter } from "./routers";

describe("admin wallet adjustment route telemetry failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.adjustCustomerBalance.mockReset();
    mocks.recordTransactionConsoleEvent.mockReset();
  });

  it("returns the committed wallet result when transaction-console telemetry fails", async () => {
    const committedResult = {
      success: true,
      newAvailableMinor: 125,
      currency: "USD",
      amountMinor: 25,
      rateUsd: 1,
      rateUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      amountUsd: 0.25,
    };
    mocks.adjustCustomerBalance.mockResolvedValue(committedResult);
    mocks.recordTransactionConsoleEvent.mockRejectedValue(new Error("transaction console unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = appRouter.createCaller({
      user: { id: 1, role: "admin" },
      req: {} as never,
      res: {} as never,
    } as never);

    const result = await caller.admin.adjustCustomerBalance({
      userId: 2,
      currency: "USD",
      amountMinor: 25,
      mode: "credit",
      reason: "verified admin adjustment",
    });

    expect(mocks.adjustCustomerBalance).toHaveBeenCalledTimes(1);
    expect(mocks.recordTransactionConsoleEvent).toHaveBeenCalledTimes(1);
    expect(result).toEqual(committedResult);
  });
});
