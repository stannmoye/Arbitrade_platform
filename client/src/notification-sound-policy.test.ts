import { describe, expect, it } from "vitest";
import { notificationSoundKeyForCategory } from "./notification-sound-policy";

describe("notification category sound policy", () => {
  it.each([
    ["deposit", "deposit"],
    ["withdrawal", "withdrawal"],
    ["ledger_credit", "credit"],
    ["ledger_debit", "debit"],
    ["trading", "trading"],
    ["trading_reward", "trading"],
    ["mining", "mining"],
    ["mining_reward", "mining"],
    ["support", "support"],
    ["announcement", "announcement"],
    ["promotion", "announcement"],
    ["platform_update", "announcement"],
    ["security", "failure"],
    ["account", "default"],
    ["transaction", "default"],
    ["future_category", "default"],
    [null, "default"],
    [undefined, "default"],
  ] as const)("maps %s to %s", (category, expected) => {
    expect(notificationSoundKeyForCategory(category)).toBe(expected);
  });
});
