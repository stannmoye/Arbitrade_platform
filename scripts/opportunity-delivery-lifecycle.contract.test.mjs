import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
describe("opportunity delivery lifecycle migration and state boundaries", () => {
  it("uses stable package identity for delivery admission and durable customer-offer idempotency", async () => {
    const [lifecycle, schema, migration] = await Promise.all([
      read("../server/opportunityLifecycle.ts"), read("../drizzle/schema.ts"), read("../drizzle/0102_opportunity_delivery_retry_lifecycle.sql"),
    ]);
    expect(lifecycle).toContain("deliveryAdmissionLockKey(item.userId, item.packageId)");
    expect(lifecycle).toContain("WHERE userId=? AND packageId=? AND deliveryStatus IN ('queued','in_progress','retry_wait')");
    expect(lifecycle).toContain("INSERT INTO opportunity_delivery_idempotency (userId,offerId,popupEventId,packageId,packageName)");
    expect(schema).toContain('packageId: int("packageId")');
    expect(schema).toContain('index("opportunity_popup_pending_package_id_idx").on(table.userId, table.packageId, table.deliveryStatus)');
    expect(migration).toContain("UNIQUE KEY `opportunity_delivery_idempotency_user_offer_uq` (`userId`,`offerId`)");
  });
  it("terminalizes only surplus legacy delivery-only rows, with a stable explicit error code", async () => {
    const migration = await read("../drizzle/0102_opportunity_delivery_retry_lifecycle.sql");
    expect(migration).toContain("MIN(`id`) AS `canonicalId`");
    expect(migration).toContain("e.`id`<>duplicates.`canonicalId`");
    expect(migration).toContain("e.`tradeId` IS NULL");
    expect(migration).toContain("e.`eventStatus` NOT IN ('TRADED','SETTLED')");
    expect(migration).toContain("e.`executionStatus` NOT IN ('RUNNING','SUCCEEDED')");
    expect(migration).toContain("'DELIVERY_DUPLICATE_LEGACY'");
    expect(migration).not.toMatch(/SET e\.`(?:tradeId|executionStatus|eventStatus|wallet|ledger)/i);
  });
  it("keeps migration 0102 aligned across journal, portal runner, recovery diagnostics and worker bridge", async () => {
    const [journalText, portal, recovery, bridge, contracts, migration] = await Promise.all([
      read("../drizzle/meta/_journal.json"), read("../scripts/apply-portal-migrations.mjs"),
      read("../installer/migration-recovery-status.mjs"), read("../scripts/ensure-worker-runtime-schema.mjs"),
      read("../scripts/worker-schema-contracts.mjs"), read("../drizzle/0102_opportunity_delivery_retry_lifecycle.sql"),
    ]);
    const journal = JSON.parse(journalText);
    expect(journal.entries.at(-2)).toMatchObject({ idx: 70, tag: "0101_package_fee_policy_versions" });
    expect(journal.entries.at(-1)).toMatchObject({ idx: 71, tag: "0102_opportunity_delivery_retry_lifecycle" });
    expect(portal).toContain('"0102_opportunity_delivery_retry_lifecycle.sql"');
    expect(recovery).toContain('"0102_opportunity_delivery_retry_lifecycle.sql"');
    expect(bridge).toContain("async function ensureDeliveryLifecycle(db)");
    expect(migration).toContain("p.`name` COLLATE utf8mb4_unicode_ci=e.`packageName` COLLATE utf8mb4_unicode_ci");
    expect(bridge).toContain("p.name COLLATE utf8mb4_unicode_ci=e.packageName COLLATE utf8mb4_unicode_ci");
    expect(bridge).toContain("DELIVERY_DUPLICATE_LEGACY");
    expect(bridge).toContain("opportunity_popup_pending_package_id_idx");
    expect(contracts).toContain("opportunity_delivery_idempotency");
    expect(contracts).toContain("deliveryPolicyVersionSnapshot");
  });
  it("does not let delivery claim/ack state gate automatic allocation or modify financial state", async () => {
    const [eligibility, lifecycle, policySql] = await Promise.all([
      read("../server/modules/popup-execution-policy.ts"), read("../server/opportunityLifecycle.ts"),
      read("../server/modules/opportunity-delivery-lifecycle.ts"),
    ]);
    expect(eligibility).toContain("Browser-side delivery acknowledgements must never decide allocation.");
    expect(eligibility).not.toContain("deliveryStatus = String(input.deliveryStatus");
    expect(lifecycle).toContain("if (!process.env.DATABASE_URL || !leaseToken) return;");
    expect(lifecycle).toContain("deliveryLeaseToken=? AND deliveryStatus IN ('in_progress','received')");
    expect(policySql).toContain("DELIVERY_FINANCIAL_EFFECTS = false");
    expect(lifecycle).not.toMatch(/UPDATE opportunity_popup_events SET[^`]*\b(?:wallet|ledger|tradeId|executionStatus|executionLastErrorCode)\s*=/i);
  });
  it("seeds only an unconfigured no-retry policy and does not infer any retry interval", async () => {
    const migration = await read("../drizzle/0102_opportunity_delivery_retry_lifecycle.sql");
    expect(migration).toContain("'policy','none','maxAttempts',1,'intervalsSeconds',JSON_ARRAY()");
    expect(migration).toContain("'configured',FALSE");
    expect(migration).toContain("No interval/schedule is inferred");
  });
});
