import { describe, expect, it } from "vitest";
import {
  buildCustomerOpportunityHistory,
  groupCustomerOpportunityHistoryByDate,
  paginateCustomerOpportunityHistory,
  summarizeCustomerOpportunityHistory,
} from "./customer-opportunity-history";

describe("customer opportunity history", () => {
  it("combines records using server timestamps and conservative lifecycle labels", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [{ id: 7, status: "open", symbol: "ABC", companyDisplayName: "Alpha", opensAt: "2026-11-06T10:00:00.000Z" }],
      missed: [{ id: 8, offerId: 18, symbol: "XYZ", reason: "INSUFFICIENT_AVAILABLE_BALANCE", createdAt: "2026-11-06T11:00:00.000Z" }],
      trades: [
        { id: 20, status: "confirmed", symbol: "DEF", confirmedAt: "2026-11-06T12:00:00.000Z", stage: "Awaiting settlement" },
        { id: 21, status: "settled", symbol: "GHI", settledAt: "2026-11-06T13:00:00.000Z" },
      ],
    });
    expect(entries.map(entry => entry.kind)).toEqual(["settled", "allocated", "missed", "available"]);
    expect(entries[0].status).toBe("Settled · server recorded");
    expect(entries[1].status).toBe("Allocated · settlement pending");
    expect(entries[2].status).toBe("Missed · not allocated");
    expect(entries[3].status).toBe("Open · available for review");
    expect(entries[2].occurredAt).toBe("2026-11-06T11:00:00.000Z");
  });

  it("includes dismissed and expired only from explicit persisted delivery statuses", () => {
    const entries = buildCustomerOpportunityHistory({ offers: [
      { id: 30, status: "open", deliveryStatus: "dismissed", symbol: "DISMISSED", dismissedAt: "2026-11-06T14:00:00.000Z" },
      { id: 31, offerStatus: "closed", deliveryStatus: "expired", symbol: "EXPIRED", closesAt: "2026-11-06T15:00:00.000Z" },
      { id: 32, status: "closed", symbol: "CLOSED WITHOUT TERMINAL STATUS" },
      { id: 33, status: "open", deliveryStatus: "failed", symbol: "RETRYABLE" },
    ] });
    expect(entries.map(entry => entry.kind)).toEqual(["expired", "dismissed", "available"]);
    expect(entries.find(entry => entry.kind === "dismissed")?.occurredAt).toBe("2026-11-06T14:00:00.000Z");
    expect(entries.find(entry => entry.kind === "expired")?.occurredAt).toBe("2026-11-06T15:00:00.000Z");
    expect(entries.some(entry => entry.title === "CLOSED WITHOUT TERMINAL STATUS")).toBe(false);
  });

  it("does not invent viewed, dismissed, expired or settled states", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [{ id: 1, status: "open", symbol: "OPEN" }, { id: 2, status: "closed", symbol: "CLOSED" }],
      missed: [{ id: 3, symbol: "MISSED" }],
      trades: [{ id: 4, status: "confirmed", symbol: "PENDING" }],
    });
    expect(entries.map(entry => entry.kind).sort()).toEqual(["allocated", "available", "missed"]);
    expect(entries.some(entry => /viewed|dismissed|expired/i.test(entry.status))).toBe(false);
  });

  it("ignores malformed records and sorts records without timestamps last", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [{ id: 1, status: "open", symbol: "NO DATE" }, { status: "open", symbol: "NO ID" }],
      missed: [{ id: 2, symbol: "DATED", createdAt: "2026-11-06T08:00:00.000Z" }],
      trades: [],
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("DATED");
    expect(entries[1].occurredAt).toBeNull();
  });

  it("handles absent API collections", () => {
    expect(buildCustomerOpportunityHistory({})).toEqual([]);
    expect(buildCustomerOpportunityHistory({ offers: null as any, missed: null as any, trades: null as any })).toEqual([]);
  });

  it("groups events by local calendar date and keeps missing timestamps explicit", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [
        { id: 1, status: "open", symbol: "TODAY", opensAt: "2026-11-06T12:00:00.000Z" },
        { id: 2, status: "open", symbol: "OLDER", opensAt: "2026-11-05T12:00:00.000Z" },
        { id: 3, status: "open", symbol: "UNKNOWN" },
      ],
    });
    const groups = groupCustomerOpportunityHistoryByDate(entries);
    expect(groups).toHaveLength(3);
    expect(groups[0].entries[0].title).toBe("TODAY");
    expect(groups[2].key).toBe("unknown-date");
    expect(groups[2].label).toBe("Date unavailable");
  });

  it("paginates without duplicates and clamps stale page indexes", () => {
    const entries = Array.from({ length: 19 }, (_, index) => index + 1);
    const first = paginateCustomerOpportunityHistory(entries, 0, 8);
    const second = paginateCustomerOpportunityHistory(entries, 1, 8);
    const last = paginateCustomerOpportunityHistory(entries, 2, 8);
    const stale = paginateCustomerOpportunityHistory(entries.slice(0, 3), 9, 8);
    expect(first.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(second.items).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(last.items).toEqual([17, 18, 19]);
    expect(new Set([...first.items, ...second.items, ...last.items]).size).toBe(19);
    expect(stale.page).toBe(0);
    expect(stale.items).toEqual([1, 2, 3]);
    expect(stale.start).toBe(1);
    expect(stale.end).toBe(3);
    expect(paginateCustomerOpportunityHistory(entries, Number.NaN, 8).page).toBe(0);
  });

  it("returns an empty first page for an empty result set", () => {
    expect(paginateCustomerOpportunityHistory([], 0)).toEqual({ items: [], page: 0, pageCount: 0, total: 0, start: 0, end: 0 });
  });

  it("summarizes only the mapped server-recorded categories", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [
        { id: 41, status: "open", symbol: "AVAILABLE" },
        { id: 42, deliveryStatus: "dismissed", symbol: "DISMISSED", dismissedAt: "2026-11-06T10:00:00.000Z" },
        { id: 43, deliveryStatus: "expired", symbol: "EXPIRED", closesAt: "2026-11-06T09:00:00.000Z" },
      ],
      missed: [{ id: 44, symbol: "MISSED" }],
      trades: [{ id: 45, status: "confirmed" }, { id: 46, status: "settled" }],
    });
    expect(summarizeCustomerOpportunityHistory(entries)).toEqual({
      total: 6, available: 1, missed: 1, allocated: 1, settled: 1, dismissed: 1, expired: 1,
    });
    expect(entries.find(entry => entry.kind === "missed")?.reference).toBe("44");
    expect(entries.find(entry => entry.kind === "settled")?.reference).toBe("46");
  });

  it("does not infer open, allocated, or missed-reason details from missing fields", () => {
    const entries = buildCustomerOpportunityHistory({
      offers: [
        { id: 51, symbol: "NO STATUS" },
        { id: 52, status: "closed", symbol: "CLOSED" },
        { id: 53, status: "open", symbol: "EXPLICIT OPEN" },
      ],
      missed: [{ id: 54, symbol: "REASON UNKNOWN" }],
      trades: [
        { id: 55, status: "pending", symbol: "PENDING" },
        { id: 56, status: "cancelled", symbol: "CANCELLED" },
        { id: 57, status: "confirmed", symbol: "CONFIRMED" },
      ],
    });

    expect(entries.map(entry => entry.kind)).toEqual(["available", "missed", "allocated"]);
    expect(entries.some(entry => entry.title === "NO STATUS")).toBe(false);
    expect(entries.some(entry => entry.title === "PENDING" || entry.title === "CANCELLED")).toBe(false);
    expect(entries.find(entry => entry.title === "REASON UNKNOWN")?.subtitle).toContain("reason not supplied");
  });

});
