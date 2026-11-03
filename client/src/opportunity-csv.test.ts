import { describe, expect, it } from "vitest";
import { parseOpportunityCsv } from "./opportunity-csv";

const header = "symbol,venueFrom,venueTo,currency,minimumMinor,expectedRewardBps,durationSeconds,sourceReference,reviewNotes";

describe("parseOpportunityCsv", () => {
  it("requires per-row source and review fields and normalizes preserved publication evidence", () => {
    const rows = parseOpportunityCsv(`${header}\nABC,Venue A,Venue B,usd,1000,85,60,https://source.example/item-1,Reviewed against source item 1`);
    expect(rows).toEqual([{
      symbol: "ABC",
      venueFrom: "Venue A",
      venueTo: "Venue B",
      currency: "USD",
      minimumMinor: 1000,
      expectedRewardBps: 85,
      durationSeconds: 60,
      sourceReference: "https://source.example/item-1",
      reviewNotes: "Reviewed against source item 1",
    }]);
  });

  it("supports quoted commas and newlines in reviewer notes", () => {
    const rows = parseOpportunityCsv(`${header}\nABC,Venue A,Venue B,USD,1000,85,60,ref-1,"Reviewed,\nthen approved"`);
    expect(rows[0]?.reviewNotes).toBe("Reviewed,\nthen approved");
  });

  it("rejects missing provenance headers and any invalid row instead of silently dropping it", () => {
    expect(() => parseOpportunityCsv("symbol,venueFrom,venueTo,currency,minimumMinor,expectedRewardBps,durationSeconds\nABC,A,B,USD,1000,85,60"))
      .toThrow("sourceReference/evidenceReference column");
    expect(() => parseOpportunityCsv(`${header}\nABC,A,B,USD,1000,85,60,ref-1,Reviewed\n, A,B,USD,1000,85,60,ref-2,Reviewed`))
      .toThrow("CSV row 3: symbol");
  });

  it("rejects malformed quoting, duplicate provenance columns, and invalid numeric bounds", () => {
    expect(() => parseOpportunityCsv(`${header}\nABC,A,B,USD,1000,85,60,ref-1,"unclosed`)).toThrow("unterminated quoted field");
    expect(() => parseOpportunityCsv(`${header},evidenceReference\nABC,A,B,USD,1000,85,60,ref-1,Reviewed,ref-2`)).toThrow("exactly one sourceReference/evidenceReference column");
    expect(() => parseOpportunityCsv(`${header}\nABC,A,B,USD,1000,5001,60,ref-1,Reviewed`)).toThrow("expectedRewardBps must be from 1 through 5000");
  });
});
