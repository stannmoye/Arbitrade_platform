import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const schema=readFileSync(new URL("../../drizzle/schema.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../drizzle/0090_trading_company_spotlight_rotation.sql",import.meta.url),"utf8");
const db=readFileSync(new URL("../db.ts",import.meta.url),"utf8");
const router=readFileSync(new URL("../routers.ts",import.meta.url),"utf8");
const editor=readFileSync(new URL("../../client/src/components/TradingDeliveryPolicyEditor.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../../client/src/App.tsx",import.meta.url),"utf8");
const lifecycle=readFileSync(new URL("../opportunityLifecycle.ts",import.meta.url),"utf8");
const executionPolicy=readFileSync(new URL("./popup-execution-policy.ts",import.meta.url),"utf8");
describe("company spotlight rotation integration contract",()=>{
 it("persists administrator-owned rotation settings",()=>{for(const field of ["companyRotationEnabled","companyRotationCountryNames","companyRotationRepeatPolicy"]){expect(schema).toContain(field);expect(migration).toContain(field);expect(router).toContain(field);expect(editor).toContain(field);}expect(migration).toContain("ADD COLUMN IF NOT EXISTS");});
 it("assigns a company snapshot inside the idempotent opportunity transaction",()=>{expect(lifecycle).toContain("SELECT id FROM opportunity_popup_events WHERE eventKey=? LIMIT 1");expect(lifecycle).toContain("SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE");expect(lifecycle).toContain("rotationCycle: selection.rotationCycle");expect(lifecycle).toContain("rotationSequence: selection.rotationSequence");expect(lifecycle).toContain("poolFingerprint: selection.poolFingerprint");expect(lifecycle).toContain("companyReferenceMetadataJson");expect(lifecycle).toContain("await connection.commit()");expect(db).toContain("previewNextCustomerCompanySpotlight");expect(router).toContain("companySpotlightPreview: protectedProcedure.query");});
 it("keeps preview read-only and customer cards tied to persisted opportunity snapshots",()=>{const start=db.indexOf("export async function previewNextCustomerCompanySpotlight");const end=db.indexOf("/** Runtime reads never create policy rows",start);const preview=db.slice(start,end);expect(preview).not.toContain("tx.update(appSettings)");expect(preview).not.toContain("tx.insert(appSettings)");expect(app).not.toContain("companySpotlightNext.useMutation");expect(app).not.toContain("requestNextCompanyReference");expect(app).toContain("offer.companyReferenceMetadataJson");expect(app).toContain("Search company references");});
 it("keeps dismissal presentation-only for automatic execution",()=>{expect(executionPolicy).toContain('"DISMISSED"');expect(executionPolicy).toContain("executionStatus");expect(db).toContain("executionEligible:isPopupExecutionEligible");expect(db).toContain("if(offer.executionEligible!==true) continue;");expect(db).toContain("offer.executionEligible!==true || allocationControls.allocationsPaused");});
 it("keeps the catalogue informational",()=>{expect(editor).toContain("Informational company references only; this never creates or authorizes a trade.");expect(editor).toContain("Country folders do not verify headquarters or listing status.");expect(db).toContain("referenceOnly:true as const");});
});
