import { describe, expect, it } from "vitest";
import { isWithinDailyAllocationLimit } from "./daily-allocation";

describe("customer daily allocation limits", () => {
  it("allows an allocation within the remaining daily limit", () => {
    expect(isWithinDailyAllocationLimit({ limitMinor: 100_000, alreadyAllocatedMinor: 40_000, requestedMinor: 60_000 })).toBe(true);
    expect(isWithinDailyAllocationLimit({ limitMinor: 100_000, alreadyAllocatedMinor: 40_000, requestedMinor: 59_999 })).toBe(true);
  });

  it("rejects an allocation that would exceed the limit", () => {
    expect(isWithinDailyAllocationLimit({ limitMinor: 100_000, alreadyAllocatedMinor: 40_000, requestedMinor: 60_001 })).toBe(false);
    expect(isWithinDailyAllocationLimit({ limitMinor: 100_000, alreadyAllocatedMinor: 100_000, requestedMinor: 1 })).toBe(false);
  });

  it("fails closed for invalid limits, totals, or requested amounts", () => {
    expect(isWithinDailyAllocationLimit({ limitMinor: 0, alreadyAllocatedMinor: 0, requestedMinor: 1 })).toBe(false);
    expect(isWithinDailyAllocationLimit({ limitMinor: 100, alreadyAllocatedMinor: -1, requestedMinor: 1 })).toBe(false);
    expect(isWithinDailyAllocationLimit({ limitMinor: 100, alreadyAllocatedMinor: 0, requestedMinor: 0 })).toBe(false);
    expect(isWithinDailyAllocationLimit({ limitMinor: Number.MAX_SAFE_INTEGER + 1, alreadyAllocatedMinor: 0, requestedMinor: 1 })).toBe(false);
  });
});
