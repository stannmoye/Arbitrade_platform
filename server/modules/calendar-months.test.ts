import { describe, expect, it } from "vitest";
import { addCalendarMonths } from "./calendar-months";

describe("calendar month entitlement expiry", () => {
  it("clamps month-end dates instead of rolling into the following month", () => {
    expect(addCalendarMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 3).toISOString()).toBe("2027-01-24T12:00:00.000Z");
  });

  it("rejects invalid start dates and unsupported durations", () => {
    expect(() => addCalendarMonths(new Date(Number.NaN), 1)).toThrow(/valid entitlement start time/);
    expect(() => addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 0)).toThrow(/1–1200 calendar months/);
    expect(() => addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 1201)).toThrow(/1–1200 calendar months/);
  });
});
