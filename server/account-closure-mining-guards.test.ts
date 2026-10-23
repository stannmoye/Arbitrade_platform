import { describe, expect, it, vi } from "vitest";
import { assertNoOutstandingMiningOperations } from "./db";

const blockingConditions = [
  { label: "an active Mining package", blockedIndex: 0, message: /active Mining packages/i },
  { label: "a pending boost reward", blockedIndex: 1, message: /pending Mining boost rewards/i },
  { label: "a queued conversion", blockedIndex: 2, message: /queued Mining conversions/i },
  { label: "a pending balance adjustment", blockedIndex: 3, message: /pending Mining balance adjustments/i },
  { label: "a pending ledger entry", blockedIndex: 4, message: /pending Mining ledger entries/i },
] as const;

describe("Account-closure Mining obligations", () => {
  it.each(blockingConditions)("blocks approval when there is $label", async ({ blockedIndex, message }) => {
    let callIndex = 0;
    const execute = vi.fn(async () => {
      const rows = callIndex++ === blockedIndex ? [{ id: 10 }] : [];
      return [rows, []] as [Array<{ id: number }>, never[]];
    });

    await expect(assertNoOutstandingMiningOperations({ execute }, 42)).rejects.toThrow(message);
    expect(execute).toHaveBeenCalledTimes(blockedIndex + 1);
  });

  it("allows approval only after each Mining obligation check is clear", async () => {
    const execute = vi.fn().mockResolvedValue([[], []]);

    await expect(assertNoOutstandingMiningOperations({ execute }, 42)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(blockingConditions.length);
  });
});
