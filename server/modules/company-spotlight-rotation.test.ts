import {describe,expect,it} from "vitest";
import {COMPANY_REFERENCE_CATALOGUE} from "./company-catalogue-reference";
import {buildCompanySpotlightPool,nextCompanySpotlight,normalizeCompanyRotationCountryNames} from "./company-spotlight-rotation";

describe("package-scoped company spotlight rotation",()=>{
  it("uses stable Logo IDs from the full informational catalogue",()=>{
    const pool=buildCompanySpotlightPool("");
    expect(pool).toHaveLength(1811);
    expect(new Set(pool.map(company=>company.id)).size).toBe(1811);
    expect(pool.every(company=>company.listingStatus==="unverified")).toBe(true);
  });
  it("normalizes exact country-folder filters and rejects unknown labels",()=>{
    const country=COMPANY_REFERENCE_CATALOGUE[0]!.countryName;
    expect(normalizeCompanyRotationCountryNames(" "+country+", "+country+" ")).toBe(country);
    expect(buildCompanySpotlightPool(country).every(company=>company.countryName===country)).toBe(true);
    expect(()=>normalizeCompanyRotationCountryNames("Definitely Not a Country Folder")).toThrow("Unknown company catalogue country-folder label");
  });
  it("avoids repeats until the full filtered pool has been traversed",()=>{
    const pool=buildCompanySpotlightPool("",COMPANY_REFERENCE_CATALOGUE.slice(0,8));
    let state:unknown=null;const seen=new Set<string>();
    for(let i=0;i<pool.length;i++){const result=nextCompanySpotlight(pool,state,42,"Starter","avoid_until_exhausted");expect(seen.has(result.company.id)).toBe(false);seen.add(result.company.id);state=result.state;}
    expect(seen.size).toBe(pool.length);
    const next=nextCompanySpotlight(pool,state,42,"Starter","avoid_until_exhausted");
    expect(next.state.cycleNumber).toBe(2);expect(next.state.requestCount).toBe(pool.length+1);
  });
  it("resets its cursor when country filters change and validates customer/package scope",()=>{
    const first=COMPANY_REFERENCE_CATALOGUE[0]!;
    const second=COMPANY_REFERENCE_CATALOGUE.find(company=>company.countryName!==first.countryName)!;
    const pool=[first,second];
    const prior=nextCompanySpotlight(pool,null,11,"Starter","avoid_until_exhausted");
    const changed=nextCompanySpotlight([first],prior.state,11,"Starter","avoid_until_exhausted");
    expect(changed.state.poolFingerprint).not.toBe(prior.state.poolFingerprint);
    expect(changed.state.nextIndex).toBe(1);
    expect(()=>nextCompanySpotlight(pool,null,0,"Starter","avoid_until_exhausted")).toThrow("customer identity");
    expect(()=>nextCompanySpotlight(pool,null,11,"","avoid_until_exhausted")).toThrow("package scope");
  });
  it("supports repeat mode without changing reference-only classification",()=>{
    const pool=COMPANY_REFERENCE_CATALOGUE.slice(0,8);
    const result=nextCompanySpotlight(pool,null,7,"Starter","allow_repeats");
    expect(pool.some(company=>company.id===result.company.id)).toBe(true);
    expect(result.state.repeatPolicy).toBe("allow_repeats");
    expect(result.state.requestCount).toBe(1);
  });
});
