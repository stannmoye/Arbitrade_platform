import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { fieldGlossary, ownerLinks, relatedOwnerLinks, statusDefinitions, troubleshooting } from "./components/TradeSettingsAdminGuide";
import { tradeSettingsOwnershipRegistry } from "./trade-settings-ownership";

const guideSource = readFileSync(new URL("./components/TradeSettingsAdminGuide.tsx", import.meta.url), "utf8");
const handbookSource = readFileSync(new URL("../../docs/admin-portal-menu-guide.md", import.meta.url), "utf8");
const adminManualSource = readFileSync(new URL("../../docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md", import.meta.url), "utf8");
const reconciliationSource = readFileSync(new URL("../../docs/trading/TRADE_SETTINGS_ADMIN_BLUEPRINT_RECONCILIATION.md", import.meta.url), "utf8");
const tradeRoutes = adminNavigationGroups.find((group) => group.id === "trade-settings")?.items ?? [];
const ownerRoutes = tradeRoutes.filter((route) => route.id !== "trade-admin-guide");
const handbookTradeSubmenu = handbookSource.split("### Trade Settings submenu\n")[1]?.split("\n### One owner for each setting")[0] ?? "";
const handbookRouteLabels = [...handbookTradeSubmenu.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map(([, label]) => label);

const byTerm = (term: string) => statusDefinitions.find((status) => status.term === term);

describe("mounted Trade Settings Guide contract", () => {
  it("links to every current non-Guide Trade Settings navigation destination", () => {
    expect(ownerRoutes.length).toBeGreaterThan(0);
    expect(ownerLinks.map(({ routeId, label, target, focus }) => ({ routeId, label, target, focus }))).toEqual(
      ownerRoutes.map(({ id: routeId, label, target, focus }) => ({ routeId, label, target, focus })),
    );
    expect(new Set(ownerLinks.map((link) => link.routeId)).size).toBe(ownerLinks.length);
    for (const link of ownerLinks) {
      expect(link.description.trim().length, `${link.routeId} explanation`).toBeGreaterThan(20);
    }
  });

  it("keeps the handbook destination list aligned with current registered Trade Settings routes", () => {
    expect(handbookRouteLabels).toEqual(tradeRoutes.map((route) => route.label));
  });

  it("links to Finance as the sole Database Entries owner and keeps package fee editing under one owner", () => {
    const financeWalletRoute = adminNavigationGroups.find((group) => group.id === "finance")?.items.find((route) => route.id === "wallet-ledger");
    expect(financeWalletRoute).toBeDefined();
    expect(relatedOwnerLinks.map(({ routeId, label, target, focus }) => ({ routeId, label, target, focus }))).toEqual([
      { routeId: financeWalletRoute?.id, label: "Finance → Wallet & Ledger / Database Entries", target: financeWalletRoute?.target, focus: financeWalletRoute?.focus },
    ]);
    expect(tradeRoutes.some((route) => route.id === "wallet-ledger")).toBe(false);
    expect(relatedOwnerLinks[0]?.description).toContain("Finance remains the sole owner");
    expect(guideSource).toContain("Related owner outside Trade Settings");
    expect(ownerLinks.find((link) => link.routeId === "trade-fees-earnings")?.description).toContain("single active package-specific fee editor is under Tiers & Eligibility");
    expect(handbookTradeSubmenu).toContain("sole active package-specific fee editor is under Tiers & Eligibility");
    expect(handbookSource).toContain("does not create a second Database Entries owner");
    expect(adminManualSource).toContain("The only active package-specific, versioned fee editor is embedded under **Tiers & Eligibility**");
    expect(adminManualSource).toContain("The **Trade Settings Guide** provides a navigation-only shortcut to **Finance → Wallet & Ledger / Database Entries**");
    expect(adminManualSource).toContain("**Manual Payouts**");
    expect(handbookSource).toContain("trading/TRADE_SETTINGS_ADMIN_BLUEPRINT_RECONCILIATION.md");
    expect(reconciliationSource).toContain("The PDF is reconciled to the following map");
    expect(reconciliationSource).toContain("Remains the sole read-only wallet-activity view.");
    expect(reconciliationSource).toContain("The previous-settlement prerequisite is now an audited global ON/OFF control");
  });

  it("projects every ownership-registry entry into a complete glossary row with its registered owner link", () => {
    expect(fieldGlossary).toHaveLength(tradeSettingsOwnershipRegistry.length);
    expect(fieldGlossary.map((entry) => entry.key)).toEqual(tradeSettingsOwnershipRegistry.map((entry) => entry.key));
    expect(fieldGlossary).toEqual(tradeSettingsOwnershipRegistry.map((entry) => ({
      key: entry.key,
      label: entry.label,
      scope: entry.scope === "global" ? "Global" : entry.scope === "package" ? "One package/tier" : "One operational record",
      units: entry.units,
      validation: entry.validation,
      effectiveTime: entry.effectiveTime,
      customerImpact: entry.customerImpact,
      ownerRoute: entry.ownerRoute,
    })));
    for (const entry of fieldGlossary) {
      expect(entry.label.trim(), `${entry.key} label`).not.toBe("");
      expect(entry.scope.trim(), `${entry.key} scope`).not.toBe("");
      expect(entry.units.trim(), `${entry.key} units`).not.toBe("");
      expect(entry.validation.trim(), `${entry.key} validation/range`).not.toBe("");
      expect(entry.effectiveTime.trim(), `${entry.key} effective time`).not.toBe("");
      expect(entry.customerImpact.trim(), `${entry.key} customer impact`).not.toBe("");
      expect(ownerLinks.find((link) => link.routeId === entry.ownerRoute), `${entry.key} owner link`).toBeDefined();
    }
    expect(guideSource).toContain("Read-only field glossary");
    expect(guideSource).toContain("Units / range");
    expect(guideSource).toContain("no separate default-value field");
  });

  it("routes troubleshooting links through current navigation IDs and destinations", () => {
    for (const item of troubleshooting) {
      const route = ownerRoutes.find((candidate) => candidate.id === item.routeId);
      expect(route, `${item.issue} route is registered`).toBeDefined();
      expect(item.target, `${item.issue} target`).toBe(route?.target);
      expect(item.focus, `${item.issue} focus`).toBe(route?.focus);
      expect(item.description.trim().length).toBeGreaterThan(20);
    }
  });

  it("explains how to prepare a tier and check the informational-delivery prerequisites", () => {
    for (const phrase of [
      "Prepare a package (tier)",
      "qualifying threshold in USD minor units",
      "calendar months",
      "future automatic assignments",
      "valid saved policy",
      "administrator-published open opportunity",
      "remaining quota",
      "due schedule",
      "healthy delivery worker",
      "Market-data refresh is not opportunity publication",
    ]) {
      expect(guideSource).toContain(phrase);
    }
  });

  it("describes current source alignment without pinning the Guide to a commit SHA", () => {
    expect(guideSource).toContain("current Trade Settings navigation and ownership registry");
    expect(guideSource).not.toMatch(/\b[a-f0-9]{40}\b/i);
    expect(guideSource).not.toMatch(/source baseline/i);
  });

  it("documents persisted delivery, funding, settlement and payout lifecycle states distinctly", () => {
    const expectedTerms = [
      "Generated",
      "Generated / open customer offer",
      "Queued delivery",
      "Delivery in progress",
      "Delivery retry wait",
      "Persisted delivery record",
      "Received",
      "Rendered",
      "Failed delivery",
      "Dismissed delivery",
      "Expired delivery",
      "Allocation",
      "Awaiting review",
      "Funding delayed",
      "Settled",
      "Funding unavailable",
      "Payout requested",
    ];
    expect(statusDefinitions.map((status) => status.term)).toEqual(expectedTerms);

    expect(byTerm("Generated")?.description).toContain("does not mean a delivery record was queued, received or rendered");
    expect(byTerm("Generated / open customer offer")?.description).toContain("does not mean delivered");
    expect(byTerm("Persisted delivery record")?.description).toContain("persistence alone is never reported as customer receipt or display");
    expect(byTerm("Queued delivery")?.description).toContain("deliveryStatus=queued");
    expect(byTerm("Delivery in progress")?.description).toContain("deliveryStatus=in_progress");
    expect(byTerm("Delivery retry wait")?.description).toContain("deliveryStatus=retry_wait");
    expect(byTerm("Received")?.description).toContain("deliveryStatus=received");
    expect(byTerm("Rendered")?.description).toContain("deliveryStatus=rendered");
    expect(byTerm("Failed delivery")?.description).toContain("deliveryStatus=failed is terminal");
    expect(byTerm("Dismissed delivery")?.description).toContain("deliveryStatus=dismissed is terminal");
    expect(byTerm("Expired delivery")?.description).toContain("deliveryStatus=expired is terminal");
    expect(byTerm("Allocation")?.description).toContain("locked OFF");
    expect(byTerm("Awaiting review")?.description).toContain("evidence-based review");
    expect(byTerm("Funding delayed")?.description).toContain("settlementStatus=confirmed_awaiting_credit");
    expect(byTerm("Funding unavailable")?.description).toContain("balanceStatus=insufficient");
    expect(byTerm("Funding unavailable")?.description).toContain("no funding, top-up, acceptance or posting action");
    expect(byTerm("Settled")?.description).toContain("ledger posting are complete");
    expect(byTerm("Payout requested")?.description).toContain("distinct from trade review/settlement");
  });

  it("links generated customer offers to their owner and documents optional template provenance", () => {
    const publishRoute = ownerRoutes.find((route) => route.id === "trade-opportunity-publishing");
    const publishLink = ownerLinks.find((link) => link.routeId === "trade-opportunity-publishing");
    expect(publishRoute?.target).toBe("opportunity");
    expect(publishLink?.target).toBe(publishRoute?.target);
    expect(publishLink?.description).toContain("Optional display templates are not required");
    expect(publishLink?.description).toContain("not independently verified");
    expect(byTerm("Generated / open customer offer")?.description).toContain("worker-generated record assigned to a customer/package");
    expect(byTerm("Generated / open customer offer")?.description).toContain("Historical unassigned manual/imported rows are not popup inputs");
    expect(troubleshooting.find((item) => item.routeId === "trade-opportunity-publishing")?.description)
      .toContain("Customer delivery uses only offers assigned to that customer");
  });

  it("explicitly identifies locked and unavailable functionality", () => {
    expect(guideSource).toContain("hard-locked OFF");
    expect(guideSource).toContain("Carry-forward across daily windows is not available");
    expect(guideSource).toContain("single persisted <code>trade.globalControls</code> record");
    expect(guideSource).toContain("Legacy per-package master columns are inert compatibility fields");
    expect(ownerLinks.find((link) => link.routeId === "trade-package-configuration")?.description).toContain("single persisted global trade-controls record");
  });

  it("contains no form fields, API calls, or mutation handlers", () => {
    expect(guideSource).not.toMatch(/<\s*(?:form|input|textarea|select)\b/i);
    expect(guideSource).not.toMatch(/\buseMutation\b|\btrpc\.|\.mutate(?:Async)?\s*\(|\bfetch\s*\(|\bonSubmit\s*=/);
    expect(guideSource).toContain("onNavigate(target, focus)");
  });
});
