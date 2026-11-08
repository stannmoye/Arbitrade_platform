import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0107_accurate_opportunity_delivery_monitoring.sql", import.meta.url), "utf8");
const diagnostics = readFileSync(new URL("./opportunityDeliveryDiagnostics.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("accurate opportunity delivery monitoring", () => {
  it("never treats queue persistence as receipt or rendering", () => {
    expect(lifecycle).toContain("deliveryStatus IN ('queued','in_progress','retry_wait')");
    expect(lifecycle).toContain("deliveryStatus='received'");
    expect(lifecycle).toContain("deliveryStatus='rendered'");
    expect(lifecycle).not.toContain("COUNT(*) AS delivered");
    expect(admin).toContain("Queued deliveries");
    expect(admin).toContain("Customer browser acknowledgement");
    expect(admin).toContain("Customer interface acknowledgement");
    expect(admin).toContain("Queue persistence is never reported as customer receipt or display");
  });

  it("uses distinct customer/offer identities and preserves historical status counters", () => {
    expect(lifecycle).toContain("COUNT(DISTINCT CONCAT(e.userId,':',e.offerId))");
    expect(lifecycle).toContain("MAX(id) AS id");
    expect(schema).toContain("generatedCount: int(\"generatedCount\")");
    expect(schema).toContain("queuedCount: int(\"queuedCount\")");
    expect(schema).toContain("receivedCount: int(\"receivedCount\")");
    expect(schema).toContain("renderedCount: int(\"renderedCount\")");
    expect(schema).toContain("failedCount: int(\"failedCount\")");
    expect(schema).toContain("expiredCount: int(\"expiredCount\")");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `renderedCount`");
  });

  it("keeps generated opportunities independent from delivery acknowledgement", () => {
    expect(lifecycle).toContain("FROM opportunity_generation_assignments a WHERE a.generatedAt >=");
    expect(lifecycle).toContain("AS generated");
    expect(lifecycle).toContain("AS queued");
    expect(lifecycle).toContain("AS received");
    expect(lifecycle).toContain("AS rendered");
    expect(lifecycle).toContain("AS failed");
    expect(lifecycle).toContain("AS expired");
  });

  it("uses durable event evidence for advanced metrics and never upgrades legacy render timestamps", () => {
    expect(diagnostics).toContain("eventType='popup_render_confirmed'");
    expect(diagnostics).toContain("averageQueueToBrowserReceiptMilliseconds");
    expect(diagnostics).toContain("oldestPendingAgeMilliseconds");
    expect(diagnostics).toContain("staleProcessingLeases");
    expect(diagnostics).toContain("pendingPastExpiry");
    expect(diagnostics).toContain("repeatedFailureOpportunities24h");
    expect(diagnostics).toContain("eventAt>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND eventAt<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)");
    expect(diagnostics).toContain("trackedBacklogCoverageDays:30");
    expect(diagnostics).toContain("legacy_render_acknowledgement");
    expect(diagnostics).not.toContain('addLegacy("popup_render_confirmed", row.renderedAt)');
    expect(diagnostics).toContain("workerStatus?: \"running\" | \"healthy\"");
    expect(router).toContain("deliveryOverview: adminProcedure.query");
    expect(router).toContain("scope:\"global_current_trading_opportunities_worker_not_per_opportunity_attribution\"");
  });

  it("records pending-capacity admission deferrals without misclassifying them as failures", () => {
    expect(lifecycle).toContain("eventType:\"queue_admission_skipped\"");
    expect(lifecycle).toContain("reasonCode:\"PENDING_DELIVERY_LIMIT\"");
    expect(diagnostics).toContain("eventType='queue_admission_skipped'");
    expect(router).toContain("\"queue_admission_skipped\"");
    expect(admin).toContain("Admission deferred");
    expect(admin).toContain("eventType===\"queue_admission_skipped\"?\"Deferred\"");
  });
});
