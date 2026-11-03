import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./components/AdminTradeAuditHistory.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("Trade Settings Audit & Policy History surface", () => {
  it("mounts at the existing audit navigation target without changing route ownership", () => {
    expect(app).toContain("section===\"audit\"&&<Suspense");
    expect(app).toContain("<AdminTradeAuditHistory/>");
    expect(component).toContain("trpc.adminOperations.tradeAuditHistory.useQuery");
  });

  it("offers actor, date, key, entity, package, scope filters and cursor pagination", () => {
    for (const label of ["Actor user ID", "From date (UTC)", "Through date (UTC)", "Changed key", "Entity type", "Entity ID", "Package / tier", "Scope (derived from persisted event)"]) {
      expect(component).toContain(label);
    }
    expect(component).toContain('<option value="global">Global</option>');
    expect(component).toContain('<option value="package">Package / tier</option>');
    expect(component).toContain('<option value="record">Operational record</option>');
    expect(component).toContain("Next page");
    expect(component).toContain("Previous page");
    expect(component).toContain("Apply filters");
  });

  it("discloses bounded candidate scans and constrains actor IDs to the database type", () => {
    expect(component).toContain("query.data?.scanCapped");
    expect(component).toContain("1,000-candidate safety limit");
    expect(component).toContain("Continue search");
    expect(component).toContain("2_147_483_647");
  });

  it("labels only persisted before/after, source, policy version, and effective time fields", () => {
    expect(component).toContain("event.beforeAvailable");
    expect(component).toContain("event.afterAvailable");
    expect(component).toContain("event.source ?? unavailable");
    expect(component).toContain("event.scope ?");
    expect(component).toContain("derived from persisted action/entity type");
    expect(component).toContain("event.policyVersion ?? unavailable");
    expect(component).toContain("event.effectiveAt ?? unavailable");
    expect(component).toContain("Unavailable — this audit event did not persist this field.");
  });

  it("has no mutation hooks or audit-record controls", () => {
    expect(component).not.toContain("useMutation");
    expect(component).not.toMatch(/\.mutate(?:Async)?\s*\(/);
    expect(component).not.toContain("Delete event");
    expect(component).not.toContain("Edit event");
  });
});
