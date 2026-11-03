import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { ownerLinks } from "./components/TradeSettingsAdminGuide";
import { tradeSettingsOwnershipRegistry, tradeSettingsRouteOwnerIds } from "./trade-settings-ownership";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("./components/AdminTradingHistory.tsx", import.meta.url), "utf8");
const operations = readFileSync(new URL("./components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("dedicated Trading History owner contract", () => {
  const routes = adminNavigationGroups.flatMap((group) => group.items);
  const historyRoutes = routes.filter((route) => route.id === "trade-history");

  it("keeps Trading History a unique Trade Settings destination distinct from settlement and Finance ledger owners", () => {
    expect(historyRoutes).toHaveLength(1);
    expect(historyRoutes[0]).toMatchObject({ id: "trade-history", target: "tradeHistory", label: "Trading History" });
    expect(routes.filter((route) => route.target === "tradeHistory")).toHaveLength(1);
    expect(historyRoutes[0]?.target).not.toBe("transactionReview");
    expect(historyRoutes[0]?.target).not.toBe("wallet");
    expect(tradeSettingsRouteOwnerIds).toContain("trade-history");
    expect(tradeSettingsOwnershipRegistry.filter((entry) => entry.ownerRoute === "trade-history")).toHaveLength(1);
    expect(tradeSettingsOwnershipRegistry.find((entry) => entry.key === "trade.history.read")).toMatchObject({
      ownerRoute: "trade-history", readQuery: "adminOperations.tradingHistory", saveMutation: null, availability: "locked",
    });
    expect(ownerLinks.filter((link) => link.routeId === "trade-history")).toMatchObject([{ target: "tradeHistory", label: "Trading History" }]);
    const settlement = routes.find((route) => route.id === "trade-settlement");
    const walletLedger = routes.find((route) => route.id === "wallet-ledger");
    expect(settlement?.target).toBe("transactionReview");
    expect(walletLedger?.target).not.toBe("tradeHistory");
  });

  it("mounts the dedicated component at its route without reusing the settlement page", () => {
    expect(app).toContain('section==="tradeHistory"&&<Suspense');
    expect(app).toContain("<AdminTradingHistory/>");
    expect(app).toContain('const AdminTradingHistory = lazy(() => import("@/components/AdminTradingHistory"))');
    expect(component).toContain("trpc.adminOperations.tradingHistory.useQuery");
    expect(operations).not.toContain("trpc.adminOperations.tradingHistory.useQuery");
  });

  it("exposes only persisted lifecycle/result evidence, clearly bounds scans and has no write controls", () => {
    for (const field of ["confirmedAt", "completionAt", "settledAt", "settlementConfirmedAt", "settlementReference", "settlementOutcome", "realizedGrossProfitMinor", "platformFeeMinor", "netProfitMinor", "walletUpdatedAt"]) {
      expect(component).toContain(field);
    }
    expect(component).toContain("actualResultAvailable");
    expect(component).toContain('label>Trade record date from (UTC)');
    expect(component).toContain("persisted confirmer, confirmation time, reference, and recognized outcome");
    expect(component).toContain('trade.realizedGrossProfitMinor ?? "Unavailable"');
    expect(component).toContain("bounded scan window");
    expect(component).toContain("No matching records in this scanned window");
    expect(component).toContain("Scan next window");
    expect(component).toContain("useQuery");
    expect(component).not.toContain("useMutation");
    expect(component).not.toMatch(/\.mutate(?:Async)?\s*\(/);
    expect(component).not.toContain("confirmManualSettlement");
    expect(component).not.toContain("walletLedgerReconciliation");
    expect(component).not.toContain("ledgerActivity");
  });
});
