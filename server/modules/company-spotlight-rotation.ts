import crypto from "node:crypto";
import { COMPANY_REFERENCE_CATALOGUE, type CompanyReferenceRecord } from "./company-catalogue-reference";

export type CompanySpotlightRepeatPolicy = "avoid_until_exhausted" | "allow_repeats";
export type CompanySpotlightState = { poolFingerprint:string; repeatPolicy:CompanySpotlightRepeatPolicy; cycleNumber:number; nextIndex:number; requestCount:number; lastLogoId:string|null };
const knownCountryNames = new Set(COMPANY_REFERENCE_CATALOGUE.map(company=>company.countryName).filter(Boolean));
const orderCache = new Map<string, CompanyReferenceRecord[]>();
const digest=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");

export function normalizeCompanyRotationCountryNames(raw:unknown):string {
  const names=(Array.isArray(raw)?raw:String(raw??"").split(",")).map(name=>String(name).trim()).filter(Boolean);
  const unique=[...new Set(names)];
  if(unique.length>100) throw new Error("Company rotation supports at most 100 country-folder filters.");
  const invalid=unique.filter(name=>!knownCountryNames.has(name));
  if(invalid.length) throw new Error("Unknown company catalogue country-folder label: "+invalid.slice(0,3).join(", "));
  return unique.join(", ");
}
export type CompanyCatalogueAdminState = {
  verifiedIds: readonly string[];
  archivedIds: readonly string[];
  disabledIds?: readonly string[];
};

/** Malformed or missing administrator state fails closed: no company is approved for customer display. */
export function parseCompanyCatalogueAdminState(raw: unknown): CompanyCatalogueAdminState {
  let parsed: unknown = raw;
  try {
    if (typeof raw === "string") parsed = JSON.parse(raw || "{}");
  } catch {
    return { verifiedIds: [], archivedIds: [], disabledIds: [] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { verifiedIds: [], archivedIds: [], disabledIds: [] };
  }
  const state = parsed as Record<string, unknown>;
  const parseIds = (value: unknown, optional = false): string[] | null => {
    if (value === undefined && optional) return [];
    if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !/^logo-brand-\d{4}$/.test(id))) {
      return null;
    }
    return [...new Set(value as string[])];
  };
  // Older valid states predate disabledIds, so that one field is optional.
  // A malformed approval or exclusion list invalidates the entire state: never
  // turn a corrupt archived/disabled list into permission to show a company.
  const verifiedIds = parseIds(state.verifiedIds);
  const archivedIds = parseIds(state.archivedIds);
  const disabledIds = parseIds(state.disabledIds, true);
  if (!verifiedIds || !archivedIds || !disabledIds) {
    return { verifiedIds: [], archivedIds: [], disabledIds: [] };
  }
  return { verifiedIds, archivedIds, disabledIds };
}

/** Customer reads must revalidate persisted snapshots against current admin approval. */
export function createCompanySpotlightDisplayGuard(
  adminState: CompanyCatalogueAdminState,
): (companyId: unknown) => boolean {
  const verifiedIds = new Set(adminState.verifiedIds);
  const archivedIds = new Set(adminState.archivedIds);
  const disabledIds = new Set(adminState.disabledIds ?? []);
  return (companyId: unknown) => typeof companyId === "string" &&
    verifiedIds.has(companyId) &&
    !archivedIds.has(companyId) &&
    !disabledIds.has(companyId);
}

export function isCompanySpotlightDisplayAllowed(
  companyId: unknown,
  adminState: CompanyCatalogueAdminState,
): boolean {
  return createCompanySpotlightDisplayGuard(adminState)(companyId);
}

export function buildCompanySpotlightPool(
  countryNames: string,
  adminState: CompanyCatalogueAdminState,
  catalogue: readonly CompanyReferenceRecord[] = COMPANY_REFERENCE_CATALOGUE,
): CompanyReferenceRecord[] {
  const selected = new Set(normalizeCompanyRotationCountryNames(countryNames).split(",").map(name => name.trim()).filter(Boolean));
  const verified = new Set(adminState.verifiedIds);
  const archived = new Set(adminState.archivedIds);
  const disabled = new Set(adminState.disabledIds ?? []);
  // Administrator approval is required for customer spotlight display. Archived and disabled
  // always win, including stale state that also contains an ID in verifiedIds.
  const pool = catalogue.filter(company =>
    company.id && company.name && company.logoUrl &&
    verified.has(company.id) && !archived.has(company.id) && !disabled.has(company.id) &&
    (!selected.size || selected.has(company.countryName)),
  );
  if (new Set(pool.map(company => company.id)).size !== pool.length) {
    throw new Error("Company spotlight pool contains duplicate Logo IDs.");
  }
  // An empty approved pool is valid: callers omit the company identity rather
  // than falling back to an unverified or archived catalogue record.
  return pool;
}
export function nextCompanySpotlight(pool:CompanyReferenceRecord[],priorState:unknown,userId:number,packageName:string,repeatPolicy:CompanySpotlightRepeatPolicy):{company:CompanyReferenceRecord;state:CompanySpotlightState;rotationCycle:number;rotationSequence:number;poolFingerprint:string}{
  if(!Number.isSafeInteger(userId)||userId<1) throw new Error("A valid customer identity is required for company rotation.");
  if(!packageName.trim()||packageName.length>80) throw new Error("A valid Trading package scope is required for company rotation.");
  if(repeatPolicy!=="avoid_until_exhausted"&&repeatPolicy!=="allow_repeats") throw new Error("Unsupported company rotation repeat policy.");
  if(!pool.length) throw new Error("Company spotlight pool is empty.");
  const ids=pool.map(company=>company.id).sort();
  if(new Set(ids).size!==ids.length) throw new Error("Company spotlight pool contains duplicate Logo IDs.");
  const fingerprint=digest(ids.join("\n"));
  const raw=priorState as Partial<CompanySpotlightState>|null;
  const state:CompanySpotlightState=raw&&raw.poolFingerprint===fingerprint&&raw.repeatPolicy===repeatPolicy&&Number.isSafeInteger(raw.cycleNumber)&&Number(raw.cycleNumber)>=1&&Number.isSafeInteger(raw.nextIndex)&&Number(raw.nextIndex)>=0&&Number(raw.nextIndex)<pool.length&&Number.isSafeInteger(raw.requestCount)&&Number(raw.requestCount)>=0
    ?{poolFingerprint:fingerprint,repeatPolicy,cycleNumber:Number(raw.cycleNumber),nextIndex:Number(raw.nextIndex),requestCount:Number(raw.requestCount),lastLogoId:typeof raw.lastLogoId==="string"?raw.lastLogoId:null}
    :{poolFingerprint:fingerprint,repeatPolicy,cycleNumber:1,nextIndex:0,requestCount:0,lastLogoId:null};
  const rotationCycle=state.cycleNumber;
  const rotationSequence=state.requestCount+1;
  let company:CompanyReferenceRecord,nextIndex=state.nextIndex,cycleNumber=state.cycleNumber;
  if(repeatPolicy==="allow_repeats"){
    const index=Number.parseInt(digest(userId+":"+packageName+":"+fingerprint+":"+state.requestCount).slice(0,8),16)%pool.length;
    company=pool[index]!;
    nextIndex=(state.nextIndex+1)%pool.length;
    if(nextIndex===0) cycleNumber++;
  }else{
    let ordered=orderCache.get(fingerprint);
    if(!ordered){ordered=[...pool].sort((a,b)=>digest(fingerprint+":"+a.id).localeCompare(digest(fingerprint+":"+b.id))||a.id.localeCompare(b.id));orderCache.set(fingerprint,ordered);if(orderCache.size>64)orderCache.delete(orderCache.keys().next().value!);}
    const offset=Number.parseInt(digest(userId+":"+packageName+":"+fingerprint+":"+cycleNumber).slice(0,8),16)%ordered.length;
    company=ordered[(offset+nextIndex)%ordered.length]!;
    nextIndex++;
    if(nextIndex>=ordered.length){nextIndex=0;cycleNumber++;}
  }
  return {company,state:{poolFingerprint:fingerprint,repeatPolicy,cycleNumber,nextIndex,requestCount:state.requestCount+1,lastLogoId:company.id},rotationCycle,rotationSequence,poolFingerprint:fingerprint};
}
