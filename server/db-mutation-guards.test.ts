import { describe, expect, it } from "vitest";
import { assertExactlyOneAffectedRow } from "./db-mutation-guards";

describe("database mutation guards", () => {
  it("accepts the mysql2 ResultSetHeader tuple when one row was updated", () => {
    expect(() => assertExactlyOneAffectedRow([{ affectedRows: 1 }, []], "settlement"))
      .not.toThrow();
  });

  it("accepts a direct ResultSetHeader shape", () => {
    expect(() => assertExactlyOneAffectedRow({ affectedRows: 1 }, "wallet update"))
      .not.toThrow();
  });

  it.each([
    ["zero rows", [{ affectedRows: 0 }, []]],
    ["multiple rows", [{ affectedRows: 2 }, []]],
    ["missing driver metadata", [ {}, []]],
    ["missing result", undefined],
  ])("fails closed for %s", (_label, result) => {
    expect(() => assertExactlyOneAffectedRow(result, "manual trade settlement"))
      .toThrow(/expected exactly one affected row/);
  });
});
