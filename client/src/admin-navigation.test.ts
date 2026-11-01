import { describe, expect, it } from "vitest";
import { adminNavigationGroups, adminPrimaryNavigationGroups, adminSecondaryNavigationGroups, adminSecondaryNavigationGroupIds } from "./admin-navigation";

describe("Trading administrator navigation", () => {
  const group = (id: string) => adminNavigationGroups.find((item) => item.id === id);

  it("keeps all Trading destinations in one clearly named Trade Settings group", () => {
    const tradeGroup = group("trade-settings");
    expect(tradeGroup?.label).toBe("Trade Settings");
    expect(tradeGroup?.items.map((item) => item.label)).toEqual([
      "Trading Overview",
      "Tiers & Eligibility",
      "Daily Delivery Caps",
      "Offer Rules & Capital Limits",
      "Publish & Manage Opportunities",
      "Delivery Schedule",
      "Trade Duration & Closing",
      "Customer Pop-up Display",
      "Company Rotation Rules",
      "Company Catalogue",
      "Capital & Wallet Funding Rules",
      "Fees & Earnings Limits",
      "Retries & Carry-Forward",
      "Active & Pending Opportunities",
      "Settlement & Reconciliation",
      "System Pause & Safety",
      "Worker Health & Recovery",
      "Audit & Policy History",
      "Trade Settings Guide",
    ]);
    expect(adminNavigationGroups.filter((item) => item.id.startsWith("trade-"))).toHaveLength(1);
    expect(adminNavigationGroups.some((item) => ["trade-setup", "trade-offers", "trade-results", "trade-monitoring", "trade-history"].includes(item.id))).toBe(false);
  });

  it("places the plain-language guide after Worker Health as the final Trading submenu", () => {
    const tradeItems = adminNavigationGroups.filter((item) => item.id.startsWith("trade-")).flatMap((item) => item.items);
    const workerIndex = tradeItems.findIndex((item) => item.id === "trade-worker-health");
    const guideIndex = tradeItems.findIndex((item) => item.id === "trade-admin-guide");
    expect(workerIndex).toBeGreaterThanOrEqual(0);
    expect(guideIndex).toBeGreaterThan(workerIndex);
    expect(guideIndex).toBe(tradeItems.length - 1);
    expect(tradeItems[guideIndex]?.target).toBe("tradeAdminGuide");
  });

  it("routes each Trade Settings submenu to its single intended screen", () => {
    expect(group("trade-settings")?.items.map((item) => item.target)).toEqual([
      "tradeSystemOverview", "packages", "packages", "packages", "opportunity", "packages",
      "tradeDurationRules", "tradeCustomerDisplay", "packages", "companyCatalogue",
      "transactionReview", "transactionReview", "tradeRetryPolicy", "deliveryMonitor",
      "transactionReview", "tradeSystemHealth", "tradeWorkerHealth", "audit", "tradeAdminGuide",
    ]);
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-company-rotation")?.focus).toBe("rotation");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-company-catalogue")?.target).toBe("companyCatalogue");
  });

  it("moves the five requested administrative sections and all their submenu entries to the right drawer", () => {
    expect(adminSecondaryNavigationGroups.map((item) => item.id)).toEqual([...adminSecondaryNavigationGroupIds]);
    expect(adminSecondaryNavigationGroups.map((item) => item.label)).toEqual([
      "Verification & Risk", "Communications", "Platform Configuration", "Integrations", "Governance & Reports",
    ]);
    expect(adminPrimaryNavigationGroups.some((item) => adminSecondaryNavigationGroupIds.includes(item.id as typeof adminSecondaryNavigationGroupIds[number]))).toBe(false);
    expect(adminSecondaryNavigationGroups.flatMap((group) => group.items).map((item) => item.label)).toContain("Support Tickets");
    expect(adminSecondaryNavigationGroups.flatMap((group) => group.items).map((item) => item.label)).toContain("Reports & Exports");
  });

  it("does not expose quick-create shortcuts in the secondary drawer registry", () => {
    const secondaryLabels = adminSecondaryNavigationGroups.flatMap((group) => group.items).map((item) => item.label);
    expect(secondaryLabels).not.toEqual(expect.arrayContaining(["Add Customer", "Credit Adjustment", "Debit Adjustment", "Create Offer", "Compose Email"]));
  });
});
