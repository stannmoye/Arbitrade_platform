import catalogueJson from "../data/company-catalogue.json";
export type CompanyListingStatus="active"|"suspended"|"delisted"|"unverified";
export type CompanyCatalogueItem={id:string;name:string;ticker:string;symbol:string;exchangeCode:string;countryCode:string|null;countryName:string|null;headquartersCountry:string|null;sector:string|null;logoUrl:string|null;listingStatus:CompanyListingStatus;lastVerifiedAt:string|null;requiresManualVerification:boolean;sourceConfidence:string;sourceRecordId:string;sourceObservedAt:string|null};
type Payload={schemaVersion:number;generatedAt:string;targetCount:number;companyCount:number;source:{providerName:string;repositoryUrl:string;sourceFilePath:string;sourceFileUrl:string;sourceSnapshotCommit:string;sourceSnapshotAt:string;sourceDataGeneratedAt:string;license:string;attribution:string;confidence:string};dataLimitations:string[];companies:CompanyCatalogueItem[]};
export type CompanyCatalogueSearch={search?:string;countryCode?:string;exchangeCode?:string;limit?:number};
const payload=catalogueJson as unknown as Payload;
function validate(value:Payload){
 if(value.schemaVersion!==1||value.targetCount!==950||value.companyCount!==950||value.companies.length!==950)throw new Error("Static company catalogue must contain exactly 950 records.");
 const ids=new Set<string>(),names=new Set<string>(),listings=new Set<string>();
 for(const c of value.companies){
  if(!c.id||!c.name||!c.ticker||!c.symbol||!c.exchangeCode)throw new Error("Static catalogue record is missing identity fields.");
  const name=c.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),listing=c.exchangeCode.toUpperCase()+":"+c.symbol.toUpperCase();
  if(ids.has(c.id)||names.has(name)||listings.has(listing))throw new Error("Static company catalogue has duplicate identities.");ids.add(c.id);names.add(name);listings.add(listing);
  if(c.countryCode!==null&&!/^[A-Z]{2}$/.test(c.countryCode))throw new Error("Static catalogue has invalid country code.");
  if(c.listingStatus==="active"&&(c.requiresManualVerification||!c.lastVerifiedAt||!Number.isFinite(Date.parse(c.lastVerifiedAt))))throw new Error("Active catalogue record lacks independent verification.");
 }
}
validate(payload);
export const COMPANY_CATALOGUE:readonly CompanyCatalogueItem[]=Object.freeze(payload.companies.map(c=>Object.freeze({...c})));
const byId=new Map(COMPANY_CATALOGUE.map(c=>[c.id,c]));
const byListing=new Map(COMPANY_CATALOGUE.map(c=>[c.exchangeCode.toUpperCase()+":"+c.symbol.toUpperCase(),c]));
export function getCompanyCatalogue():readonly CompanyCatalogueItem[]{return COMPANY_CATALOGUE;}
export function getCompanyCatalogueById(id:string):CompanyCatalogueItem|undefined{return byId.get(id);}
export function getCompanyCatalogueBySymbol(symbol:string,exchangeCode?:string):CompanyCatalogueItem|undefined{const s=symbol.trim().toUpperCase();if(exchangeCode)return byListing.get(exchangeCode.trim().toUpperCase()+":"+s);return COMPANY_CATALOGUE.find(c=>c.symbol.toUpperCase()===s||c.ticker.toUpperCase()===s);}
export function searchCompanyCatalogue(f:CompanyCatalogueSearch={}):CompanyCatalogueItem[]{const q=f.search?.trim().toLowerCase(),country=f.countryCode?.trim().toUpperCase(),exchange=f.exchangeCode?.trim().toUpperCase(),limit=Number.isFinite(f.limit)?Math.max(1,Math.min(100,Math.floor(f.limit!))):50;const result:CompanyCatalogueItem[]=[];for(const c of COMPANY_CATALOGUE){if(q&&![c.name,c.ticker,c.symbol,c.exchangeCode].some(v=>v.toLowerCase().includes(q)))continue;if(country&&c.countryCode!==country)continue;if(exchange&&c.exchangeCode.toUpperCase()!==exchange)continue;result.push(c);if(result.length>=limit)break;}return result;}
export function getCompanyCatalogueSummary(){return {total:COMPANY_CATALOGUE.length,unverified:COMPANY_CATALOGUE.filter(c=>c.listingStatus==="unverified").length,verifiedActive:COMPANY_CATALOGUE.filter(c=>c.listingStatus==="active"&&!c.requiresManualVerification&&Boolean(c.lastVerifiedAt)).length,exchangeCount:new Set(COMPANY_CATALOGUE.map(c=>c.exchangeCode)).size,marketCountryCount:new Set(COMPANY_CATALOGUE.map(c=>c.countryCode).filter(Boolean)).size,source:{providerName:payload.source.providerName,sourceSnapshotCommit:payload.source.sourceSnapshotCommit,sourceSnapshotAt:payload.source.sourceSnapshotAt,sourceDataGeneratedAt:payload.source.sourceDataGeneratedAt,license:payload.source.license}};}
