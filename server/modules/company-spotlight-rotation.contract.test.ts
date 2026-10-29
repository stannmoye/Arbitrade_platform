import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const schema=readFileSync(new URL("../../drizzle/schema.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../drizzle/0087_trading_company_spotlight_rotation.sql",import.meta.url),"utf8");
const db=readFileSync(new URL("../db.ts",import.meta.url),"utf8");
const router=readFileSync(new URL("../routers.ts",import.meta.url),"utf8");
const editor=readFileSync(new URL("../../client/src/components/TradingDeliveryPolicyEditor.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../../client/src/App.tsx",import.meta.url),"utf8");
describe("company spotlight rotation integration contract",()=>{
 it("persists administrator-owned rotation settings",()=>{for(const field of ["companyRotationEnabled","companyRotationCountryNames","companyRotationRepeatPolicy"]){expect(schema).toContain(field);expect(migration).toContain(field);expect(router).toContain(field);expect(editor).toContain(field);}expect(migration).toContain("ADD COLUMN IF NOT EXISTS");});
 it("requires an active auto-assigned tier and advances state transactionally",()=>{expect(db).toContain("getNextCustomerCompanySpotlight");expect(db).toContain("trading.companyRotation.");expect(db).toContain('.for("update")');expect(router).toContain("companySpotlightNext: protectedProcedure.mutation");expect(app).toContain("trpc.customer.companySpotlightNext.useMutation");expect(app).not.toContain("setInterval(requestNextCompanyReference,15000)");});
 it("keeps the catalogue informational",()=>{expect(editor).toContain("Informational company references only; this never creates or authorizes a trade.");expect(editor).toContain("Country folders do not verify headquarters or listing status.");expect(db).toContain("referenceOnly:true as const");});
});
