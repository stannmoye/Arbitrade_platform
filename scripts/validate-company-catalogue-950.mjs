#!/usr/bin/env node
/** Offline validation for the checked-in static company catalogue. */
import { readFile } from "node:fs/promises";
const file=new URL("../server/data/company-catalogue.json",import.meta.url);
const norm=s=>String(s??"").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
try{
 const data=JSON.parse(await readFile(file,"utf8"));
 if(data.schemaVersion!==1||data.targetCount!==950||data.companyCount!==950||!Array.isArray(data.companies)||data.companies.length!==950)throw new Error("Expected exactly 950 catalogue records.");
 const ids=new Set(),names=new Set(),listings=new Set();
 for(const [i,c] of data.companies.entries()){
  const label="record "+(i+1);
  if(typeof c.id!=="string"||!c.id.trim()||ids.has(c.id))throw new Error(label+": invalid or duplicate ID");ids.add(c.id);
  if(typeof c.name!=="string"||!c.name.trim()||c.name.length>160)throw new Error(label+": invalid name");
  const n=norm(c.name);if(!n||names.has(n))throw new Error(label+": duplicate issuer name");names.add(n);
  if(typeof c.ticker!=="string"||!c.ticker.trim()||typeof c.symbol!=="string"||!c.symbol.trim()||typeof c.exchangeCode!=="string"||!c.exchangeCode.trim())throw new Error(label+": missing listing identity");
  const k=c.exchangeCode.toUpperCase()+":"+c.symbol.toUpperCase();if(listings.has(k))throw new Error(label+": duplicate exchange/symbol");listings.add(k);
  if(c.countryCode!==null&&!/^[A-Z]{2}$/.test(c.countryCode))throw new Error(label+": invalid country code");
  if(c.sector!==null&&typeof c.sector!=="string")throw new Error(label+": invalid sector");
  if(c.logoUrl!==null&&!(typeof c.logoUrl==="string"&&(c.logoUrl.startsWith("/company-logos/")||/^https:\/\//i.test(c.logoUrl))))throw new Error(label+": invalid logo reference");
  if(!["active","suspended","delisted","unverified"].includes(c.listingStatus)||typeof c.requiresManualVerification!=="boolean")throw new Error(label+": invalid verification status");
  if(c.listingStatus==="active"&&(c.requiresManualVerification||!c.lastVerifiedAt||!Number.isFinite(Date.parse(c.lastVerifiedAt))))throw new Error(label+": active record lacks independent verification");
  if(c.sourceObservedAt!==null&&!Number.isFinite(Date.parse(c.sourceObservedAt)))throw new Error(label+": invalid source observation date");
 }
 if(!data.source?.sourceSnapshotCommit||!data.source?.sourceFileUrl||data.source.license!=="MIT")throw new Error("Source provenance or attribution is missing");
 console.log("[company-catalogue] PASS: "+ids.size+" unique records; "+data.companies.filter(c=>c.listingStatus==="unverified").length+" remain unverified.");
}catch(error){console.error("[company-catalogue] FAIL: "+(error instanceof Error?error.message:String(error)));process.exitCode=1;}
