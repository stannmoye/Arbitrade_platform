import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { ownerLinks, statusDefinitions, troubleshooting } from "./components/TradeSettingsAdminGuide";

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

  it("routes troubleshooting links through current navigation IDs and destinations", () => {
    for (const item of troubleshooting) {
      const route = ownerRoutes.find((candidate) => candidate.id === item.routeId);
      expect(route, `${item.issue} route is registered`).toBeDefined();
      expect(item.target, `${item.issue} target`).toBe(route?.target);
      expect(item.focus, `${item.issue} focus`).toBe(route?.focus);
      expect(item.description.trim().length).toBeGreaterThan(20);
    }
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
