import { describe, expect, it } from "vitest";
import { assertExactlyOneSettlementClaim } from "./mining-settlement-guards";

describe("mining settlement row claim guard", () => {
  it("accepts exactly one pending reward transition", () => {
    expect(() => assertExactlyOneSettlementClaim(1, "mining-boost-settlement:123")).not.toThrow();
  });

  it.each([0, 2, -1, undefined, null])("rejects an unexpected affected-row count: %s", affectedRows => {
    expect(() => assertExactlyOneSettlementClaim(affectedRows, "mining-boost-settlement:123"))
      .toThrow(/expected exactly one pending-row update/);
  });
});
