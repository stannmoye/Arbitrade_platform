import { describe, expect, it } from "vitest";
import { isWithinUsdDailyAllocationLimit } from "./daily-allocation-usd";

describe("USD-equivalent daily allocation limit", () => {
  it("aggregates allocations across different currencies", () => {
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[{minor:25_000,scale:2,usdRate:1},{minor:25_000,scale:2,usdRate:1.1}],requested:{minor:45_000,scale:2,usdRate:1}})).toBe(true);
  });
  it("rejects cross-currency allocations that exceed the USD cap", () => {
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[{minor:50_000,scale:2,usdRate:1}],requested:{minor:46_000,scale:2,usdRate:1.1}})).toBe(false);
  });
  it("converts assets with different decimal scales", () => {
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[],requested:{minor:1_000_000,scale:8,usdRate:65000}})).toBe(true);
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[],requested:{minor:200_000,scale:8,usdRate:65000}})).toBe(false);
  });
  it("fails closed for invalid conversion rates and metadata", () => {
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[],requested:{minor:1000,scale:2,usdRate:0}})).toBe(false);
    expect(isWithinUsdDailyAllocationLimit({limitUsdMinor:100_000,alreadyAllocated:[{minor:1000,scale:2,usdRate:Number.NaN}],requested:{minor:1,scale:2,usdRate:1}})).toBe(false);
  });
});