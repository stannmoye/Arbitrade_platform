#!/usr/bin/env node
/** Rebuild the checked-in static catalogue from an immutable upstream snapshot. No DB access. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SOURCE_COMMIT="0755fc68a578aafcf98d095cad66a2cffd78f17e";
const SOURCE_PATH="data/financialdata/international_stock_symbols.json";
const SOURCE_URL="https://raw.githubusercontent.com/adanos-software/free-ticker-database/"+SOURCE_COMMIT+"/"+SOURCE_PATH;
const TARGET_COUNT=950, CATALOGUE_DATE="2026-10-25";
const OUTPUT_PATH=fileURLToPath(new URL("../server/data/company-catalogue.json",import.meta.url));
const COUNTRY_BY_EXCHANGE={"AMS":{"code":"NL","name":"Netherlands"},"B3":{"code":"BR","name":"Brazil"},"BMV":{"code":"MX","name":"Mexico"},"BSE_IN":{"code":"IN","name":"India"},"Bursa":{"code":"MY","name":"Malaysia"},"HKEX":{"code":"HK","name":"Hong Kong"},"IDX":{"code":"ID","name":"Indonesia"},"KRX":{"code":"KR","name":"South Korea"},"LSE":{"code":"GB","name":"United Kingdom"},"NSE_IN":{"code":"IN","name":"India"},"SGX":{"code":"SG","name":"Singapore"},"TSE":{"code":"JP","name":"Japan"},"TSX":{"code":"CA","name":"Canada"},"XETRA":{"code":"DE","name":"Germany"}};
const cmp=(a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
const normalizedName=s=>String(s??"").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const slug=s=>String(s??"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
function createCatalogue(data){
 if(!Array.isArray(data.symbols)||data.symbols.length<TARGET_COUNT)throw new Error("Pinned source is missing a symbols array or enough rows.");
 const groups=new Map(),seen=new Set();
 for(const row of data.symbols){
  const name=String(row.registrant_name??"").trim(),ticker=String(row.base_ticker??"").trim(),exchange=String(row.mapped_exchange??"").trim(),symbol=String(row.financialdata_symbol??"").trim();
  if(!name||!ticker||!exchange||!symbol)continue;
  const key=normalizedName(name);if(!key||seen.has(key))continue;seen.add(key);
  if(!groups.has(exchange))groups.set(exchange,[]);groups.get(exchange).push(row);
 }
 for(const rows of groups.values())rows.sort((a,b)=>cmp(a.registrant_name,b.registrant_name)||cmp(a.financialdata_symbol,b.financialdata_symbol));
 const exchanges=[...groups.keys()].sort(cmp),selected=[];
 while(selected.length<TARGET_COUNT){let added=false;for(const exchange of exchanges){const row=groups.get(exchange).shift();if(!row)continue;selected.push(row);added=true;if(selected.length===TARGET_COUNT)break;}if(!added)break;}
 if(selected.length!==TARGET_COUNT)throw new Error("Source yielded only "+selected.length+" unique issuers; refusing to fabricate rows.");
 const companies=selected.map(row=>{const exchange=String(row.mapped_exchange).trim(),country=COUNTRY_BY_EXCHANGE[exchange]??null,symbol=String(row.financialdata_symbol).trim();return {id:"company-"+slug(exchange)+"-"+slug(symbol),name:String(row.registrant_name).trim(),ticker:String(row.base_ticker).trim(),symbol,exchangeCode:exchange,countryCode:country?.code??null,countryName:country?.name??null,headquartersCountry:null,sector:null,logoUrl:null,listingStatus:"unverified",lastVerifiedAt:null,requiresManualVerification:true,sourceConfidence:String(row.source_confidence??"unknown"),sourceRecordId:symbol,sourceObservedAt:row.observed_at?String(row.observed_at):null};});
 if(new Set(companies.map(x=>normalizedName(x.name))).size!==TARGET_COUNT||new Set(companies.map(x=>x.id)).size!==TARGET_COUNT||new Set(companies.map(x=>x.exchangeCode.toUpperCase()+":"+x.symbol.toUpperCase())).size!==TARGET_COUNT)throw new Error("Duplicate issuer/listing identity in generated catalogue.");
 return {schemaVersion:1,generatedAt:CATALOGUE_DATE,targetCount:TARGET_COUNT,companyCount:TARGET_COUNT,source:{providerName:"Adanos Free Ticker Database / financialdata international-stock-symbol reference",repositoryUrl:"https://github.com/adanos-software/free-ticker-database",sourceFilePath:SOURCE_PATH,sourceFileUrl:SOURCE_URL,sourceSnapshotCommit:SOURCE_COMMIT,sourceSnapshotAt:"2026-10-25T11:30:17Z",sourceDataGeneratedAt:String(data._meta?.generated_at??""),license:"MIT",attribution:"Copyright (c) 2025 Adanos Software GmbH",confidence:"secondary_review"},dataLimitations:["Reference metadata only. Source entries are secondary-review records and are not proof of current exchange listing or tradability.","Every included record is marked unverified and requires manual verification before any use in a live-trading workflow.","Country fields identify a known exchange market, not company headquarters. Euronext is multi-country and therefore has no inferred country value here.","The source does not provide dependable sector or company-logo data for this file; those values are null rather than guessed."],companies};
}
try{const response=await fetch(SOURCE_URL,{headers:{"user-agent":"Arbitrade-static-company-catalogue-builder/1.0"}});if(!response.ok)throw new Error("Pinned source HTTP "+response.status);const payload=createCatalogue(await response.json());await mkdir(path.dirname(OUTPUT_PATH),{recursive:true});await writeFile(OUTPUT_PATH,JSON.stringify(payload,null,2)+"\n","utf8");console.log("Wrote 950 reference records; no database connection was used.");}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
