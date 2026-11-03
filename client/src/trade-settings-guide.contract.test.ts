import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { fieldGlossary, ownerLinks, statusDefinitions, troubleshooting } from "./components/TradeSettingsAdminGuide";
import { tradeSettingsOwnershipRegistry } from "./trade-settings-ownership";

const guideSource = readFileSync(new URL("./components/TradeSettingsAdminGuide.tsx", import.meta.url), "utf8");
const tradeRoutes = adminNavigationGroups.find((group) => group.id === "trade-settings")?.items ?? [];
const ownerRoutes = tradeRoutes.filter((route) => route.id !== "trade-admin-guide");

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

  it("refreshes the reviewed-source SHA to the requested starting HEAD", () => {
    expect(guideSource).toContain("21a8221405979794f210b2d3222741392b857984");
    expect(guideSource).not.toContain("32215a3f48b52fb901d9efc4b0760e25eb74faf9");
  });

  it("distinguishes open offers, informational delivery, allocation, review, settlement and payout", () => {
    const expectedTerms = [
      "Published / open offer",
      "Delivered",
      "Received / rendered",
      "Allocation",
      "Awaiting review",
      "Confirmed / awaiting credit",
      "Settled",
      "Payout requested",
    ];
    expect(statusDefinitions.map((status) => status.term)).toEqual(expectedTerms);

    expect(byTerm("Published / open offer")?.description).toContain("does not mean delivered");
    expect(byTerm("Delivered")?.description).toContain("not a synthetic offer");
    expect(byTerm("Received / rendered")?.description).toContain("not allocation");
    expect(byTerm("Allocation")?.description).toContain("locked OFF");
    expect(byTerm("Awaiting review")?.description).toContain("evidence-based review");
    expect(byTerm("Confirmed / awaiting credit")?.description).toContain("posting is not yet complete");
    expect(byTerm("Settled")?.description).toContain("ledger posting are complete");
    expect(byTerm("Payout requested")?.description).toContain("distinct from trade review/settlement");
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
