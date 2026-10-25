import { describe, expect, it } from "vitest";
import { createRotationCycle, eligibleCompanies, shuffledRotation, type ListedCompany } from "./company-rotation";

const now = new Date("2026-10-25T12:00:00.000Z");
const company = (id: number, overrides: Partial<ListedCompany> = {}): ListedCompany => ({
  id, name: `Company ${id}`, ticker: `T${id}`, exchangeCode: "XNAS", countryCode: "US",
  sector: "Technology", listingStatus: "active", lastVerifiedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
});

describe("verified company rotation", () => {
  it("excludes inactive, unverified, stale, and excluded companies", () => {
    const rows = [
      company(1), company(2, { listingStatus: "suspended" }),
      company(3, { lastVerifiedAt: null }),
      company(4, { lastVerifiedAt: new Date("2025-01-01T00:00:00.000Z") }),
      company(5),
    ];
    expect(eligibleCompanies(rows, { excludedCompanyIds: [5] }, now).map(x => x.id)).toEqual([1]);
  });

  it("applies country and sector filters case-insensitively", () => {
    const rows = [company(1), company(2, { countryCode: "JP", sector: "Industrials" })];
    expect(eligibleCompanies(rows, { countryCodes: ["jp"], sectors: ["industrials"] }, now).map(x => x.id)).toEqual([2]);
  });

  it("produces a complete cycle with no duplicates", () => {
    const rows = [company(1), company(2), company(3), company(4)];
    const cycle = createRotationCycle(rows, {}, () => 0, now);
    expect(cycle).toHaveLength(4);
    expect(new Set(cycle.map(x => x.id)).size).toBe(4);
  });

  it("fails closed when no verified active companies match", () => {
    expect(() => createRotationCycle([company(1, { listingStatus: "unverified" })], {}, Math.random, now))
      .toThrow("No currently verified active companies match");
  });

  it("validates random source bounds", () => {
    expect(() => shuffledRotation([1, 2], () => 1)).toThrow("Random source");
  });
});
