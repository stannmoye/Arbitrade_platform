#!/usr/bin/env node
/**
 * Build a static 1,000-company reference catalogue and cache small company logos.
 * Logo downloads happen only during this build. App runtime reads the local assets.
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

const POOL_A = [
  ["Japan", "JP"], ["India", "IN"], ["France", "FR"], ["Italy", "IT"], ["Brazil", "BR"],
  ["Russia", "RU"], ["Mexico", "MX"], ["South Korea", "KR"], ["Spain", "ES"], ["Indonesia", "ID"],
  ["Turkey", "TR"], ["Netherlands", "NL"], ["Saudi Arabia", "SA"], ["Switzerland", "CH"], ["Poland", "PL"],
  ["Taiwan", "TW"], ["Belgium", "BE"], ["Sweden", "SE"], ["Argentina", "AR"], ["Ireland", "IE"],
  ["Thailand", "TH"], ["United Arab Emirates", "AE"], ["Israel", "IL"], ["Austria", "AT"], ["Norway", "NO"],
  ["Singapore", "SG"], ["Vietnam", "VN"], ["Bangladesh", "BD"], ["Egypt", "EG"], ["Philippines", "PH"],
  ["Malaysia", "MY"], ["Denmark", "DK"], ["South Africa", "ZA"], ["Finland", "FI"], ["Chile", "CL"],
  ["Romania", "RO"], ["Czechia", "CZ"], ["Portugal", "PT"], ["Kazakhstan", "KZ"], ["Peru", "PE"],
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
  BVB: ["BVB"], LIS: ["LIS", "XLIS"], KASE: ["KASE"], BVL: ["BVL", "LIM"],
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
  LIS: "PT", XLIS: "PT", KASE: "KZ", BVL: "PE", LIM: "PE",
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
  KZ: [".KZ"], PE: [".LM"],
};

function norm(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normCode(value) { return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeCountryCode(rawCode, rawCountry) {
  const raw = String(rawCode ?? "").trim().toUpperCase();
  const aliases = { USA: "US", UK: "GB", GBR: "GB", KOR: "KR", KOR_SOUTH: "KR", UAE: "AE", VNM: "VN", CZE: "CZ", RUS: "RU", TWN: "TW", CHN: "CN", AUS: "AU", CAN: "CA", DEU: "DE", JPN: "JP", IND: "IN", FRA: "FR", ITA: "IT", BRA: "BR", MEX: "MX", ESP: "ES", IDN: "ID", TUR: "TR", NLD: "NL", SAU: "SA", CHE: "CH", POL: "PL", BEL: "BE", SWE: "SE", ARG: "AR", IRL: "IE", THA: "TH", ISR: "IL", AUT: "AT", NOR: "NO", SGP: "SG", BGD: "BD", EGY: "EG", PHL: "PH", MYS: "MY", DNK: "DK", ZAF: "ZA", FIN: "FI", CHL: "CL", ROU: "RO", PRT: "PT", KAZ: "KZ", PER: "PE" };
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

async function buildCountry(country, candidates, target, logoIndex, selectedIds, globalNames) {
  const ready = [];
  for (const candidate of candidates) {
    const slugs = findLogoSlugs(candidate, logoIndex);
    if (slugs.length) ready.push({ ...candidate, slugs });
  }
  let offset = 0;
  const chosen = [];
  const batchSize = Math.max(target + 12, Math.ceil(target * 1.5), 20);
  while (chosen.length < target && offset < ready.length) {
    const batch = ready.slice(offset, offset + batchSize);
    offset += batch.length;
    const downloaded = await mapLimit(batch, CONCURRENCY, async (candidate) => {
      const logo = await downloadLogo(candidate.slugs);
      return logo ? { ...candidate, logo } : null;
    });
    for (const item of downloaded) {
      if (!item || chosen.length >= target) continue;
      const nameKey = country.code + "|" + norm(item.name);
      if (globalNames.has(nameKey)) continue;
      const id = country.code.toLowerCase() + "-" + slugify(item.name) + "-" + slugify(item.ticker) + "-" + sha(item.exchange + ":" + item.ticker);
      if (selectedIds.has(id)) continue;
      selectedIds.add(id);
      globalNames.add(nameKey);
      chosen.push({ ...item, id });
    }
    console.log("[company-logos] " + country.name + ": " + chosen.length + "/" + target + " logos cached (" + offset + "/" + ready.length + " candidates checked)");
  }
  if (chosen.length !== target) {
    throw new Error("Cannot satisfy " + country.name + " target: wanted " + target + ", found " + chosen.length + " cacheable logos after checking " + ready.length + " logo-mapped candidates. No output catalogue was written.");
  }
  return chosen;
}
async function main() {
  console.log("[company-logos] Downloading global stock reference CSV and logo index...");
  const [sourceMetaText, logoMetaText] = await Promise.all([
    fetchText(SOURCE_COMMIT_API, "Global ticker source commit metadata"),
    fetchText(LOGO_COMMIT_API, "Logo-index source commit metadata"),
  ]);
  const sourceCommit = String(JSON.parse(sourceMetaText).sha ?? "");
  const logoCommit = String(JSON.parse(logoMetaText).sha ?? "");
  if (!/^[a-f0-9]{40}$/i.test(sourceCommit) || !/^[a-f0-9]{40}$/i.test(logoCommit)) {
    throw new Error("Could not pin the ticker dataset and logo-index commits.");
  }
  const sourceCsvUrl = SOURCE_RAW_ROOT + "/" + sourceCommit + "/data/tickers.csv";
  const logoIndexUrl = LOGO_RAW_ROOT + "/" + logoCommit + "/companies.json";
  const [csv, logoIndexText] = await Promise.all([
    fetchText(sourceCsvUrl, "Pinned global ticker reference"),
    fetchText(logoIndexUrl, "Pinned logo index"),
  ]);
  const sourceRows = parseCsv(csv);
  const logoPayload = JSON.parse(logoIndexText);
  const logoItems = extractLogoItems(logoPayload);
  const logoIndex = createLogoIndex(logoItems);
  console.log("[company-logos] Source rows: " + sourceRows.length + "; logo index entries: " + logoItems.length);

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
  const selectedIds = new Set();
  const globalNames = new Set();
  const allSelected = [];
  const counts = {};
  for (const country of TARGETS) {
    const countryCandidates = stockCandidates
      .filter((item) => item.countryCode === country.code)
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)) || a.ticker.localeCompare(b.ticker));
    if (countryCandidates.length < country.target) {
      throw new Error("Source has only " + countryCandidates.length + " stock candidates for " + country.name + "; needs " + country.target + ".");
    }
    const chosen = await buildCountry(country, countryCandidates, country.target, logoIndex, selectedIds, globalNames);
    allSelected.push(...chosen);
    const countKey = country.name === "USA" ? "United States" : country.name === "UK" ? "United Kingdom" : country.name;
    counts[countKey] = chosen.length;
  }
  const poolACount = allSelected.filter((item) => TARGETS.find((x) => x.code === item.countryCode)?.pool === "A").length;
  const poolBCount = allSelected.length - poolACount;
  if (allSelected.length !== 1000 || poolACount !== 550 || poolBCount !== 450 || Object.keys(counts).length !== 46) {
    throw new Error("Final country allocation is invalid: total=" + allSelected.length + ", poolA=" + poolACount + ", poolB=" + poolBCount + ", countries=" + Object.keys(counts).length);
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
      listingStatus: "unverified",
      lastVerifiedAt: null,
      requiresManualVerification: true,
      sourceConfidence: "secondary_global_reference_unverified",
      sourceRecordId: item.exchange + ":" + item.ticker,
      sourceObservedAt: null,
      logoUrl: "/assets/company-logos/" + fileName,
      logoSourceName: "Tradient Companies Logo API",
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
      poolA: { total: poolACount, countries: POOL_A.map(([name, code]) => ({ name, countryCode: code, count: counts[name] })) },
      poolB: { total: poolBCount, countries: POOL_B.map(([name, code]) => { const canonicalName = name === "USA" ? "United States" : name === "UK" ? "United Kingdom" : name; return { name: canonicalName, countryCode: code, count: counts[canonicalName] }; }) },
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
      providerName: "Tradient Companies Logo API",
      indexUrl: logoIndexUrl,
      repositoryCommit: logoCommit,
      endpointPattern: LOGO_API_ROOT + "{slug}.svg",
      assetFormat: "SVG",
      cachePolicy: "All selected files are copied into client/public/assets/company-logos; production app uses local paths and performs no logo API calls.",
      attribution: "Logo lookup index and delivery endpoint: Tradient Companies Logo API (https://github.com/tradient0/companies-logo). Logos remain the trademarks/copyright of their respective owners; verify redistribution rights for production use.",
    },
    dataLimitations: [
      "The source is a secondary stock reference; all records are marked unverified and must not be treated as confirmed currently active or eligible for trading.",
      "The source country field is preserved as the catalogue country. Headquarters country is null because it was not independently verified for every selected issuer.",
      "Logo images are retrieved by exchange/ticker mapping from a third-party logo index. They are stored locally to remove runtime image-service dependencies; logo copyright and trademark rights remain with the respective owners.",
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
