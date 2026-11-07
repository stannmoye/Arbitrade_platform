import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { remainingOpportunityMilliseconds, remainingOpportunitySeconds } from "./customer-opportunity-countdown";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("customer opportunity countdown", () => {
  const closesAt = "2030-01-01T00:02:08.000Z";

  it("continues from the same saved close timestamp after a refresh", () => {
    const firstReadAt = Date.parse("2030-01-01T00:01:00.000Z");
    const refreshedAt = Date.parse("2030-01-01T00:01:05.000Z");
    expect(remainingOpportunityMilliseconds(closesAt, firstReadAt)).toBe(68_000);
    expect(remainingOpportunityMilliseconds(closesAt, refreshedAt)).toBe(63_000);
    expect(remainingOpportunitySeconds(closesAt, refreshedAt)).toBe(63);
    expect(app).toContain("remainingOpportunityMilliseconds(popup.closesAt,clockNow,serverClockOffsetMs.current)");
    expect(app).toContain("remainingOpportunityMilliseconds(popupRef.current?.closesAt,Date.now(),serverClockOffsetMs.current)");
  });

  it("applies the server clock sample without changing the saved deadline", () => {
    const now = Date.parse("2030-01-01T00:01:00.000Z");
    expect(remainingOpportunityMilliseconds(closesAt, now, 2_000)).toBe(66_000);
  });

  it("does not invent a fallback countdown for an invalid close timestamp", () => {
    expect(remainingOpportunityMilliseconds("invalid", Date.now())).toBeNull();
    expect(remainingOpportunitySeconds(null, Date.now())).toBeNull();
    expect(app).toContain("if(remainingMs===null)return;");
    expect(app).not.toContain("configuredSeconds*1000");
  });
});
