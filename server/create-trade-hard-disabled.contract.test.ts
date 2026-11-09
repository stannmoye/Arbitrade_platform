import { describe, expect, it } from "vitest";
import { createTrade } from "./db";

describe("trade allocation financial sink guard", () => {
  it("fails closed when the database is unavailable", async () => {
    await expect(createTrade(1, { offerId: 1, amountMinor: 1 }))
      .rejects.toThrow(/Database is not available|Automatic trade allocation is disabled/);
  });
});
