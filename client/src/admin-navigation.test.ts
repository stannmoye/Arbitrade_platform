import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";

describe("Trading administrator navigation", () => {
  const group = (id: string) => adminNavigationGroups.find((item) => item.id === id);

  it("keeps the Trading destinations in their existing admin navigation groups", () => {
    expect(group("trade-setup")?.items.map((item) => item.label)).toEqual([
      "Trading home",
      "Customer tiers",
      "Daily trade allowance",
      "How trades finish",
    ]);
    expect(group("trade-offers")?.items.map((item) => item.label)).toEqual([
      "When offers appear",
      "Customer pop-up timing",
      "Company names shown",
    ]);
    expect(group("trade-results")?.items.map((item) => item.label)).toEqual([
      "Returns and fees",
      "Try failed trades again",
      "Check finished trades",
    ]);
    expect(group("trade-monitoring")?.items.map((item) => item.label)).toEqual([
      "Open and waiting work",
      "Pause new trades",
      "Worker health",
    ]);
  });

  it("places the plain-language guide after Worker Health as the final Trading submenu", () => {
    const tradeItems = adminNavigationGroups
      .filter((item) => item.id.startsWith("trade-"))
      .flatMap((item) => item.items);
    const workerIndex = tradeItems.findIndex((item) => item.id === "trade-worker-health");
    const guideIndex = tradeItems.findIndex((item) => item.id === "trade-admin-guide");

    expect(workerIndex).toBeGreaterThanOrEqual(0);
    expect(guideIndex).toBeGreaterThan(workerIndex);
    expect(guideIndex).toBe(tradeItems.length - 1);
    expect(tradeItems[guideIndex]?.target).toBe("tradeAdminGuide");
    expect(tradeItems[guideIndex]?.icon).toBeDefined();
  });

  it("keeps the existing destinations for the Trading operational screens", () => {
    expect(group("trade-setup")?.items.map((item) => item.target)).toEqual([
      "tradeSystemOverview",
      "packages",
      "packages",
      "tradeDurationRules",
    ]);
    expect(group("trade-offers")?.items.map((item) => item.target)).toEqual([
      "opportunity",
      "tradeCustomerDisplay",
      "opportunity",
    ]);
    expect(group("trade-results")?.items.map((item) => item.target)).toEqual([
      "transactionReview",
      "tradeRetryPolicy",
      "transactionReview",
    ]);
    expect(group("trade-monitoring")?.items.map((item) => item.target)).toEqual([
      "deliveryMonitor",
      "tradeSystemHealth",
      "tradeWorkerHealth",
    ]);
  });
});
