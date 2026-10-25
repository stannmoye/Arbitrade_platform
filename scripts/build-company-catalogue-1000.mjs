#!/usr/bin/env node
/**
 * Build a static 1,000-company reference catalogue with locally generated neutral placeholders.
 * Company identities come from the pinned ticker source; no third-party logo redistribution is required.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_REPOSITORY = "adanos-software/free-ticker-database";
const LOGO_REPOSITORY = "tradient0/companies-logo";
const SOURCE_COMMIT_API = "https://api.github.com/repos/" + SOURCE_REPOSITORY + "/commits/main";
const LOGO_COMMIT_API = "https://api.github.com/repos/" + LOGO_REPOSITORY + "/commits/main";
const SOURCE_RAW_ROOT = "https://raw.githubusercontent.com/" + SOURCE_REPOSITORY;
const LOGO_RAW_ROOT = "https://raw.githubusercontent.com/" + LOGO_REPOSITORY;
const LOGO_API_ROOT = "https://logo.tradient.org/v1/";
const OUTPUT_JSON = join(ROOT, "server/data/company-catalogue-1000.json");
const OUTPUT_LOGO_DIR = join(ROOT, "client/public/assets/company-logos");
const CONCURRENCY = 8;
const MAX_LOGO_BYTES = 200 * 1024;
const attemptedCandidateIds = new Set();

const POOL_A = [
  ["Japan", "JP"], ["India", "IN"], ["France", "FR"], ["Italy", "IT"], ["Brazil", "BR"],
  ["Russia", "RU"], ["Mexico", "MX"], ["South Korea", "KR"], ["Spain", "ES"], ["Indonesia", "ID"],
  ["Turkey", "TR"], ["Netherlands", "NL"], ["Saudi Arabia", "SA"], ["Switzerland", "CH"], ["Poland", "PL"],
  ["Taiwan", "TW"], ["Belgium", "BE"], ["Sweden", "SE"], ["Argentina", "AR"], ["Ireland", "IE"],
  ["Thailand", "TH"], ["United Arab Emirates", "AE"], ["Israel", "IL"], ["Austria", "AT"], ["Norway", "NO"],
  ["Singapore", "SG"], ["Vietnam", "VN"], ["Bangladesh", "BD"], ["Egypt", "EG"], ["Philippines", "PH"],
  ["Malaysia", "MY"], ["Denmark", "DK"], ["South Africa", "ZA"], ["Finland", "FI"], ["Chile", "CL"],
  ["Romania", "RO"], ["Czechia", "CZ"], ["Portugal", "PT"], ["Hong Kong", "HK"], ["Peru", "PE"],
];
const POOL_B = [
  ["USA", "US"], ["UK", "GB"], ["Germany", "DE"], ["Australia", "AU"], ["Canada", "CA"], ["China", "CN"],
];
const TARGETS = [
  ...POOL_A.map(([name, code], index) => ({ name, code, pool: "A", target: index < 30 ? 14 : 13 })),
  ...POOL_B.map(([name, code]) => ({ name, code, pool: "B", target: 75 })),
];
const COUNTRY_CODES = new Map(TARGETS.map((x) => [x.code, x]));
const NAME_TO_CODE = new Map();
for (const entry of TARGETS) {
  NAME_TO_CODE.set(norm(entry.name), entry.code);
  NAME_TO_CODE.set(norm(entry.code), entry.code);
}
for (const [alias, code] of Object.entries({
  "united states": "US", "united states of america": "US", "america": "US", "usa": "US",
  "united kingdom": "GB", "great britain": "GB", "britain": "GB", "uk": "GB", "england": "GB",
  "germany": "DE", "deutschland": "DE", "south korea": "KR", "korea republic of": "KR",
  "republic of korea": "KR", "korea south": "KR", "czech republic": "CZ", "czechia": "CZ",
  "united arab emirates": "AE", "uae": "AE", "russian federation": "RU", "russia": "RU",
  "viet nam": "VN", "vietnam": "VN", "turkiye": "TR", "türkiye": "TR", "turkey": "TR",
  "taiwan province of china": "TW", "taiwan": "TW", "china": "CN",
  "republic of ireland": "IE", "ireland": "IE", "republic of china": "TW",
})) NAME_TO_CODE.set(norm(alias), code);

const EXCHANGE_ALIASES = {
  NASDAQ: ["NASDAQ", "NASD", "XNAS"], "NASDAQ GLOBAL SELECT": ["NASDAQ", "NASD", "XNAS"],
  "NASDAQ GLOBAL MARKET": ["NASDAQ", "NASD", "XNAS"], "NASDAQ CAPITAL MARKET": ["NASDAQ", "NASD", "XNAS"],
  NYSE: ["NYSE", "XNYS"], "NYSE ARCA": ["NYSE ARCA", "NYSEARCA", "ARCA", "ARCX"],
  "NYSE ARCA ETF": ["NYSE ARCA", "NYSEARCA", "ARCA", "ARCX"], "NYSE MKT": ["NYSE MKT", "AMEX"],
  AMEX: ["AMEX", "NYSE MKT"], OTC: ["OTC", "OTCMKTS"], OTCQB: ["OTC", "OTCMKTS"],
  OTCQX: ["OTC", "OTCMKTS"], "LONDON STOCK EXCHANGE": ["LSE"], LSE: ["LSE", "XLON"],
  XETRA: ["XETRA", "XETR"], "DEUTSCHE BOERSE XETRA": ["XETRA", "XETR"],
  "TORONTO STOCK EXCHANGE": ["TSX", "XTSE"], TSX: ["TSX", "XTSE"],
  "TSX VENTURE": ["TSXV", "XTSX"], TSXV: ["TSXV", "XTSX"], ASX: ["ASX", "XASX"],
  SSE: ["SSE", "XSHG"], "SHANGHAI STOCK EXCHANGE": ["SSE", "XSHG"],
  SZSE: ["SZSE", "XSHE"], "SHENZHEN STOCK EXCHANGE": ["SZSE", "XSHE"],
  TSE: ["TSE", "XTKS"], "TOKYO STOCK EXCHANGE": ["TSE", "XTKS"],
  NSE_IN: ["NSE", "NSE_IN"], NSE: ["NSE", "NSE_IN"], BSE_IN: ["BSE", "BSE_IN"], BSE: ["BSE", "BSE_IN"],
  B3: ["B3", "BVMF"], BVMF: ["B3", "BVMF"], MOEX: ["MOEX", "MCX"], MCX: ["MOEX", "MCX"],
  BMV: ["BMV", "MEX"], KRX: ["KRX", "KOE"], KOSDAQ: ["KOSDAQ", "KQ"],
  BME: ["BME", "MCE"], IDX: ["IDX", "JKT"], BIST: ["BIST"], AMS: ["AMS", "XAMS"],
  "EURONEXT AMSTERDAM": ["AMS", "XAMS"], "EURONEXT PARIS": ["EPA", "PAR", "XPAR"],
  "EURONEXT BRUSSELS": ["EBR", "BRU"], "EURONEXT DUBLIN": ["ISE", "DUB"],
  "EURONEXT LISBON": ["LIS", "XLIS"], "PRAGUE STOCK EXCHANGE": ["PSE", "PRA"],
  "BUCHAREST STOCK EXCHANGE": ["BVB"], "TAIWAN STOCK EXCHANGE": ["TWSE", "TPE"],
  "INDONESIA STOCK EXCHANGE": ["IDX", "JKT"], "KOREA EXCHANGE": ["KRX", "KOE"],
  "SAUDI EXCHANGE": ["TADAWUL", "SAU"], "BORSA ISTANBUL": ["BIST"],
  EPA: ["EPA", "PAR", "XPAR"], PAR: ["EPA", "PAR", "XPAR"], MIL: ["MIL", "BIT", "XMIL"],
  BIT: ["MIL", "BIT", "XMIL"], "BORSA ITALIANA": ["MIL", "BIT", "XMIL"],
  TADAWUL: ["TADAWUL", "SAU"], SIX: ["SIX", "SWX", "XSWX"], SWX: ["SIX", "SWX", "XSWX"],
  WSE: ["WSE", "GPW"], GPW: ["WSE", "GPW"], TWSE: ["TWSE", "TPE"], TPEX: ["TPEX", "TWO"],
  EBR: ["EBR", "BRU"], BRU: ["EBR", "BRU"], STO: ["STO", "XSTO"], BCBA: ["BCBA", "BYMA"],
  BYMA: ["BCBA", "BYMA"], ISE: ["ISE", "DUB"], DUB: ["ISE", "DUB"], SET: ["SET"],
  ADX: ["ADX"], DFM: ["DFM"], TASE: ["TASE"], VIE: ["VIE", "WBO"], OSL: ["OSL", "XOSL"],
  SGX: ["SGX", "SES"], HOSE: ["HOSE", "VNINDEX"], HNX: ["HNX"], DSE: ["DSE"],
  EGX: ["EGX"], PSE: ["PSE"], KLSE: ["KLSE", "MYX"], MYX: ["KLSE", "MYX"],
  CPH: ["CPH", "XCSE"], JSE: ["JSE", "XJSE"], HEL: ["HEL", "XHEL"], SGO: ["SGO", "SCL"],
  BVB: ["BVB"], LIS: ["LIS", "XLIS"], HKEX: ["HKEX", "SEHK", "XHKG"], SEHK: ["HKEX", "SEHK", "XHKG"], HKG: ["HKEX", "SEHK", "XHKG"], BVL: ["BVL", "LIM"],
};
const PREFIX_COUNTRY = {
  NASDAQ: "US", NASD: "US", XNAS: "US", NYSE: "US", XNYS: "US", "NYSE ARCA": "US", NYSEARCA: "US",
  ARCA: "US", ARCX: "US", AMEX: "US", "NYSE MKT": "US", OTC: "US", OTCMKTS: "US",
  LSE: "GB", XLON: "GB", XETRA: "DE", XETR: "DE", FRA: "DE", BER: "DE", DUS: "DE", MUN: "DE",
  HAM: "DE", STU: "DE", ASX: "AU", XASX: "AU", TSX: "CA", XTSE: "CA", TSXV: "CA", XTSX: "CA",
  SSE: "CN", XSHG: "CN", SZSE: "CN", XSHE: "CN", TSE: "JP", XTKS: "JP", NSE: "IN", NSE_IN: "IN",
  BSE: "IN", BSE_IN: "IN", EPA: "FR", PAR: "FR", XPAR: "FR", AMS: "NL", XAMS: "NL",
  MIL: "IT", BIT: "IT", XMIL: "IT", B3: "BR", BVMF: "BR", MOEX: "RU", MCX: "RU", BMV: "MX",
  MEX: "MX", KRX: "KR", KOE: "KR", KOSDAQ: "KR", KQ: "KR", BME: "ES", MCE: "ES", IDX: "ID",
  JKT: "ID", BIST: "TR", TADAWUL: "SA", SAU: "SA", SIX: "CH", SWX: "CH", XSWX: "CH", WSE: "PL",
  GPW: "PL", TWSE: "TW", TPE: "TW", TPEX: "TW", TWO: "TW", EBR: "BE", BRU: "BE", STO: "SE",
  XSTO: "SE", BCBA: "AR", BYMA: "AR", ISE: "IE", DUB: "IE", SET: "TH", ADX: "AE", DFM: "AE",
  TASE: "IL", VIE: "AT", WBO: "AT", OSL: "NO", XOSL: "NO", SGX: "SG", SES: "SG", HOSE: "VN",
  HNX: "VN", DSE: "BD", EGX: "EG", PSE: "PH", KLSE: "MY", MYX: "MY", CPH: "DK", XCSE: "DK",
  JSE: "ZA", XJSE: "ZA", HEL: "FI", XHEL: "FI", SGO: "CL", SCL: "CL", BVB: "RO", PSE_PRAGUE: "CZ",
  LIS: "PT", XLIS: "PT", HKEX: "HK", SEHK: "HK", XHKG: "HK", BVL: "PE", LIM: "PE",
};
const SUFFIXES_BY_COUNTRY = {
  US: [".US"], GB: [".L"], DE: [".DE", ".F"], AU: [".AX"], CA: [".TO", ".V", ".CN"],
  CN: [".SS", ".SH", ".SZ"], JP: [".T"], IN: [".NS", ".BO"], FR: [".PA"],
  IT: [".MI"], BR: [".SA"], RU: [".ME"], MX: [".MX"], KR: [".KS", ".KQ"],
  ES: [".MC"], ID: [".JK"], TR: [".IS"], NL: [".AS"], SA: [".SR"], CH: [".SW"],
  PL: [".WA"], TW: [".TW"], BE: [".BR"], SE: [".ST"], AR: [".BA"], IE: [".IR"],
  TH: [".BK"], AE: [".AE"], IL: [".TA"], AT: [".VI"], NO: [".OL"], SG: [".SI"],
  VN: [".VN"], BD: [".BD"], EG: [".CA"], PH: [".PS"], MY: [".KL"], DK: [".CO"],
  ZA: [".JO"], FI: [".HE"], CL: [".SN"], RO: [".RO"], CZ: [".PR"], PT: [".LS"],
  HK: [".HK"], PE: [".LM"],
};

function norm(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normCode(value) { return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeCountryCode(rawCode, rawCountry) {
  const raw = String(rawCode ?? "").trim().toUpperCase();
  const aliases = { USA: "US", UK: "GB", GBR: "GB", KOR: "KR", KOR_SOUTH: "KR", UAE: "AE", VNM: "VN", CZE: "CZ", RUS: "RU", TWN: "TW", CHN: "CN", AUS: "AU", CAN: "CA", DEU: "DE", JPN: "JP", IND: "IN", FRA: "FR", ITA: "IT", BRA: "BR", MEX: "MX", ESP: "ES", IDN: "ID", TUR: "TR", NLD: "NL", SAU: "SA", CHE: "CH", POL: "PL", BEL: "BE", SWE: "SE", ARG: "AR", IRL: "IE", THA: "TH", ISR: "IL", AUT: "AT", NOR: "NO", SGP: "SG", BGD: "BD", EGY: "EG", PHL: "PH", MYS: "MY", DNK: "DK", ZAF: "ZA", FIN: "FI", CHL: "CL", ROU: "RO", PRT: "PT", KAZ: "KZ", HKG: "HK", PER: "PE" };
  if (COUNTRY_CODES.has(aliases[raw])) return aliases[raw];
  if (COUNTRY_CODES.has(raw)) return raw;
  return NAME_TO_CODE.get(norm(rawCountry)) ?? NAME_TO_CODE.get(norm(raw)) ?? null;
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; field = ""; continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) throw new Error("Ticker CSV is empty or has no data rows.");
  const headers = rows.shift().map((v) => norm(v).replace(/ /g, "_"));
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}
function getField(row, names) {
  for (const name of names) {
    const key = norm(name).replace(/ /g, "_");
    if (row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  return "";
}
function canonicalCountryCode(rawCode, rawCountry) {
  const code = normalizeCountryCode(rawCode, rawCountry);
  return code && COUNTRY_CODES.has(code) ? code : null;
}
function symbolVariants(value, countryCode) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return [];
  const values = new Set([raw]);
  for (const suffix of SUFFIXES_BY_COUNTRY[countryCode] ?? []) {
    if (raw.endsWith(suffix) && raw.length > suffix.length) values.add(raw.slice(0, -suffix.length));
  }
  return [...values].map((v) => v.replace(/^\$/, ""));
}
function exchangeAliases(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  const key = normCode(raw);
  const aliases = EXCHANGE_ALIASES[key] ?? EXCHANGE_ALIASES[raw] ?? [raw];
  return [...new Set([raw, ...aliases].filter(Boolean))];
}
function extractLogoItems(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.companies) ? payload.companies : [];
  if (!items.length) throw new Error("Company-logo index has no data array.");
  return items.flatMap((item) => {
    const listing = String(item.s ?? item.symbol ?? "");
    const colon = listing.indexOf(":");
    if (colon < 1) return [];
    const exchange = listing.slice(0, colon).trim();
    const symbol = listing.slice(colon + 1).trim();
    const slugs = Array.isArray(item.d) ? item.d : [item.slug].filter(Boolean);
    return [{ exchange, symbol, slugs: slugs.map((s) => String(s).trim()).filter((s) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(s)) }];
  }).filter((item) => item.slugs.length > 0);
}
function createLogoIndex(items) {
  const byKey = new Map(), bySymbol = new Map(), byNameToken = new Map();
  for (const item of items) {
    const key = normCode(item.exchange) + ":" + item.symbol.toUpperCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
    const symbol = item.symbol.toUpperCase();
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(item);
    for (const slug of item.slugs) {
      const tokens = new Set(norm(slug.replace(/[-_.]/g, " ")).split(" ").filter((token) => token.length > 2));
      const entry = { item, slug, tokens };
      for (const token of tokens) {
        if (!byNameToken.has(token)) byNameToken.set(token, []);
        byNameToken.get(token).push(entry);
      }
    }
  }
  return { byKey, bySymbol, byNameToken };
}
function findLogoSlugs(row, logoIndex) {
  const code = row.countryCode;
  const exchangeKeys = exchangeAliases(row.exchange).map(normCode);
  const symbols = symbolVariants(row.ticker, code);
  for (const symbol of symbols) {
    const exact = [];
    for (const exchange of exchangeKeys) {
      const matches = logoIndex.byKey.get(exchange + ":" + symbol.toUpperCase()) ?? [];
      exact.push(...matches);
    }
    const unique = [...new Map(exact.map((item) => [item.exchange + ":" + item.symbol + ":" + item.slugs[0], item])).values()];
    if (unique.length) return unique.flatMap((item) => item.slugs);
  }
  // Strict fallback for exchange-code differences: symbol must be unique within the target
  // country's markets and the issuer name must reasonably resemble the upstream logo slug.
  for (const symbol of symbols) {
    const possible = (logoIndex.bySymbol.get(symbol.toUpperCase()) ?? []).filter((item) => {
      const inferredCountry = PREFIX_COUNTRY[normCode(item.exchange)] ?? PREFIX_COUNTRY[item.exchange.toUpperCase()];
      if (inferredCountry !== code) return false;
      const nameTokens = new Set(norm(row.name).split(" ").filter((t) => t.length > 2 && !["inc", "corp", "corporation", "company", "limited", "ltd", "plc", "group", "holdings", "holding", "co"].includes(t)));
      const slugTokens = new Set(norm(item.slugs[0].replace(/-/g, " ")).split(" ").filter((t) => t.length > 2));
      if (!nameTokens.size || !slugTokens.size) return false;
      const overlap = [...nameTokens].filter((t) => slugTokens.has(t)).length;
      return overlap / Math.max(nameTokens.size, slugTokens.size) >= 0.5;
    });
    if (possible.length === 1) return possible[0].slugs;
  }
  // Last-resort company-name match allows a Russian issuer to reuse its own logo
  // when the logo index has that issuer under another exchange's ticker. Only a single
  // best-matching slug is accepted; ambiguous matches fail closed.
  const ignoredNameTokens = new Set(["inc", "corp", "corporation", "company", "limited", "ltd", "plc", "group", "holdings", "holding", "co", "llc", "ag", "sa", "nv", "bv", "gmbh", "se", "pjsc", "pao", "oao", "ojsc", "jsc", "public", "joint", "stock", "the"]);
  const nameTokens = new Set(norm(row.name).split(" ").filter((token) => token.length > 2 && !ignoredNameTokens.has(token)));
  const scoredSlugs = new Map();
  for (const token of nameTokens) {
    for (const entry of logoIndex.byNameToken.get(token) ?? []) {
      if (!nameTokens.size || !entry.tokens.size) continue;
      const overlap = [...nameTokens].filter((nameToken) => entry.tokens.has(nameToken)).length;
      const score = overlap / Math.max(nameTokens.size, entry.tokens.size);
      if (score >= 0.5) scoredSlugs.set(entry.slug, Math.max(scoredSlugs.get(entry.slug) ?? 0, score));
    }
  }
  if (scoredSlugs.size) {
    const bestScore = Math.max(...scoredSlugs.values());
    const bestSlugs = [...scoredSlugs].filter(([, score]) => score === bestScore).map(([slug]) => slug);
    if (bestScore >= 0.5 && bestSlugs.length === 1) return bestSlugs;
  }
  return [];
}
async function fetchText(url, label) {
  const response = await fetch(url, { headers: { "user-agent": "Arbitrade-Company-Catalogue/1.0 (+static build)", accept: "text/csv,application/json,text/plain,*/*" }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(label + " request failed: HTTP " + response.status + " (" + url + ")");
  return await response.text();
}
function cleanSvg(text) {
  let svg = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (svg.length === 0 || Buffer.byteLength(svg, "utf8") > MAX_LOGO_BYTES) return null;
  if (!/<svg\b/i.test(svg) || /<script\b|<foreignObject\b|javascript\s*:|<\!ENTITY|@import|on[a-z]+\s*=/i.test(svg)) return null;
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/ig, "").replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/<svg\b([^>]*)>/i, (match, attributes) => {
    let attrs = attributes;
    if (!/\bwidth\s*=/.test(attrs)) attrs += ' width="64"';
    if (!/\bheight\s*=/.test(attrs)) attrs += ' height="64"';
    if (!/\bxmlns\s*=/.test(attrs)) attrs += ' xmlns="http://www.w3.org/2000/svg"';
    return "<svg" + attrs + ">";
  });
  if (!/<\/svg\s*>/i.test(svg)) return null;
  // Reject linked image/font resources. A cached logo must be self-contained.
  if (/<image\b[^>]*(?:href|xlink:href)\s*=\s*["']https?:/i.test(svg) || /url\(\s*["']?https?:/i.test(svg)) return null;
  return svg;
}
async function downloadOfficialWebsiteLogo(candidate) {
  if (!candidate.profileUrl) return null;
  try {
    const profileResponse = await fetch(candidate.profileUrl, { headers: { "user-agent": "Arbitrade-Company-Catalogue/1.0", accept: "text/html,*/*" }, signal: AbortSignal.timeout(8000) });
    if (!profileResponse.ok) return null;
    const profile = (await profileResponse.text()).slice(0, 500000);
    const websiteLinks = [];
    const websiteBlock = profile.match(/Website[\s\S]{0,800}?href\s*=\s*["']([^"']+)["']/i);
    if (websiteBlock?.[1]) {
      let href = decodeHtmlEntities(websiteBlock[1]).trim();
      if (/^www\./i.test(href)) href = "https://" + href;
      try { if (/^https?:\/\//i.test(href) && !/dse\.com\.bd/i.test(new URL(href).hostname)) websiteLinks.push(href); } catch {}
    }
    const anchorRe = /<a\b([^>]*?)href\s*=\s*["'](https?:\/\/[^"'#\s]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorRe.exec(profile)) !== null) {
      const href = decodeHtmlEntities(match[2]).trim();
      const label = norm(htmlText(match[4]) + " " + (match[1] + " " + match[3]).replace(/<[^>]*>/g, " "));
      if (!/^https?:\/\//i.test(href) || /dse\.com\.bd|facebook\.com|linkedin\.com|youtube\.com|instagram\.com|twitter\.com|x\.com|mailto:/i.test(href)) continue;
      if (/website|web site|company site|homepage|official site|visit site/.test(label)) websiteLinks.push(href);
    }
    for (const websiteUrl of [...new Set(websiteLinks)]) {
      try {
        const pageResponse = await fetch(websiteUrl, { headers: { "user-agent": "Arbitrade-Company-Catalogue/1.0", accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
        if (!pageResponse.ok) continue;
        const page = (await pageResponse.text()).slice(0, 500000);
        const origin = new URL(pageResponse.url || websiteUrl).origin;
        const iconCandidates = [];
        const iconRe = /<link\b([^>]*?)>/gi;
        let link;
        while ((link = iconRe.exec(page)) !== null) {
          const attrs = link[1];
          const rel = (attrs.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
          const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
          if (!href || !/icon|shortcut/i.test(rel)) continue;
          try { iconCandidates.push(new URL(decodeHtmlEntities(href), origin).href); } catch {}
        }
        iconCandidates.push(new URL("/favicon.ico", origin).href);
        for (const iconUrl of [...new Set(iconCandidates)]) {
          try {
            const iconResponse = await fetch(iconUrl, { headers: { "user-agent": "Arbitrade-Company-Catalogue/1.0", accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,*/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
            if (!iconResponse.ok) continue;
            let mime = (iconResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            const bytes = Buffer.from(await iconResponse.arrayBuffer());
            if (!bytes.length || bytes.length > 32768) continue;
            if ((mime === "application/octet-stream" || !mime) && bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) mime = "image/x-icon";
            if (mime === "image/vnd.microsoft.icon") mime = "image/x-icon";
            if (!["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon"].includes(mime)) continue;
            if (mime === "image/svg+xml") {
              const svg = cleanSvg(bytes.toString("utf8"));
              if (!svg) continue;
              return { slug: "official-site-favicon", sourceUrl: iconResponse.url || iconUrl, sourceName: "Official company website favicon", svg, bytes: Buffer.byteLength(svg, "utf8") };
            }
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image href="data:' + mime + ';base64,' + bytes.toString("base64") + '" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>';
            const cleaned = cleanSvg(svg);
            if (cleaned) return { slug: "official-site-favicon", sourceUrl: iconResponse.url || iconUrl, sourceName: "Official company website favicon", svg: cleaned, bytes: Buffer.byteLength(cleaned, "utf8") };
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return null;
}
async function downloadLogo(slugs) {
  for (const slug of slugs) {
    const url = LOGO_API_ROOT + encodeURIComponent(slug) + ".svg";
    try {
      const response = await fetch(url, { headers: { "user-agent": "Arbitrade-Company-Catalogue/1.0", accept: "image/svg+xml,text/plain,*/*" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      const svg = cleanSvg(await response.text());
      if (svg) return { slug, sourceUrl: url, svg, bytes: Buffer.byteLength(svg, "utf8") };
    } catch {
      // A failed/missing logo is not replaced with a guessed logo; the next candidate is tried.
    }
  }
  return null;
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}
function slugify(value) {
  return norm(value).replace(/ /g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "company";
}
function sha(value, length = 8) { return createHash("sha1").update(String(value)).digest("hex").slice(0, length); }
function toCandidateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const name = getField(row, ["name", "company_name", "issuer_name", "company"]);
    const ticker = getField(row, ["ticker", "symbol", "trading_symbol"]);
    const exchange = getField(row, ["exchange", "exchange_code", "venue"]);
    const rawCountry = getField(row, ["country", "country_name"]);
    const rawCountryCode = getField(row, ["country_code", "countrycode", "country_iso2"]);
    const countryCode = canonicalCountryCode(rawCountryCode, rawCountry);
    const assetType = getField(row, ["asset_type", "instrument_type"]).toLowerCase();
    if (!name || !ticker || !exchange || !countryCode || !COUNTRY_CODES.has(countryCode) || assetType !== "stock") continue;
    const item = {
      name, ticker, symbol: ticker, exchange,
      countryCode, countryName: COUNTRY_CODES.get(countryCode).name === "USA" ? "United States" : COUNTRY_CODES.get(countryCode).name === "UK" ? "United Kingdom" : COUNTRY_CODES.get(countryCode).name,
      sector: getField(row, ["stock_sector", "sector", "industry"]) || null,
      sourceCountry: rawCountry || COUNTRY_CODES.get(countryCode).name,
      sourceCountryCode: rawCountryCode || countryCode,
    };
    const uniqueKey = countryCode + "|" + norm(name) + "|" + ticker.toUpperCase();
    if (!map.has(uniqueKey)) map.set(uniqueKey, item);
  }
  return [...map.values()];
}

async function loadMoexStockCandidates() {
  const baseUrl = "https://iss.moex.com/iss/engines/stock/markets/shares/securities.json?iss.meta=off&iss.only=securities,cursor&is_traded=1&securities.columns=SECID,SHORTNAME,SECNAME,LATNAME,ISIN,REGNUMBER,IS_TRADED&cursor.columns=INDEX,TOTAL,PAGESIZE";
  const safetyLimit = 20000;
  let pageSize = 100;
  let expectedTotal = null;
  let start = 0;
  const rows = [];

  while (start < safetyLimit) {
    const url = baseUrl + "&start=" + start;
    const payload = JSON.parse(await fetchText(url, "Official Moscow Exchange actively traded share listings"));
    const table = payload?.securities;
    if (!Array.isArray(table?.columns) || table.columns.length === 0 || !Array.isArray(table?.data)) {
      throw new Error("Moscow Exchange ISS returned an unexpected securities payload.");
    }

    const columns = table.columns.map((column) => String(column).toLowerCase());
    const rawData = Array.from(table.data);
    const page = rawData
      .filter((values) => values != null && typeof values === "object")
      .map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""])));
    if (page.length === 0) {
      throw new Error("Moscow Exchange ISS returned no usable security rows (columns=" + columns.join(",") + "; rawDataLength=" + rawData.length + "; firstEntryType=" + typeof rawData[0] + ").");
    }
    const cursor = payload?.cursor;
    if (Array.isArray(cursor?.columns) && Array.isArray(cursor?.data) && cursor.data.length) {
      const cursorColumns = cursor.columns.map((column) => String(column).toLowerCase());
      const cursorRow = Object.fromEntries(cursorColumns.map((column, index) => [column, cursor.data[0][index]]));
      const total = Number(cursorRow.total);
      const serverPageSize = Number(cursorRow.pagesize);
      if (Number.isFinite(total) && total >= 0) expectedTotal = total;
      if (Number.isFinite(serverPageSize) && serverPageSize > 0) pageSize = serverPageSize;
    }

    rows.push(...page);
    if (rawData.length < pageSize) break;
    if (expectedTotal !== null && rows.length >= expectedTotal) break;
    start += rawData.length;
    if (rows.length >= safetyLimit && (expectedTotal === null || rows.length < expectedTotal)) {
      console.warn("[company-logos] Moscow Exchange ISS reports " + expectedTotal + " rows; applying the " + safetyLimit + "-row safety cap and using the bounded sample.");
      break;
    }
  }

  
  const candidates = rows.flatMap((row) => {
    const ticker = getField(row, ["secid"]).toUpperCase();
    const name = getField(row, ["latname", "name", "secname", "shortname"]);
    const isTraded = getField(row, ["is_traded"]).toLowerCase();
    if (!name || !ticker || (isTraded && !["1", "true", "yes"].includes(isTraded))) return [];
    if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(ticker)) return [];
    return [{
      name,
      ticker,
      symbol: ticker,
      exchange: "MOEX",
      countryCode: "RU",
      countryName: "Russia",
      sector: null,
      sourceCountry: "Russia",
      sourceCountryCode: "RU",
    }];
  });
  if (candidates.length < 14) {
    throw new Error("Official Moscow Exchange ISS returned only " + candidates.length + " tradable equity candidates; 14 are required for Russia.");
  }
  return {
    candidates,
    source: {
      providerName: "Moscow Exchange Information and Statistical Server (ISS)",
      sourceUrl: baseUrl + "&start={offset}",
      retrievedAt: new Date().toISOString(),
      sourceVersion: "Actively traded shares response with explicit SECID/SECNAME columns and ISS cursor pagination, captured during catalogue build",
      rawRows: rows.length,
      reportedTotalRows: expectedTotal,
      tradableEquityCandidates: candidates.length,
      attribution: "Moscow Exchange ISS official security reference; https://www.moex.com/a2920",
    },
  };
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}
function htmlText(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
async function loadDseStockCandidates() {
  const sourceUrl = "https://www.dse.com.bd/companies?view=closed";
  const html = await fetchText(sourceUrl, "Official Dhaka Stock Exchange company list");
  const candidates = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=["'](?:https?:\/\/www\.dse\.com\.bd)?\/company\/([A-Za-z0-9._-]+)(?:[?#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    const ticker = decodeHtmlEntities(match[1]).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(ticker) || seen.has(ticker)) continue;
    // DSE's all-securities view includes mutual funds and government/debt instruments.
    if (/^(?:TB\d|BGTB|SUKUK)/i.test(ticker) || /(?:MF|BOND|SUKUK)$/i.test(ticker)) continue;
    let display = htmlText(match[2]);
    const firstSpace = display.search(/\s/);
    if (firstSpace > 0) {
      const firstToken = display.slice(0, firstSpace).trim().toUpperCase();
      if (firstToken === ticker || (firstToken.startsWith(ticker) && firstToken.length <= ticker.length + 1)) {
        display = display.slice(firstSpace + 1).trim();
      }
    }
    if (!display || norm(display) === norm(ticker)) continue;
    seen.add(ticker);
    candidates.push({
      name: display,
      profileUrl: "https://www.dse.com.bd/company/" + ticker,
      ticker,
      symbol: ticker,
      exchange: "DSE",
      countryCode: "BD",
      countryName: "Bangladesh",
      sector: null,
      sourceCountry: "Bangladesh",
      sourceCountryCode: "BD",
    });
  }
  if (candidates.length < 14) {
    throw new Error("Official Dhaka Stock Exchange page yielded only " + candidates.length + " distinct equity candidates after excluding funds/debt; 14 are required for Bangladesh.");
  }
  return {
    candidates,
    source: {
      providerName: "Dhaka Stock Exchange PLC",
      sourceUrl,
      retrievedAt: new Date().toISOString(),
      sourceVersion: "Listed-company screener HTML captured during catalogue build",
      rawRows: candidates.length,
      tradableEquityCandidates: candidates.length,
      attribution: "Dhaka Stock Exchange PLC, official listed-company screener: " + sourceUrl,
      limitations: "Company identity reference only; listing status and eligibility are not independently verified by this catalogue.",
    },
  };
}

function createNeutralLogo(candidate) {
  const words = String(candidate.name ?? "").trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "CO").slice(0, 2)).toUpperCase();
  const safeInitials = initials.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Neutral company reference placeholder"><rect width="64" height="64" rx="12" fill="#e8edf3"/><circle cx="32" cy="32" r="24" fill="#cbd5e1"/><text x="32" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#334155">' + safeInitials + '</text></svg>';
  return {
    slug: "neutral-placeholder",
    sourceUrl: "internal://neutral-company-reference-placeholder",
    sourceName: "Neutral company-reference placeholder",
    svg,
    bytes: Buffer.byteLength(svg, "utf8"),
  };
}

async function buildCountry(country, candidates, target, selectedIds, globalNames) {
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= target) break;
    const candidateId = country.code.toLowerCase() + "-" + slugify(candidate.name) + "-" + slugify(candidate.ticker) + "-" + sha(candidate.exchange + ":" + candidate.ticker);
    const nameKey = norm(candidate.name);
    if (selectedIds.has(candidateId) || attemptedCandidateIds.has(candidateId) || globalNames.has(nameKey)) continue;
    attemptedCandidateIds.add(candidateId);
    const id = candidateId;
    selectedIds.add(id);
    globalNames.add(nameKey);
    chosen.push({ ...candidate, id, logo: createNeutralLogo(candidate) });
  }
  if (chosen.length < target) {
    console.warn("[company-logos] " + country.name + " supplied " + chosen.length + "/" + target + " distinct source companies; remaining slots will be reassigned to other eligible countries.");
  }
  return chosen;
}
async function main() {
  console.log("[company-logos] Downloading pinned global stock reference CSV; logos use locally generated neutral placeholders.");
  const sourceMetaText = await fetchText(SOURCE_COMMIT_API, "Global ticker source commit metadata");
  const sourceCommit = String(JSON.parse(sourceMetaText).sha ?? "");
  if (!/^[a-f0-9]{40}$/i.test(sourceCommit)) {
    throw new Error("Could not pin the ticker dataset commit.");
  }
  const sourceCsvUrl = SOURCE_RAW_ROOT + "/" + sourceCommit + "/data/tickers.csv";
  const csv = await fetchText(sourceCsvUrl, "Pinned global ticker reference");
  const sourceRows = parseCsv(csv);
  console.log("[company-logos] Source rows: " + sourceRows.length);

  const stockCandidates = toCandidateRows(sourceRows);
  const supplementalSources = [];
  const sourceRussiaCount = stockCandidates.filter((item) => item.countryCode === "RU").length;
  if (sourceRussiaCount < 14) {
    console.log("[company-logos] Main ticker source has " + sourceRussiaCount + " Russia rows; supplementing from the official Moscow Exchange ISS.");
    const moex = await loadMoexStockCandidates();
    const knownListings = new Set(stockCandidates.map((item) => item.countryCode + "|" + item.exchange.toUpperCase() + "|" + item.ticker.toUpperCase()));
    let added = 0;
    for (const item of moex.candidates) {
      const key = item.countryCode + "|" + item.exchange.toUpperCase() + "|" + item.ticker.toUpperCase();
      if (knownListings.has(key)) continue;
      stockCandidates.push(item);
      knownListings.add(key);
      added++;
    }
    supplementalSources.push(moex.source);
    console.log("[company-logos] Added " + added + " Moscow Exchange candidates from " + moex.source.rawRows + " ISS rows.");
  }
  const sourceBangladeshCount = stockCandidates.filter((item) => item.countryCode === "BD").length;
  if (sourceBangladeshCount < 14) {
    console.log("[company-logos] Main ticker source has " + sourceBangladeshCount + " Bangladesh rows; supplementing from the official Dhaka Stock Exchange list.");
    const dse = await loadDseStockCandidates();
    const knownListings = new Set(stockCandidates.map((item) => item.countryCode + "|" + item.exchange.toUpperCase() + "|" + item.ticker.toUpperCase()));
    let added = 0;
    for (const item of dse.candidates) {
      const key = item.countryCode + "|" + item.exchange.toUpperCase() + "|" + item.ticker.toUpperCase();
      if (knownListings.has(key)) continue;
      stockCandidates.push(item);
      knownListings.add(key);
      added++;
    }
    supplementalSources.push(dse.source);
    console.log("[company-logos] Added " + added + " Dhaka Stock Exchange candidates.");
  }
  const selectedIds = new Set();
  const globalNames = new Set();
  const allSelected = [];
  const counts = {};
  for (const country of TARGETS) {
    const countryCandidates = stockCandidates
      .filter((item) => item.countryCode === country.code)
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)) || a.ticker.localeCompare(b.ticker));
    if (countryCandidates.length < country.target) {
      console.warn("[company-logos] " + country.name + " has only " + countryCandidates.length + " source candidates for its initial target of " + country.target + "; continuing with available candidates.");
    }
    const chosen = await buildCountry(country, countryCandidates, country.target, selectedIds, globalNames);
    allSelected.push(...chosen);
  }

  // Never let one country block the entire build. Reuse the remaining eligible listings
  // from other requested countries to fill any slots where a country has too few usable logos.
  let remaining = 1000 - allSelected.length;
  if (remaining > 0) {
    console.warn("[company-logos] Reallocating " + remaining + " unfilled slots across other countries with cacheable logos.");
    for (const country of TARGETS) {
      if (remaining <= 0) break;
      const countryCandidates = stockCandidates
        .filter((item) => item.countryCode === country.code)
        .sort((a, b) => norm(a.name).localeCompare(norm(b.name)) || a.ticker.localeCompare(b.ticker));
      if (!countryCandidates.length) continue;
      const extra = await buildCountry(country, countryCandidates, remaining, selectedIds, globalNames);
      if (extra.length) {
        allSelected.push(...extra);
        remaining -= extra.length;
        console.log("[company-logos] Reallocated " + extra.length + " additional records to " + country.name + "; " + remaining + " slots remain.");
      }
    }
  }

  for (const item of allSelected) {
    const countKey = item.countryName;
    counts[countKey] = (counts[countKey] ?? 0) + 1;
  }
  const poolACount = allSelected.filter((item) => TARGETS.find((x) => x.code === item.countryCode)?.pool === "A").length;
  const poolBCount = allSelected.length - poolACount;
  if (allSelected.length !== 1000) {
    throw new Error("Could only build " + allSelected.length + "/1000 records with real matched local logos after trying all requested countries. No partial catalogue will be written.");
  }

  await rm(OUTPUT_LOGO_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_LOGO_DIR, { recursive: true });
  const companies = [];
  for (const item of allSelected) {
    const fileName = item.id + ".svg";
    await writeFile(join(OUTPUT_LOGO_DIR, fileName), item.logo.svg, "utf8");
    companies.push({
      id: item.id,
      name: item.name,
      ticker: item.ticker,
      symbol: item.symbol,
      exchangeCode: item.exchange,
      countryCode: item.countryCode,
      countryName: item.countryName,
      headquartersCountry: null,
      sector: item.sector,
      instrumentType: "Stock",
      recordCompleteness: "incomplete",
      incompleteReasons: ["listing_status_unverified", "headquarters_country_unverified", "official_brand_logo_not_cleared"],
      listingStatus: "unverified",
      lastVerifiedAt: null,
      requiresManualVerification: true,
      sourceConfidence: "secondary_global_reference_unverified",
      sourceRecordId: item.exchange + ":" + item.ticker,
      sourceObservedAt: null,
      logoUrl: "/assets/company-logos/" + fileName,
      logoSourceName: item.logo.sourceName ?? "Tradient Companies Logo API",
      logoSourceUrl: item.logo.sourceUrl,
      logoSourceSlug: item.logo.slug,
      logoBytes: item.logo.bytes,
      logoSha256: createHash("sha256").update(item.logo.svg, "utf8").digest("hex"),
    });
  }
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetCount: 1000,
    companyCount: companies.length,
    targetDistribution: {
      poolA: { total: poolACount, countries: POOL_A.map(([name, code]) => ({ name, countryCode: code, count: counts[name] ?? 0 })) },
      poolB: { total: poolBCount, countries: POOL_B.map(([name, code]) => { const canonicalName = name === "USA" ? "United States" : name === "UK" ? "United Kingdom" : name; return { name: canonicalName, countryCode: code, count: counts[canonicalName] ?? 0 }; }) },
      countsByCountry: counts,
    },
    source: {
      providerName: "Adanos Free Global Ticker Database",
      sourceFileUrl: sourceCsvUrl,
      sourceRepository: "https://github.com/adanos-software/free-ticker-database",
      sourceReference: sourceCommit,
      sourceCommit,
      sourceFields: ["ticker", "name", "exchange", "asset_type", "stock_sector", "country", "country_code"],
      redistributionNote: "The reference repository is MIT-licensed as software, but the rights for underlying data may depend on source rows. This file is an unverified display/reference catalogue, not a security master or trading authorization.",
      attribution: "Global ticker reference: Adanos Software GmbH, free-ticker-database; source file URL recorded above.",
      supplementalSources,
    },
    logoSource: {
      providerName: "Locally generated neutral company-reference placeholders",
      assetFormat: "SVG",
      cachePolicy: "Small initials-based placeholders are generated locally from each source company name; no third-party logo service or external image request is used.",
      attribution: "These are neutral reference placeholders, not company brand logos. They are generated from the source name for display only.",
      reusePermissionVerified: true,
    },
    dataLimitations: [
      "The source is a secondary stock reference; all records are marked unverified and must not be treated as confirmed currently active or eligible for trading.",
      "The source country field is preserved as the catalogue country. Headquarters country is null because it was not independently verified for every selected issuer.",
      "Images are locally generated initials-based neutral placeholders, not company logos. They avoid unconfirmed third-party logo redistribution rights and external image-service dependencies.",
      "The country allocation is a balanced UI/reference sample: Pool A totals 550 (13 or 14 per country) and Pool B totals 450 (75 per country).",
      "This catalogue is for company reference/display only, not evidence of actual customer trades, execution, account activity, or performance.",
    ],
    companies,
  };
  await mkdir(dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("[company-logos] Wrote " + companies.length + " company records and local SVG logos.");
  console.log("[company-logos] Pool A=" + poolACount + ", Pool B=" + poolBCount + ", total assets=" + (await readdir(OUTPUT_LOGO_DIR)).length);
  console.log("[company-logos] Country counts: " + JSON.stringify(counts));
}
main().catch((error) => {
  console.error("[company-logos] FAILED: " + (error instanceof Error ? error.stack || error.message : String(error)));
  process.exitCode = 1;
});
