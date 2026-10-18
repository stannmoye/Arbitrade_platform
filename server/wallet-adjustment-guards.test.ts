import { describe, expect, it } from "vitest";
import {
  assertWalletAdjustmentAmount,
  assertWalletBalanceSnapshot,
} from "./wallet-adjustment-guards";

describe("wallet adjustment safety guards", () => {
  it("accepts positive safe integer amounts", () => {
    expect(() => assertWalletAdjustmentAmount(1)).not.toThrow();
    expect(() => assertWalletAdjustmentAmount(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it.each([0, -1, 1.25, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid amount %s",
    amount => expect(() => assertWalletAdjustmentAmount(amount)).toThrow(/positive safe integer/),
  );

  it("rejects unsafe stored balances", () => {
    expect(() => assertWalletBalanceSnapshot(Number.MAX_SAFE_INTEGER + 1, 0, 1, "credit"))
      .toThrow(/safe integer range/);
  });

  it.each([
    [-1, 0],
    [0, -1],
  ])("rejects negative stored wallet balances (%s available, %s promotional)", (available, promotional) => {
    expect(() => assertWalletBalanceSnapshot(available, promotional, 1, "credit"))
      .toThrow(/Wallet balance cannot be negative/);
  });

  it("allows a debit equal to the full available balance", () => {
    expect(() => assertWalletBalanceSnapshot(10, 0, 10, "debit")).not.toThrow();
  });

  it("rejects debits beyond the available balance", () => {
    expect(() => assertWalletBalanceSnapshot(10, 0, 11, "debit"))
      .toThrow(/Debit exceeds available wallet balance/);
  });

  it("rejects credits that would overflow available or promotional balance", () => {
    expect(() => assertWalletBalanceSnapshot(Number.MAX_SAFE_INTEGER, 0, 1, "credit"))
      .toThrow(/credit would exceed/);
    expect(() => assertWalletBalanceSnapshot(0, Number.MAX_SAFE_INTEGER, 1, "credit"))
      .toThrow(/credit would exceed/);
  });

  it("allows a credit that lands exactly on the safe integer boundary", () => {
    expect(() => assertWalletBalanceSnapshot(Number.MAX_SAFE_INTEGER - 1, 0, 1, "credit"))
      .not.toThrow();
  });
});
