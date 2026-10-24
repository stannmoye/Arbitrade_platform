import { describe, expect, it } from "vitest";
import { resolveEffectiveAutoTradeEnabled, shouldExecuteAutomaticTrades } from "./auto-trade-policy";

describe("effective automatic-trading policy", () => {
  it("uses the global setting for customers set to inherit", () => {
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: true, globalDefaultEnabled: false, customerMode: "inherit" })).toBe(false);
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: true, globalDefaultEnabled: true, customerMode: "inherit" })).toBe(true);
  });

  it("honours an explicit customer ON override when the global default is OFF", () => {
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: true, globalDefaultEnabled: false, customerMode: "enabled" })).toBe(true);
  });

  it("honours an explicit customer OFF override when the global default is ON", () => {
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: true, globalDefaultEnabled: true, customerMode: "disabled" })).toBe(false);
  });

  it("never lets a customer override bypass the package-level safety switch", () => {
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: false, globalDefaultEnabled: true, customerMode: "enabled" })).toBe(false);
    expect(resolveEffectiveAutoTradeEnabled({ packageEnabled: false, globalDefaultEnabled: true, customerMode: "inherit" })).toBe(false);
  });
});

describe("automatic trade execution entry point", () => {
  it("does not execute allocations from a normal customer feed query", () => {
    expect(shouldExecuteAutomaticTrades()).toBe(false);
    expect(shouldExecuteAutomaticTrades({ executeAutomaticTrades: false })).toBe(false);
  });
  it("allows the explicit background scheduler to execute allocations", () => {
    expect(shouldExecuteAutomaticTrades({ executeAutomaticTrades: true })).toBe(true);
  });
});