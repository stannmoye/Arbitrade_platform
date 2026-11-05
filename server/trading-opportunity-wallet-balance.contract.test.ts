import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const popupBalanceStart = databaseSource.indexOf("const lifecycleIds=await ensurePopupDeliveries(newlyEligible.map(offer=>{");
const popupBalanceEnd = databaseSource.indexOf("const missingLifecycleIds", popupBalanceStart);
const popupBalanceSource = databaseSource.slice(popupBalanceStart, popupBalanceEnd);

describe("Trading opportunity combined wallet balance assessment", () => {
  it("values all enabled wallets in the opportunity currency rather than selecting one matching wallet", () => {
    expect(popupBalanceStart).toBeGreaterThanOrEqual(0);
    expect(popupBalanceEnd).toBeGreaterThan(popupBalanceStart);
    expect(popupBalanceSource).toContain("calculateCombinedAvailableBalanceMinor");
    expect(popupBalanceSource).toContain("wallets:balancesSnapshot.map");
    expect(popupBalanceSource).toContain("availableMinor:Number(wallet.availableMinor||0)");
    expect(popupBalanceSource).toContain('available===null?"unknown"');
    expect(popupBalanceSource).not.toContain("balancesSnapshot.find");
  });

  it("keeps the popup balance check informational and does not enable financial allocation", () => {
    expect(popupBalanceSource).toContain("informational only");
    expect(databaseSource).toContain("AUTOMATIC_FINANCIAL_EXECUTION_ENABLED");
  });
});
