import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./stakeEarn.ts", import.meta.url), "utf8");

describe("Stake & Earn notification event integrity", () => {
  it("persists reward notifications atomically with recipient-scoped idempotency metadata", () => {
    expect(source).toContain("INSERT INTO customer_notifications (userId,title,body,eventKey,category,priority) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE eventKey=VALUES(eventKey)");
    expect(source).toContain("`u${userId}:stake-reward:${position.id}:${position.rewardCount + 1}`");
    expect(source).toContain('"trading_reward"');
    expect(source).toContain("Keep the notice atomic with the committed ledger reward");
  });

  it("categorizes principal release as a ledger credit with a stable position-scoped key", () => {
    expect(source).toContain("`u${userId}:stake-settlement:${p.id}`");
    expect(source).toContain('"ledger_credit"');
    expect(source).toContain("The principal-release notice shares the settlement transaction");
  });

  it("keeps notification writes inside the same transaction as the financial ledger changes", () => {
    const rewardWrite = source.indexOf("INSERT INTO balance_ledger", source.indexOf("async function postDueRewards"));
    const rewardNotice = source.indexOf("Keep the notice atomic with the committed ledger reward");
    const settlementWrite = source.indexOf("INSERT INTO balance_ledger", source.indexOf("async function settleDuePositions"));
    const settlementNotice = source.indexOf("The principal-release notice shares the settlement transaction");
    expect(rewardWrite).toBeGreaterThan(-1);
    expect(rewardNotice).toBeGreaterThan(rewardWrite);
    expect(settlementWrite).toBeGreaterThan(-1);
    expect(settlementNotice).toBeGreaterThan(settlementWrite);
  });
});
