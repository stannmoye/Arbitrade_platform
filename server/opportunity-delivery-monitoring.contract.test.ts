import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0107_accurate_opportunity_delivery_monitoring.sql", import.meta.url), "utf8");

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
});
