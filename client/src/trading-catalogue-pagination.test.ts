import { describe, expect, it } from "vitest";
import { getPageCount, paginateItems } from "./trading-catalogue-pagination";

describe("Trading catalogue pagination", () => {
  it("calculates page counts without creating an empty trailing page", () => {
    expect(getPageCount(0, 10)).toBe(1);
    expect(getPageCount(10, 10)).toBe(1);
    expect(getPageCount(11, 10)).toBe(2);
    expect(getPageCount(1811, 10)).toBe(182);
    expect(getPageCount(11, 5)).toBe(3);
  });

  it("returns five tiers at a time and clamps out-of-range pages", () => {
    const tiers = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(paginateItems(tiers, 0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginateItems(tiers, 1, 5)).toEqual([6, 7, 8, 9, 10]);
    expect(paginateItems(tiers, 2, 5)).toEqual([11, 12]);
    expect(paginateItems(tiers, 99, 5)).toEqual([11, 12]);
  });

  it("preserves every company when traversing ten-record pages", () => {
    const companies = Array.from({ length: 1811 }, (_, index) => index + 1);
    const first = paginateItems(companies, 0, 10);
    const second = paginateItems(companies, 1, 10);
    const last = paginateItems(companies, 181, 10);
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(10);
    expect(last).toEqual([1801, 1802, 1803, 1804, 1805, 1806, 1807, 1808, 1809, 1810, 1811]);
    expect(new Set([...first, ...second, ...last]).size).toBe(21);
  });

  it("rejects invalid page sizes and totals", () => {
    expect(() => getPageCount(-1, 10)).toThrow(RangeError);
    expect(() => getPageCount(10, 0)).toThrow(RangeError);
    expect(() => paginateItems([1, 2], 0, 0)).toThrow(RangeError);
  });
});
