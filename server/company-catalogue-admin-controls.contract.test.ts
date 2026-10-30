import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const catalogue = readFileSync(new URL("../client/src/components/AdminCompanyCatalogue.tsx", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");

describe("administrator company catalogue bulk controls", () => {
  it("exposes catalogue status reads and writes only through admin procedures", () => {
    expect(router).toContain("adminState: adminProcedure.query");
    expect(router).toContain("updateAdminState: adminProcedure.input");
    expect(router).toContain("updateCompanyCatalogueAdminState({ ...input, ids, updatedBy: ctx.user.id })");
    expect(router).toContain('z.enum(["verified", "unverified", "archived"])');
    expect(router).toContain(".max(1811)");
  });

  it("serializes status changes and writes an audit event with actor, reason and selected IDs", () => {
    const start = database.indexOf("export async function updateCompanyCatalogueAdminState(");
    const end = database.indexOf("export async function listAdminAuditEvents", start);
    const implementation = database.slice(start, end);
    expect(implementation).toContain("db.transaction(async tx =>");
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("tx.insert(v5AuditEvents).values");
    expect(implementation).toContain("actorUserId: input.updatedBy");
    expect(implementation).toContain("reason: input.reason.trim()");
    expect(implementation).toContain("ids, updatedAt");
    expect(implementation).toContain("verified.delete(id)");
    expect(implementation).toContain("archived.delete(id)");
    expect(implementation).toContain("verifiedIds: [...verified].sort()");
    expect(implementation).toContain("archivedIds: [...archived].sort()");
    expect(implementation).toContain("input.status === \"archived\"");
  });

  it("keeps a full 1,811-ID status snapshot within the app-settings TEXT limit", () => {
    const ids = Array.from({ length: 1811 }, (_, index) => `logo-brand-${String(index + 1).padStart(4, "0")}`);
    const settingPayload = JSON.stringify({ verifiedIds: ids, archivedIds: [] });
    const auditPayload = JSON.stringify({ status: "verified", count: ids.length, ids, updatedAt: "2026-10-30T00:00:00.000Z" });
    expect(Buffer.byteLength(settingPayload, "utf8")).toBeLessThan(65_535);
    expect(Buffer.byteLength(auditPayload, "utf8")).toBeLessThan(65_535);
  });

  it("supports all-company view, page view, explicit selection and reversible archive", () => {
    for (const phrase of [
      "View all companies",
      "Show 10 per page",
      "Select visible",
      "Select all",
      "Clear selection",
      "Mark selected verified",
      "Mark selected unverified",
      "Delete selected",
      "Restore selected",
      "Archived / deleted",
    ]) expect(catalogue).toContain(phrase);
    expect(catalogue).toContain("selectedIds");
    expect(catalogue).toContain("window.confirm");
    expect(catalogue).toContain('status !== "archived"');
  });

  it("keeps the admin label separate from verified listing and trade eligibility", () => {
    expect(catalogue).toContain("internal catalogue label");
    expect(catalogue).toContain("ineligible for verified trade rotation");
    expect(specification).toContain("does not certify a public securities listing");
    expect(specification).toContain("does not change `referenceOnly` / `eligibleForVerifiedTradeRotation`");
  });
});
