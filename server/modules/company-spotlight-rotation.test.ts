import { readFileSync } from "node:fs";
import {describe,expect,it} from "vitest";
import {COMPANY_REFERENCE_CATALOGUE} from "./company-catalogue-reference";
import {buildCompanySpotlightPool,isCompanySpotlightDisplayAllowed,nextCompanySpotlight,normalizeCompanyRotationCountryNames,parseCompanyCatalogueAdminState} from "./company-spotlight-rotation";

const allVerifiedState={verifiedIds:COMPANY_REFERENCE_CATALOGUE.map(company=>company.id),archivedIds:[]};

describe("package-scoped company spotlight rotation",()=>{
  it("uses stable Logo IDs from the full informational catalogue",()=>{
    const pool=buildCompanySpotlightPool("",allVerifiedState);
    expect(pool).toHaveLength(1811);
    expect(new Set(pool.map(company=>company.id)).size).toBe(1811);
    expect(pool.every(company=>company.listingStatus==="unverified")).toBe(true);
  });
  it("includes only admin-verified IDs and always excludes archived IDs",()=>{
    const [verified,archived,alsoVerified]=COMPANY_REFERENCE_CATALOGUE.slice(0,3);
    const pool=buildCompanySpotlightPool("",{verifiedIds:[verified!.id,archived!.id,alsoVerified!.id],archivedIds:[archived!.id],disabledIds:[alsoVerified!.id]});
    expect(pool.map(company=>company.id)).toEqual([verified!.id]);
    expect(buildCompanySpotlightPool("",{verifiedIds:[],archivedIds:[]})).toEqual([]);
  });
  it("fails closed when the administrator status setting is missing or malformed",()=>{
    expect(parseCompanyCatalogueAdminState(null)).toEqual({verifiedIds:[],archivedIds:[],disabledIds:[]});
    expect(parseCompanyCatalogueAdminState("{not-json")).toEqual({verifiedIds:[],archivedIds:[],disabledIds:[]});
    expect(parseCompanyCatalogueAdminState({verifiedIds:["logo-brand-0001"],archivedIds:[],disabledIds:["logo-brand-0001"]})).toEqual({verifiedIds:["logo-brand-0001"],archivedIds:[],disabledIds:["logo-brand-0001"]});
    expect(parseCompanyCatalogueAdminState({verifiedIds:["logo-brand-0001","invalid"],archivedIds:["logo-brand-0001"]})).toEqual({verifiedIds:["logo-brand-0001"],archivedIds:["logo-brand-0001"],disabledIds:[]});
  });
  it("normalizes exact country-folder filters and rejects unknown labels",()=>{
    const country=COMPANY_REFERENCE_CATALOGUE[0]!.countryName;
    expect(normalizeCompanyRotationCountryNames(" "+country+", "+country+" ")).toBe(country);
    expect(buildCompanySpotlightPool(country,allVerifiedState).every(company=>company.countryName===country)).toBe(true);
    expect(()=>normalizeCompanyRotationCountryNames("Definitely Not a Country Folder")).toThrow("Unknown company catalogue country-folder label");
  });
  it("avoids repeats until the full filtered pool has been traversed",()=>{
    const pool=buildCompanySpotlightPool("",allVerifiedState,COMPANY_REFERENCE_CATALOGUE.slice(0,8));
    let state:unknown=null;const seen=new Set<string>();
    for(let i=0;i<pool.length;i++){const result=nextCompanySpotlight(pool,state,42,"Starter","avoid_until_exhausted");expect(seen.has(result.company.id)).toBe(false);seen.add(result.company.id);state=result.state;}
    expect(seen.size).toBe(pool.length);
    const last=nextCompanySpotlight(pool,state,42,"Starter","avoid_until_exhausted");
    expect(last.rotationCycle).toBe(2);
    expect(last.rotationSequence).toBe(pool.length+1);
    expect(last.state.cycleNumber).toBe(2);expect(last.state.requestCount).toBe(pool.length+1);
  });
  it("resets its cursor when country filters change and validates customer/package scope",()=>{
    const first=COMPANY_REFERENCE_CATALOGUE[0]!;
    const second=COMPANY_REFERENCE_CATALOGUE.find(company=>company.countryName!==first.countryName)!;
    const pool=[first,second];
    const prior=nextCompanySpotlight(pool,null,11,"Starter","avoid_until_exhausted");
    const changed=nextCompanySpotlight([first],prior.state,11,"Starter","avoid_until_exhausted");
    expect(changed.state.poolFingerprint).not.toBe(prior.state.poolFingerprint);
    expect(changed.state.nextIndex).toBe(0);
    expect(()=>nextCompanySpotlight(pool,null,0,"Starter","avoid_until_exhausted")).toThrow("customer identity");
    expect(()=>nextCompanySpotlight(pool,null,11,"","avoid_until_exhausted")).toThrow("package scope");
  });
  it("resumes the exact next company from a JSON-persisted cursor after restart",()=>{
    const pool=buildCompanySpotlightPool("",allVerifiedState,COMPANY_REFERENCE_CATALOGUE.slice(0,12));
    const first=nextCompanySpotlight(pool,null,91,"Tier A","avoid_until_exhausted");
    const restartedState=JSON.parse(JSON.stringify(first.state));
    const afterRestart=nextCompanySpotlight(pool,restartedState,91,"Tier A","avoid_until_exhausted");
    const uninterrupted=nextCompanySpotlight(pool,first.state,91,"Tier A","avoid_until_exhausted");
    expect(afterRestart.company.id).toBe(uninterrupted.company.id);
    expect(afterRestart.rotationCycle).toBe(uninterrupted.rotationCycle);
    expect(afterRestart.rotationSequence).toBe(uninterrupted.rotationSequence);
  });
  it("supports repeat mode without changing reference-only classification",()=>{
    const pool=COMPANY_REFERENCE_CATALOGUE.slice(0,8);
    const result=nextCompanySpotlight(pool,null,7,"Starter","allow_repeats");
    expect(pool.some(company=>company.id===result.company.id)).toBe(true);
    expect(result.state.repeatPolicy).toBe("allow_repeats");
    expect(result.state.requestCount).toBe(1);
  });
});


describe("current customer company snapshot authorization",()=>{
  it("hides previously selected snapshots immediately after unverify, reject, archive, or disable",()=>{
    const companyId=COMPANY_REFERENCE_CATALOGUE[0]!.id;
    const approved={verifiedIds:[companyId],archivedIds:[]};
    expect(isCompanySpotlightDisplayAllowed(companyId,approved)).toBe(true);
    expect(isCompanySpotlightDisplayAllowed(companyId,{...approved,disabledIds:[companyId]})).toBe(false);
    // Pending, rejected, and disabled entries are represented by absence from the
    // administrator-approved ID set; archived IDs are independently denied.
    for(const state of [
      {verifiedIds:[],archivedIds:[]},
      {verifiedIds:[],archivedIds:[companyId]},
    ]) expect(isCompanySpotlightDisplayAllowed(companyId,state)).toBe(false);
  });
  it("fails closed for stale, malformed, or non-string snapshot references",()=>{
    const state=parseCompanyCatalogueAdminState("{malformed");
    for(const id of [null,undefined,42,"logo-brand-0000","logo-brand-0001"]) {
      expect(isCompanySpotlightDisplayAllowed(id,state)).toBe(false);
    }
  });
});

describe("customer company catalogue access boundary",()=>{
  const routerSource=readFileSync(new URL("../routers.ts",import.meta.url),"utf8");
  const customerPortal=readFileSync(new URL("../../client/src/App.tsx",import.meta.url),"utf8");
  const adminCatalogue=readFileSync(new URL("../../client/src/components/AdminCompanyCatalogue.tsx",import.meta.url),"utf8");
  it("keeps the full catalogue and direct lookup endpoints administrator-only",()=>{
    for(const endpoint of ["summary","count","search","byId","bySymbol","random","next"]) {
      const match=routerSource.match(new RegExp(endpoint+": adminProcedure"));
      expect(match,endpoint+" must require administrator authorization").not.toBeNull();
    }
  });
  it("exposes separate administrator verify, reject, enable, disable, and archive controls",()=>{
    for(const action of ["Mark selected verified","Reject / mark unverified","Enable selected","Disable selected","Delete selected"]) expect(adminCatalogue).toContain(action);
    expect(adminCatalogue).toContain('<option value="disabled">Disabled</option>');
  });
  it("uses customer-only catalogue routes that filter current approvals before pagination",()=>{
    expect(routerSource).toContain("customerSearch: protectedProcedure");
    expect(routerSource).toContain("customerCount: protectedProcedure");
    expect(routerSource).toContain("customerSummary: protectedProcedure");
    expect(routerSource).toContain("const companyDisplayAllowed = createCompanySpotlightDisplayGuard(adminState)");
    expect(routerSource).toContain(".filter((company) => companyDisplayAllowed(company.id))");
    expect(routerSource).toContain(".slice(offset, offset + limit)");
    expect(customerPortal).toContain("companyCatalogueReference.customerSearch.useQuery");
    expect(customerPortal).toContain("companyCatalogueReference.customerCount.useQuery");
    expect(customerPortal).toContain("companyCatalogueReference.customerSummary.useQuery");
    expect(customerPortal).not.toContain("companyCatalogueReference.search.useQuery");
  });
});
