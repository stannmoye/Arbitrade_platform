import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { buildOpportunityDeliveryWhere, classifyDeliveryFailure, safeDeliveryDiagnosticMessage } from "./opportunityDeliveryDiagnostics";

function contextForRole(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: { id: 7, openId: "delivery-diagnostics-test", email: "diagnostics@example.com", name: "Test Customer", loginMethod: "password", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const diagnosticsSource = readFileSync(new URL("./opportunityDeliveryDiagnostics.ts", import.meta.url), "utf8");
const lifecycleSource = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const historyMigration = readFileSync(new URL("../drizzle/0110_opportunity_delivery_diagnostic_history.sql", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../client/src/components/AdminOpportunityDeliveryDiagnostics.tsx", import.meta.url), "utf8");

describe("Opportunity delivery diagnostics", () => {
  it("rejects customer and unauthenticated sessions on diagnostics endpoints", async () => {
    const input = { filters: {}, page: 1, pageSize: 20 };
    await expect(appRouter.createCaller(contextForRole("user")).adminOperations.opportunityDeliveryRecords(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller({ ...contextForRole("user"), user: null }).adminOperations.opportunityDeliveryRecords(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(contextForRole("user")).adminOperations.opportunityDeliveryQueueDiagnostics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const caller = appRouter.createCaller(contextForRole("user"));
    await expect(caller.adminOperations.opportunityDeliveryDetails({ offerId: 902 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminOperations.opportunityDeliveryCustomerSearch({ query: "Ada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminOperations.opportunityDeliveryCustomer({ customerId: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminOperations.exportOpportunityDeliveryRecords({ filters: {}, maxRows: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects malformed and excessive filters before any database access", async () => {
    const caller = appRouter.createCaller(contextForRole("admin"));
    await expect(caller.adminOperations.opportunityDeliveryRecords({ filters: { customerId: 0 }, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.opportunityDeliveryRecords({ filters: {}, page: 1, pageSize: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.opportunityDeliveryRecords({ filters: { from: "2026-11-08" }, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.opportunityDeliveryRecords({ filters: { from: "2026-11-09T00:00:00.000Z", to: "2026-11-08T00:00:00.000Z" }, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.exportOpportunityDeliveryRecords({ filters: {}, maxRows: 10_001 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("maps only evidence-backed delivery conditions and withholds arbitrary error text", () => {
    expect(classifyDeliveryFailure({ deliveryStatus: "failed", errorCode: "DELIVERY_ATTEMPTS_EXHAUSTED" })).toMatchObject({ category: "Retry exhaustion", retryPermitted: false });
    expect(classifyDeliveryFailure({ deliveryStatus: "expired", receivedAt: null })).toMatchObject({ category: "Expired; receipt not confirmed", retryPermitted: false });
    expect(classifyDeliveryFailure({ deliveryStatus: "in_progress", stalled: true })).toMatchObject({ category: "Browser receipt not confirmed" });
    expect(classifyDeliveryFailure({ deliveryStatus: "queued" })).toBeNull();
    expect(safeDeliveryDiagnosticMessage("DELIVERY_ATTEMPTS_EXHAUSTED")).toContain("attempt limit");
    expect(safeDeliveryDiagnosticMessage("SOME_UNRECOGNIZED_CODE")).toContain("intentionally withheld");
  });

  it("builds parameterized, escaped filters for customer, opportunity, package, company, status, dates, retries, and stalls", () => {
    const query = buildOpportunityDeliveryWhere({
      customerName: "Ada_%", customerId: 41, opportunityId: 902, packageName: "Gold%", companyName: "Example_",
      status: "retry_wait", from: "2026-11-01T00:00:00.000Z", to: "2026-11-08T23:59:59.999Z",
      failedOnly: true, expiredOnly: true, queuedOnly: true, stalledOnly: true, minRetries: 2, failureAnalysisOnly: true,
    });
    expect(query.sql).toContain("LIKE ? ESCAPE '!'");
    expect(query.sql).toContain("r.offerId=?");
    expect(query.sql).toContain("COALESCE(r.deliveryAttemptCount,0)>=?");
    expect(query.sql).toContain("r.deliveryRetryAfter<=UTC_TIMESTAMP()");
    expect(query.sql).toContain("r.deliveryLeaseExpiresAt<=UTC_TIMESTAMP()");
    expect(query.params).toContain(41);
    expect(query.params).toContain(902);
    expect(query.params).toContain("Ada!_!%%");
    expect(query.params).toContain("Gold!%%");
    expect(query.params).toContain("Example!_%");
    expect(query.params).not.toContain("Ada_%");
    expect(query.sql).not.toContain("Ada_%");
  });

  it("protects read-only endpoints and uses bounded, indexed, deterministic drilldowns", () => {
    for (const endpoint of ["opportunityDeliveryRecords", "opportunityDeliveryDetails", "opportunityDeliveryCustomerSearch", "opportunityDeliveryCustomer", "opportunityDeliveryQueueDiagnostics", "exportOpportunityDeliveryRecords"]) {
      expect(routerSource).toContain(`${endpoint}: adminProcedure`);
    }
    expect(routerSource).toContain("opportunityDeliveryRecords: adminProcedure.input(");
    expect(routerSource).toContain("max(100)");
    expect(routerSource).toContain("max(10_000)");
    expect(diagnosticsSource).toContain("ORDER BY COALESCE(r.generatedAt,r.popupCreatedAt) DESC,r.offerId DESC,r.userId DESC LIMIT ? OFFSET ?");
    expect(diagnosticsSource).toContain("LIKE ? ESCAPE '!'");
    expect(diagnosticsSource).toContain("queueWaitThresholdConfigured: false");
    expect(diagnosticsSource).toContain("eventType='dispatch_claimed'");
    expect(diagnosticsSource).toContain("'lease_expired','retry_scheduled','retry_exhausted'");
    expect(diagnosticsSource).not.toContain("worker_claimed");
    expect(lifecycleSource).toContain("if(Number(claimResult?.affectedRows||0)===0) continue;");
    expect(lifecycleSource).toContain("if(Number(leaseResult?.affectedRows||0)===0) continue;");
    expect(lifecycleSource).toContain("if(Number(exhaustedResult?.affectedRows||0)>0) await recordDeliveryHistory");
    expect(diagnosticsSource).toContain("deliveryStatus='delivered' AND ${alias}.receivedAt IS NULL");
    expect(diagnosticsSource).toContain("Historical queue-size snapshots are not persisted");
    expect(historyMigration).toContain("CREATE TABLE IF NOT EXISTS `opportunity_delivery_history`");
    expect(historyMigration).toContain("UNIQUE KEY `opportunity_delivery_history_offer_event_uq`");
    expect(uiSource).toContain("No acknowledgement timestamp");
    expect(uiSource).toContain("Terminal records have no manual retry action here");
    expect(uiSource).toContain("user-scoped customer requests");
    expect(uiSource).toContain("filters: \"filters\" in activeFilters ? activeFilters.filters as any : {}");
  });
});
