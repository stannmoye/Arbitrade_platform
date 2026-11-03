import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { tradeSettingsOwnershipRegistry, tradeSettingsRouteOwnerIds } from "./trade-settings-ownership";
import { TRADING_TIER_POLICY_PATCH_KEYS } from "./trading-policy-patches";

const tierEditorSource = readFileSync(new URL("./components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const operationsPagesSource = readFileSync(new URL("./components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const adminAppSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const renderedPolicyFields = [...tierEditorSource.matchAll(/updateRow\(index,\s*"([^"]+)"/g)].map((match) => match[1]);
const expectedPolicyOwners: Record<string, string> = {
  maxPopupsPerDay: "trade-daily-delivery-caps",
  maxVisibleOffers: "trade-daily-delivery-caps",
  dailyPopupTarget: "trade-daily-delivery-caps",
  schedulingPeriod: "trade-daily-delivery-caps",
  minimumTradeUnits: "trade-delivery-policy",
  maximumTradeUnits: "trade-delivery-policy",
  minIntervalSeconds: "trade-delivery-schedule",
  maxIntervalSeconds: "trade-delivery-schedule",
  postCompletionIntervalSeconds: "trade-delivery-schedule",
  maxPendingDeliveries: "trade-delivery-schedule",
  maxDeliveryAttempts: "trade-retries",
  maxTradeAttemptsPerDay: "trade-retries",
  tradeRetryDelaySeconds: "trade-retries",
  maxSuccessfulTradesPerDay: "trade-retries",
  maxConcurrentActiveTrades: "trade-retries",
  minSettlementDelaySeconds: "trade-retries",
  maxSettlementDelaySeconds: "trade-retries",
  popupDisplayTargetSeconds: "trade-popup-display",
  completionDisplaySeconds: "trade-popup-display",
  closePolicy: "trade-popup-display",
  badgeLabel: "trade-delivery-policy",
  badgeStyle: "trade-delivery-policy",
  minimumPayoutRateBps: "trade-delivery-policy",
  maximumPayoutRateBps: "trade-delivery-policy",
  minimumTradeDurationSeconds: "trade-delivery-policy",
  maximumTradeDurationSeconds: "trade-delivery-policy",
  minimumRewardBps: "trade-delivery-policy",
  maxDailyRewardMinor: "trade-delivery-policy",
  maxRewardPerTradeMinor: "trade-delivery-policy",
  companyRotationCountryNames: "trade-company-rotation",
  companyRotationRepeatPolicy: "trade-company-rotation",
};

describe("Trade Settings ownership registry contract", () => {
  const tradeGroup = adminNavigationGroups.find((group) => group.id === "trade-settings");
  const tradeRoutes = tradeGroup?.items ?? [];

  it("uses unique stable keys and exactly the registered Trade Settings navigation owner IDs", () => {
    const keys = tradeSettingsOwnershipRegistry.map((entry) => entry.key);
    const routeIds = tradeSettingsRouteOwnerIds as readonly string[];
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(routeIds).size).toBe(routeIds.length);
    expect(tradeRoutes.length).toBeGreaterThan(0);
    expect(routeIds).toEqual(tradeRoutes.map((route) => route.id));

    const registeredRouteIds = new Set(routeIds);
    for (const entry of tradeSettingsOwnershipRegistry) {
      expect(registeredRouteIds.has(entry.ownerRoute), `${entry.key} owner route ${entry.ownerRoute}`).toBe(true);
      expect(tradeRoutes.filter((route) => route.id === entry.ownerRoute)).toHaveLength(1);
      expect(entry.section.trim().length, `${entry.key} section`).toBeGreaterThan(0);
    }
  });

  it("requires complete scope, explanation, validation, read/write, audit, effect and availability metadata", () => {
    for (const entry of tradeSettingsOwnershipRegistry) {
      for (const field of [
        "key", "ownerRoute", "section", "label", "explanation", "units", "validation",
        "readQuery", "readOwner", "auditRequirement", "effectiveTime", "runtimeConsumer", "customerImpact",
      ] as const) {
        expect(entry[field].trim().length, `${entry.key}.${field}`).toBeGreaterThan(0);
      }
      expect(["global", "package", "record"]).toContain(entry.scope);
      expect(["low", "medium", "high", "locked"]).toContain(entry.risk);
      expect(["available", "locked", "not-available"]).toContain(entry.availability);
      expect(entry.writeOwner).toBe(entry.saveMutation);
      if (entry.availability === "available") {
        expect(entry.saveMutation, `${entry.key} available mutation`).not.toBeNull();
        expect(entry.writeOwner?.trim().length, `${entry.key} write owner`).toBeGreaterThan(0);
      } else {
        expect(entry.saveMutation, `${entry.key} locked/unavailable mutation`).toBeNull();
        expect(entry.writeOwner, `${entry.key} locked/unavailable write owner`).toBeNull();
      }
    }
  });

  it("matches the existing per-tier policy patch allowlist and mutation/read contract", () => {
    const policyEntries = tradeSettingsOwnershipRegistry.filter((entry) => entry.controlContract?.startsWith("packagePolicies."));
    expect(policyEntries.length).toBeGreaterThan(0);
    const policyContracts = policyEntries.map((entry) => entry.controlContract);
    expect(new Set(policyContracts).size).toBe(policyContracts.length);
    for (const entry of policyEntries) {
      const field = entry.controlContract?.slice("packagePolicies.".length);
      expect(TRADING_TIER_POLICY_PATCH_KEYS, `${entry.key} must be an existing editable policy field`).toContain(field);
      expect(expectedPolicyOwners[field ?? ""], `${field} has one registered owner section`).toBeDefined();
      expect(entry.ownerRoute).toBe(expectedPolicyOwners[field ?? ""]);
      expect(entry.readQuery).toBe("adminOperations.packagePolicies");
      expect(entry.saveMutation).toBe("adminOperations.updatePackagePolicies");
    }
    for (const field of new Set(renderedPolicyFields)) {
      expect(policyEntries.filter((entry) => entry.controlContract === `packagePolicies.${field}`), `${field} is registered once`).toHaveLength(1);
    }

    const tierTerms = tradeSettingsOwnershipRegistry.filter((entry) => entry.controlContract?.startsWith("tradingPackages."));
    expect(tierTerms.map((entry) => entry.controlContract)).toEqual(expect.arrayContaining([
      "tradingPackages.name",
      "tradingPackages.minimumQualifyingBalanceUsdMinor",
      "tradingPackages.durationMonths",
      "tradingPackages.opportunitiesPerDay",
      "tradingPackages.startsAt",
      "tradingPackages.expiresAt",
      "tradingPackages.enabled",
      "tradingPackages.create",
    ]));
    for (const entry of tierTerms) {
      expect(entry.ownerRoute).toBe("trade-tiers-eligibility");
      expect(entry.readQuery).toBe("adminOperations.tradingPackages");
      expect(["adminOperations.updateTradingPackage", "adminOperations.createTradingPackage"]).toContain(entry.saveMutation);
    }
  });

  it("registers locked and unavailable controls without mutation owners", () => {
    const byKey = new Map(tradeSettingsOwnershipRegistry.map((entry) => [entry.key, entry]));
    for (const key of ["trade.global.requirePreviousSettlement", "trade.automaticFinancialExecution", "trade.retry.carryForward"]) {
      const entry = byKey.get(key);
      expect(entry, `${key} is registered`).toBeDefined();
      expect(entry?.saveMutation, `${key} has no mutation`).toBeNull();
      expect(entry?.writeOwner, `${key} has no write owner`).toBeNull();
      expect(["locked", "not-available"]).toContain(entry?.availability);
    }
  });

  it("binds audited operational actions to their current owner route contracts", () => {
    const byKey = new Map(tradeSettingsOwnershipRegistry.map((entry) => [entry.key, entry]));
    const catalogueAction = byKey.get("trade.companyCatalogue.bulkStatus");
    expect(catalogueAction?.ownerRoute).toBe("trade-company-catalogue");
    expect(catalogueAction?.saveMutation).toBe("companyCatalogueReference.updateAdminState");
    expect(catalogueAction?.readQuery).toBe("companyCatalogueReference.adminState");

    const recoveryAction = byKey.get("trade.worker.deadQualificationJobRetry");
    expect(recoveryAction?.ownerRoute).toBe("trade-worker-health");
    expect(recoveryAction?.saveMutation).toBe("adminOperations.requeueDeadQualificationJob");
    expect(recoveryAction?.readQuery).toBe("adminOperations.workerHealth");

    for (const [key, mutation] of [
      ["trade.opportunity.publishSingle", "adminOperations.createOffer"],
      ["trade.opportunity.publishBulk", "adminOperations.bulkCreateOffers"],
      ["trade.opportunity.runRetentionCleanup", "adminOperations.runPopupRetention"],
    ] as const) {
      const action = byKey.get(key);
      expect(action?.ownerRoute).toBe("trade-opportunity-publishing");
      expect(action?.saveMutation).toBe(mutation);
      expect(action?.readQuery).toBe(key === "trade.opportunity.runRetentionCleanup" ? "adminOperations.popupLifecycleSummary" : "adminOperations.offers");
    }

    const deliveryRetryLimit = byKey.get("trade.policy.maximumDeliveryAttempts");
    expect(deliveryRetryLimit?.ownerRoute).toBe("trade-retries");
    expect(deliveryRetryLimit?.controlContract).toBe("packagePolicies.maxDeliveryAttempts");
  });

  it("gives manual payout review one Trade Settings owner and keeps it off finance and settlement routes", () => {
    const payoutRoutes = tradeRoutes.filter((route) => route.id === "trade-manual-payouts");
    expect(payoutRoutes).toHaveLength(1);
    expect(payoutRoutes[0]?.target).toBe("manualPayouts");
    expect(adminNavigationGroups.flatMap((group) => group.items).filter((route) => route.target === "manualPayouts")).toHaveLength(1);
    const payoutAction = tradeSettingsOwnershipRegistry.filter((entry) => entry.key === "trade.manualPayouts.review");
    expect(payoutAction).toHaveLength(1);
    expect(payoutAction[0]).toMatchObject({
      ownerRoute: "trade-manual-payouts",
      readQuery: "adminOperations.payoutRequests",
      saveMutation: "adminOperations.resolvePayoutRequest",
      availability: "available",
    });
    expect(adminAppSource).toContain('section==="manualPayouts"');

    const payoutComponentStart = operationsPagesSource.indexOf("export function AdminManualPayouts()");
    const nextComponentStart = operationsPagesSource.indexOf("function csvCell(value: unknown)", payoutComponentStart);
    expect(payoutComponentStart).toBeGreaterThanOrEqual(0);
    expect(nextComponentStart).toBeGreaterThan(payoutComponentStart);
    const payoutComponent = operationsPagesSource.slice(payoutComponentStart, nextComponentStart);
    expect(payoutComponent).toContain("trpc.adminOperations.payoutRequests.useQuery");
    expect(payoutComponent).toContain("trpc.adminOperations.resolvePayoutRequest.useMutation");

    const transactionReviewStart = operationsPagesSource.indexOf("export function AdminTransactionReview");
    const transactionReview = operationsPagesSource.slice(transactionReviewStart, payoutComponentStart);
    expect(transactionReview).not.toContain("adminOperations.payoutRequests");
    expect(transactionReview).not.toContain("adminOperations.resolvePayoutRequest");
    expect(transactionReview).toContain('focus === "capital" && <section');
    expect(transactionReview).toContain("A capital and wallet-funding queue is not implemented.");
    expect(transactionReview).toContain('focus === "reconciliation"');
    expect(transactionReview).toContain('focus === "ledger"');
  });
});
