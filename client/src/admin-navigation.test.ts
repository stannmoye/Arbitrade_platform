import { describe, expect, it } from "vitest";
import { adminNavigationGroups, isAdminNavigationItemActive } from "./admin-navigation";

describe("Trade Settings administrator navigation", () => {
  it("provides one top-level Trade Settings group for trading operations", () => {
    const tradeGroups = adminNavigationGroups.filter((group) => group.label === "Trade Settings");
    expect(tradeGroups).toHaveLength(1);
    expect(adminNavigationGroups.some((group) => group.label === "Opportunities")).toBe(false);
  });

  it("exposes only the current functional Trade Settings destinations", () => {
    const group = adminNavigationGroups.find((item) => item.id === "trade-settings");
    expect(group).toBeDefined();
    const labels = group!.items.map((item) => item.label);
    expect(labels).toEqual([
      "Overview",
      "Packages & Eligibility",
      "Opportunity Operations",
      "Delivery Activity",
      "Trade Timing & Display",
      "Trade Notifications",
      "Ledger, Fees & Settlement",
      "Allocation Pause",
      "Audit Log",
    ]);
  });

  it("routes each visible Trade Settings item to its own existing portal destination", () => {
    const group = adminNavigationGroups.find((item) => item.id === "trade-settings");
    expect(group).toBeDefined();
    const supportedTargets = new Set([
      "overview", "tradeOverview", "tradeDisplaySettings", "customers", "transactionReview", "credit", "debit", "currencies",
      "mining", "opportunity", "deliveryMonitor", "packages", "kycCenter",
      "verificationOversight", "riskWatchlist", "emailCenter", "smtpCenter",
      "suiteTickets", "notificationCenter", "communicationSettings", "signup",
      "policies", "privacyManagement", "settings", "sound", "branding",
      "appearance", "apis", "audit", "reportsExports", "tradeSystemHealth",
    ]);
    for (const item of group!.items) expect(supportedTargets.has(item.target), item.label).toBe(true);
    expect(new Set(group!.items.map((item) => item.target)).size).toBe(group!.items.length);
  });

  it("highlights one Trade submenu without activating another group sharing its route", () => {
    const group = adminNavigationGroups.find((item) => item.id === "trade-settings")!;
    const finance = adminNavigationGroups.find((item) => item.id === "finance")!;
    const selectedTradeItemId = "trade-settlement-reconciliation";
    const activeTradeItems = group.items.filter((item) => isAdminNavigationItemActive({
      groupId: group.id,
      itemId: item.id,
      target: item.target,
      section: "transactionReview",
      selectedTradeItemId,
    }));
    const activeFinanceItems = finance.items.filter((item) => isAdminNavigationItemActive({
      groupId: finance.id,
      itemId: item.id,
      target: item.target,
      section: "transactionReview",
      selectedTradeItemId,
    }));
    expect(activeTradeItems.map((item) => item.id)).toEqual([selectedTradeItemId]);
    expect(activeFinanceItems).toHaveLength(0);
  });
});
