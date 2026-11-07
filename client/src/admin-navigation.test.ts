import { describe, expect, it } from "vitest";
import { adminNavigationGroups, adminPrimaryNavigationGroups, adminSecondaryNavigationGroups, adminSecondaryNavigationGroupIds } from "./admin-navigation";
import { tradeSettingsOwnershipRegistry } from "./trade-settings-ownership";

describe("Trading administrator navigation", () => {
  const group = (id: string) => adminNavigationGroups.find((item) => item.id === id);

  it("keeps all Trading destinations in one clearly named Trade Settings group", () => {
    const tradeGroup = group("trade-settings");
    expect(tradeGroup?.label).toBe("Trade Settings");
    expect(tradeGroup?.items.map((item) => item.label)).toEqual([
      "Trading Overview",
      "Package Configuration",
      "Tiers & Eligibility",
      "Per-tier Daily Delivery Caps",
      "Per-tier Offer Rules & Capital Limits",
      "Opportunity Generation & Management",
      "Per-tier Delivery Schedule",
      "Global Trade Timing & Settlement",
      "Post-completion Display Delay",
      "Per-tier Company Rotation Rules",
      "Company Catalogue",
      "Capital & Wallet Funding Rules",
      "Fees & Earnings Limits",
      "Retries & Carry-Forward",
      "Active & Pending Opportunities",
      "Opportunity Usage Reset",
      "Manual Payouts",
      "Settlement & Reconciliation",
      "Trading History",
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
      "tradeSystemOverview", "tradePackageConfiguration", "packages", "packages", "packages", "opportunity", "packages",
      "tradeDurationRules", "tradeCustomerDisplay", "packages", "companyCatalogue",
      "transactionReview", "transactionReview", "tradeRetryPolicy", "deliveryMonitor", "tradeOpportunityReset",
      "manualPayouts", "transactionReview", "tradeHistory", "tradeWorkerHealth", "audit", "tradeAdminGuide",
    ]);
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-package-configuration")?.target).toBe("tradePackageConfiguration");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-company-rotation")?.focus).toBe("rotation");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-company-catalogue")?.target).toBe("companyCatalogue");
    const payoutOwner = group("trade-settings")?.items.find((item) => item.id === "trade-manual-payouts");
    expect(payoutOwner?.target).toBe("manualPayouts");
    expect(adminNavigationGroups.flatMap((item) => item.items).filter((item) => item.target === "manualPayouts")).toHaveLength(1);
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-settlement")?.target).toBe("transactionReview");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-settlement")?.focus).toBe("reconciliation");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-history")?.target).toBe("tradeHistory");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-history")?.focus).toBeUndefined();
    expect(adminNavigationGroups.flatMap((item) => item.items).filter((item) => item.target === "tradeHistory")).toHaveLength(1);
    expect(adminNavigationGroups.flatMap((item) => item.items).find((item) => item.id === "wallet-ledger")?.focus).toBe("ledger");
    expect(group("trade-settings")?.items.find((item) => item.id === "trade-capital-funding")?.detail).toMatch(/unavailable; read-only/i);
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

  it("gives each registered control exactly one existing owner route", () => {
    const routes = new Set(adminPrimaryNavigationGroups.flatMap((item) => item.items.map((route) => route.id)));
    const keys = tradeSettingsOwnershipRegistry.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of tradeSettingsOwnershipRegistry) {
      expect(routes.has(entry.ownerRoute), `${entry.key} owner route ${entry.ownerRoute}`).toBe(true);
      expect(entry.readQuery.length).toBeGreaterThan(0);
      expect(entry.auditRequirement.length).toBeGreaterThan(0);
      expect(entry.customerImpact.length).toBeGreaterThan(0);
      if (entry.availability === "locked") expect(entry.saveMutation).toBeNull();
    }
  });
});
