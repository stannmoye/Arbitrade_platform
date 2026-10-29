import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const database = read("./db.ts");
const lifecycle = read("./opportunityLifecycle.ts");
const schema = read("../drizzle/schema.ts");
const migration = read("../drizzle/0086_package_aware_company_popup_rotation.sql");
const client = read("../client/src/App.tsx");
const catalogue = read("./modules/company-catalogue-reference.ts");

describe("package-aware company popup rotation", () => {
  it("assigns a stable catalogue identity in the server-owned package quota worker", () => {
    expect(database).toContain("getCompanyReferenceForRotation({");
    expect(database).toContain("packageId:Number(subscription.packageId)");
    expect(database).toContain("slotIndex:companySlotIndex");
    expect(database).toContain("companyLogoId:companyReference.id");
    expect(lifecycle).toContain("companyLogoId");
    expect(lifecycle).toContain("ON DUPLICATE KEY UPDATE updatedAt=CURRENT_TIMESTAMP");
  });

  it("persists the logo ID with the popup event and resolves display metadata from the canonical catalogue", () => {
    expect(schema).toContain('companyLogoId: varchar("companyLogoId", { length: 32 })');
    expect(migration).toContain("ADD COLUMN companyLogoId VARCHAR(32) NULL");
    expect(database).toContain("getCompanyReferenceById(String(row.companyLogoId))");
    expect(catalogue).toContain("COMPANY_REFERENCE_CATALOGUE.length");
    expect(catalogue).toContain("eligibleForVerifiedTradeRotation: false");
  });

  it("does not let the customer browser randomly rotate or manually request the next company", () => {
    expect(client).not.toContain("trpc.companyCatalogueReference.next.useMutation");
    expect(client).not.toContain("Random company spotlight");
    expect(client).not.toContain("requestNextCompanyReference");
    expect(client).toContain("offer.companyReference?.name");
    expect(client).toContain("Informational company reference only");
  });
});
