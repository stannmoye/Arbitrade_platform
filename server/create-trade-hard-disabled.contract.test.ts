import { describe, expect, it } from "vitest";
import { createTrade } from "./db";

describe("trade allocation financial sink hard-disable", () => {
  it("rejects direct allocation before database access while automatic execution is disabled", async () => {
    await expect(createTrade(1, { offerId: 1, amountMinor: 1 }))
      .rejects.toThrow("Automatic trade allocation is hard-disabled");
  });
});
