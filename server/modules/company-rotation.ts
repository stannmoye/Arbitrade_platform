import {COMPANY_REFERENCE_CATALOGUE,type CompanyReferenceRecord} from "./company-catalogue-reference";
export type ListedCompany=Pick<CompanyReferenceRecord,"id"|"name"|"ticker"|"exchangeCode"|"countryCode"|"sector"|"listingStatus"|"lastVerifiedAt">;
export type RotationFilters={countryCodes?:string[];sectors?:string[];excludedCompanyIds?:string[];verificationMaxAgeDays?:number};
const DEFAULT_VERIFICATION_MAX_AGE_DAYS=180;
export function eligibleCompanies(companies:ListedCompany[],filters:RotationFilters={},now=new Date()){
 const maxAge=filters.verificationMaxAgeDays??DEFAULT_VERIFICATION_MAX_AGE_DAYS,countries=filters.countryCodes?.length?new Set(filters.countryCodes.map(x=>x.toUpperCase())):null,sectors=filters.sectors?.length?new Set(filters.sectors.map(x=>x.toLowerCase())):null,excluded=new Set(filters.excludedCompanyIds??[]);
 return companies.filter(c=>{if(!c.id||excluded.has(c.id)||c.listingStatus!=="active"||!c.ticker||!c.exchangeCode)return false;if(countries&&(!c.countryCode||!countries.has(c.countryCode.toUpperCase())))return false;if(sectors&&(!c.sector||!sectors.has(c.sector.toLowerCase())))return false;if(!c.lastVerifiedAt)return false;const at=new Date(c.lastVerifiedAt).getTime();return Number.isFinite(at)&&at<=now.getTime()&&now.getTime()-at<=maxAge*86_400_000;});
}
export function shuffledRotation<T>(items:T[],random:()=>number=Math.random):T[]{const out=[...items];for(let i=out.length-1;i>0;i--){const sample=random();if(!Number.isFinite(sample)||sample<0||sample>=1)throw new Error("Random source must return a value in [0, 1)");const j=Math.floor(sample*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function createRotationCycle(companies:ListedCompany[],filters:RotationFilters={},random:()=>number=Math.random,now=new Date()){const eligible=eligibleCompanies(companies,filters,now);if(!eligible.length)throw new Error("No currently verified active companies match the rotation filters.");return shuffledRotation(eligible,random);}
export function createStaticCatalogueRotationCycle(filters:RotationFilters={},random:()=>number=Math.random,now=new Date()){return createRotationCycle([...COMPANY_REFERENCE_CATALOGUE],filters,random,now);}
