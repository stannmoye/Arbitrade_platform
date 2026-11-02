import { describe, expect, it } from "vitest";
import {
  fromUtcDateTimeInput,
  toUtcDateTimeInput,
  toUtcIsoString,
} from "./utcDateTime";

describe("UTC date-time input conversion", () => {
  it("renders and parses minute-precision input as UTC, independent of the local timezone", () => {
    const saved = new Date("2026-11-02T22:24:33.000Z");
    const input = toUtcDateTimeInput(saved);
    expect(input).toBe("2026-11-02T22:24");
    expect(fromUtcDateTimeInput(input)?.toISOString()).toBe(
      "2026-11-02T22:24:00.000Z"
    );
  });

  it("accepts explicit seconds and validates calendar/time components", () => {
    expect(fromUtcDateTimeInput("2026-11-02T22:24:33")?.toISOString()).toBe(
      "2026-11-02T22:24:33.000Z"
    );
    expect(fromUtcDateTimeInput("2026-02-30T22:24")).toBeNull();
    expect(fromUtcDateTimeInput("2026-11-02T25:24")).toBeNull();
    expect(fromUtcDateTimeInput("not-a-date")).toBeNull();
    expect(fromUtcDateTimeInput("")).toBeNull();
  });

  it("normalizes saved database timestamps to ISO and keeps null/invalid values distinguishable", () => {
    expect(toUtcIsoString(new Date("2026-11-02T22:24:00.000Z"))).toBe(
      "2026-11-02T22:24:00.000Z"
    );
    expect(toUtcIsoString("2026-11-02T22:24:00.000Z")).toBe(
      "2026-11-02T22:24:00.000Z"
    );
    expect(toUtcIsoString(null)).toBeNull();
    expect(toUtcIsoString("invalid")).toBeNull();
  });
});
