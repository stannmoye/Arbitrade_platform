import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isCompanySpotlightDisplayAllowed, parseCompanyCatalogueAdminState } from "./modules/company-spotlight-rotation";
import { decodeCompanyCatalogueSelection, encodeCompanyCatalogueSelection } from "../shared/company-catalogue-selection";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const catalogue = readFileSync(new URL("../client/src/components/AdminCompanyCatalogue.tsx", import.meta.url), "utf8");
const ownership = readFileSync(new URL("../client/src/trade-settings-ownership.ts", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");

describe("administrator company catalogue bulk controls", () => {
  it("exposes catalogue status reads and writes only through admin procedures", () => {
    expect(router).toContain("adminState: adminProcedure.query");
    expect(router).toContain("updateAdminState: adminProcedure.input");
    expect(router).toContain("updateCompanyCatalogueAdminState({ ...input, ids, updatedBy: ctx.user.id })");
    expect(router).toContain('z.enum(["verified", "unverified", "archived", "restored", "disabled", "enabled"])');
    expect(router).toContain("reason: z.string().trim().min(8).max(500)");
    expect(router).toContain(".max(1811)");
    expect(router).toContain("selectionBitmap: z.string().length(304).optional()");
    expect(router).toContain("decodeCompanyCatalogueSelection(input.selectionBitmap)");
  });

  it("serializes status changes and writes an audit event with actor, reason and selected IDs", () => {
    const start = database.indexOf("export async function updateCompanyCatalogueAdminState(");
    const end = database.indexOf("export async function listAdminAuditEvents", start);
    const implementation = database.slice(start, end);
    expect(implementation).toContain("db.transaction(async tx =>");
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("tx.insert(v5AuditEvents).values");
    expect(implementation).toContain("actorUserId: input.updatedBy");
    expect(implementation).toContain("normalizeCompanyCatalogueActionReason(input.reason)");
    expect(implementation).toContain("transitionCompanyCatalogueAdminState(currentCatalogueState, ids, input.status)");
    expect(implementation).toContain("reason,");
    expect(implementation).toContain("ids, updatedAt");
    expect(implementation).toContain("tx.insert(v5AuditEvents).values");
  });

  it("requires and forwards a fresh operator-entered reason for each status action", () => {
    expect(catalogue).toContain("window.prompt(");
    expect(catalogue).toContain("case-specific reason");
    expect(catalogue).toContain("reason.length < 8 || reason.length > 500");
    expect(catalogue).toContain("8–500 characters");
    expect(catalogue).toContain("await updateStatus.mutateAsync({ ...encodeCompanyCatalogueSelection(ids), status, reason })");
    expect(catalogue).toContain('applyStatus("restored")');
    expect(catalogue).not.toContain("Administrator archived selected catalogue records.");
    expect(ownership).toContain("archive revokes customer approval while verification remains separate from enablement");
    expect(ownership).toContain("archive removes verifiedIds and restore clears archivedIds without re-approving the record");
    expect(router).toContain("updateCompanyCatalogueAdminState({ ...input, ids, updatedBy: ctx.user.id })");
    expect(database).toContain("reason,");
    expect(database).toContain('reason,\n      reference: `company-catalogue:${input.status}:${updatedAt}`');
  });

  it("encodes every catalogue selection into a compact, validated bitset", () => {
    const allIds = Array.from({ length: 1811 }, (_, index) => `logo-brand-${String(index + 1).padStart(4, "0")}`);
    const allBitmap = encodeCompanyCatalogueSelection(allIds);
    expect(allBitmap).toHaveLength(304);
    expect(decodeCompanyCatalogueSelection(allBitmap)).toEqual(allIds);
    const sparseIds = [allIds[0]!, allIds[17]!, allIds[1810]!];
    expect(decodeCompanyCatalogueSelection(encodeCompanyCatalogueSelection(sparseIds))).toEqual(sparseIds);
    expect(() => decodeCompanyCatalogueSelection("A".repeat(304))).toThrow();
    expect(() => encodeCompanyCatalogueSelection(["logo-brand-9999"])).toThrow();
  });

  it("keeps a full 1,811-ID status snapshot within the app-settings TEXT limit", () => {
    const ids = Array.from({ length: 1811 }, (_, index) => `logo-brand-${String(index + 1).padStart(4, "0")}`);
    const settingPayload = JSON.stringify({ verifiedIds: ids, archivedIds: [], disabledIds: ids.slice(0, 100) });
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
      "Reject / mark unverified",
      "Enable selected",
      "Disable selected",
      "Delete selected",
      "Restore selected",
      "exact Logo ID",
      "Archived / deleted",
    ]) expect(catalogue).toContain(phrase);
    expect(catalogue).toContain("selectedIds");
    expect(catalogue).toContain('<option value="disabled">Disabled</option>');
    expect(catalogue).toContain("window.confirm");
    expect(catalogue).toContain('status !== "archived"');
  });

  it("keeps the admin label separate from verified listing and trade eligibility", () => {
    expect(catalogue).toContain("internal catalogue label");
    expect(catalogue).toContain("ineligible for verified securities/trade execution");
    expect(specification).toContain("does not certify a public securities listing");
    expect(specification).toContain("or change `referenceOnly` / `eligibleForVerifiedTradeRotation`");
    expect(specification).toContain("only IDs in the persisted administrator `verifiedIds` set are eligible");
    expect(specification).toContain("never fall back to an unverified record");
  });

  it("allows customer identity only when verified and not disabled or archived, failing closed on malformed state", () => {
    const id = "logo-brand-0001";
    expect(isCompanySpotlightDisplayAllowed(id, parseCompanyCatalogueAdminState({ verifiedIds: [id], archivedIds: [], disabledIds: [] }))).toBe(true);
    expect(isCompanySpotlightDisplayAllowed(id, parseCompanyCatalogueAdminState({ verifiedIds: [id], archivedIds: [id], disabledIds: [] }))).toBe(false);
    expect(isCompanySpotlightDisplayAllowed(id, parseCompanyCatalogueAdminState({ verifiedIds: [id], archivedIds: [], disabledIds: [id] }))).toBe(false);
    expect(isCompanySpotlightDisplayAllowed(id, parseCompanyCatalogueAdminState("{malformed"))).toBe(false);
  });
});
