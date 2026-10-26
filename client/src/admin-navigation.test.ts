import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";

describe("Trade Settings administrator navigation", () => {
  it("provides one top-level Trade Settings group for trading operations", () => {
    const tradeGroups = adminNavigationGroups.filter((group) => group.label === "Trade Settings");
    expect(tradeGroups).toHaveLength(1);
    expect(adminNavigationGroups.some((group) => group.label === "Opportunities")).toBe(false);
  });

  it("exposes the documented trading policy and operations destinations", () => {
    const group = adminNavigationGroups.find((item) => item.id === "trade-settings");
    expect(group).toBeDefined();
    const labels = group!.items.map((item) => item.label);
    expect(labels).toEqual([
      "Overview",
      "Packages & Eligibility",
      "Package Quotas & Customer Limits",
      "Opportunity Schedule",
      "Trade Duration & Closing Rules",
      "Capital Allocation & Wallet Rules",
      "Profit, Fees & Earnings Limits",
      "Retries & Carry-Forward",
      "Company Catalogue & Rotation",
      "Trade Pop-up & Customer Display",
      "Notifications",
      "Active Trades & Pending Work",
      "Settlement & Reconciliation",
      "System Health & Pause Controls",
      "Audit Log & Policy Versions",
    ]);
  });

  it("routes every Trade Settings item to an existing portal destination", () => {
    const group = adminNavigationGroups.find((item) => item.id === "trade-settings");
    expect(group).toBeDefined();
    const supportedTargets = new Set([
      "overview", "customers", "transactionReview", "credit", "debit", "currencies",
      "mining", "opportunity", "deliveryMonitor", "packages", "kycCenter",
      "verificationOversight", "riskWatchlist", "emailCenter", "smtpCenter",
      "suiteTickets", "notificationCenter", "communicationSettings", "signup",
      "policies", "privacyManagement", "settings", "sound", "branding",
      "appearance", "apis", "audit", "reportsExports", "tradeSystemHealth",
    ]);
    for (const item of group!.items) expect(supportedTargets.has(item.target), item.label).toBe(true);
  });
});
