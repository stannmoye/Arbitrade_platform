import {describe,expect,it} from "vitest";
import {COMPANY_CATALOGUE} from "./company-catalogue";
import {createRotationCycle,createStaticCatalogueRotationCycle,eligibleCompanies,shuffledRotation,type ListedCompany} from "./company-rotation";
const now=new Date("2026-10-25T12:00:00.000Z");
const company=(id:string,overrides:Partial<ListedCompany>={}):ListedCompany=>({id,name:"Company "+id,ticker:"T"+id,exchangeCode:"XNAS",countryCode:"US",sector:"Technology",listingStatus:"active",lastVerifiedAt:"2026-10-01T00:00:00.000Z",...overrides});
describe("verified company rotation with static IDs",()=>{
 it("filters inactive, unverified, stale and excluded records",()=>{const rows=[company("c1"),company("c2",{listingStatus:"suspended"}),company("c3",{lastVerifiedAt:null}),company("c4",{lastVerifiedAt:"2025-01-01T00:00:00.000Z"}),company("c5")];expect(eligibleCompanies(rows,{excludedCompanyIds:["c5"]},now).map(c=>c.id)).toEqual(["c1"]);});
 it("filters by country and sector case-insensitively",()=>{const rows=[company("c1"),company("c2",{countryCode:"JP",sector:"Industrials"})];expect(eligibleCompanies(rows,{countryCodes:["jp"],sectors:["industrials"]},now).map(c=>c.id)).toEqual(["c2"]);});
 it("creates a full cycle without duplicates",()=>{const cycle=createRotationCycle([company("c1"),company("c2"),company("c3"),company("c4")],{},()=>0,now);expect(cycle).toHaveLength(4);expect(new Set(cycle.map(c=>c.id)).size).toBe(4);});
 it("fails closed while the checked-in entries remain unverified",()=>{expect(COMPANY_CATALOGUE.every(c=>c.listingStatus==="unverified")).toBe(true);expect(()=>createStaticCatalogueRotationCycle({},Math.random,now)).toThrow("No currently verified active companies match");});
 it("rejects an invalid random source",()=>expect(()=>shuffledRotation([1,2],()=>1)).toThrow("Random source"));
});
