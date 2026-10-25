# Company Catalogue: Source, Verification and Local-Logo Guide

**Status:** Target specification for the revised 1,000-record catalogue. This document does not claim that the current 950-record US-only catalogue already meets the target.

## 1. Exact target and country pools

The catalogue must contain exactly **1,000 distinct publicly listed operating companies**:

- **Pool A — 550 companies:** Japan, India, France, Italy, Brazil, Russia, Mexico, South Korea, Spain, Indonesia, Turkey, Netherlands, Saudi Arabia, Switzerland, Poland, Taiwan, Belgium, Sweden, Argentina, Ireland, Thailand, United Arab Emirates, Israel, Austria, Norway, Singapore, Vietnam, Bangladesh, Egypt, Philippines, Malaysia, Denmark, South Africa, Finland, Chile, Romania, Czechia, Portugal, Hong Kong and Peru.
- **Pool B — 450 companies:** USA, UK, Germany, Australia, Canada and China.

Every country in each pool must be represented. The country count for each country is determined by the verified source records and written to a generated summary; do not invent target counts for individual countries or misstate the final counts. Pool A must total 550 and Pool B must total 450, and the combined catalogue must total 1,000.

Count the issuer once, not once per ticker or exchange. Where an issuer has multiple share classes or cross-listings, choose a primary listing and retain the identifiers needed to disambiguate it. A country's allocation means the issuer's verified headquarters/home country, **not** merely the country in which its shares trade.

## 2. Field-by-field sources

Use the strongest available source for each field and store a source URL and retrieval/verification timestamp. One source rarely supports every field.

| Field | Preferred evidence |
|---|---|
| Legal name, listing status, ticker/symbol, exchange, primary listing | The official stock exchange's issuer/listing directory and, when available, official downloadable listing files |
| Legal entity identifier | Official exchange issuer ID; regulator filing ID; LEI from the Global Legal Entity Identifier Foundation (GLEIF) where available |
| US CIK and US ticker association | SEC EDGAR company submissions/company-ticker files and the issuer's SEC filings |
| ISIN | Exchange listing data or official issuer/regulatory documents |
| Headquarters city and home country | Latest annual report, issuer's official corporate website, or a regulator/official corporate registry; don't infer headquarters from exchange |
| Official website | Issuer's own filing or official corporate website, cross-checked against the exchange/regulator entry |
| Sector/industry | Exchange/regulator classification or issuer annual report; record the classification system/version |
| Listing/instrument type | Exchange listing record plus issuer/regulatory filing; do not use name-pattern guesses as proof |
| Official logo/image | Issuer's official newsroom/brand-media kit with reuse terms, or an image repository entry with an explicit compatible licence and required attribution |
| Country code and flag | ISO 3166-1 country code; flags are interface assets, not proof of headquarters or nationality |
| Verification metadata | Source page/file, retrieved-at time, last-verified time, source version/hash and verifier/process version |

### Official market-source starting points

Use the official exchange/market operator or local securities regulator as the authoritative starting point. The exact listing directory or downloadable file may change; record the actual page/file URL used at build time and confirm its terms before automating downloads.

| Country / pool | Primary listing-source starting point |
|---|---|
| Japan | [Japan Exchange Group (JPX)](https://www.jpx.co.jp/english/) and [EDINET](https://disclosure2.edinet-fsa.go.jp/) |
| India | [National Stock Exchange of India](https://www.nseindia.com/) and [BSE India](https://www.bseindia.com/) |
| France | [Euronext](https://live.euronext.com/) |
| Italy | [Borsa Italiana / Euronext Milan](https://www.borsaitaliana.it/) |
| Brazil | [B3](https://www.b3.com.br/en_us/) |
| Russia | [Moscow Exchange](https://www.moex.com/) and the relevant official issuer filings |
| Mexico | [Bolsa Mexicana de Valores (BMV)](https://www.bmv.com.mx/) |
| South Korea | [Korea Exchange (KRX)](https://global.krx.co.kr/) |
| Spain | [BME](https://www.bolsasymercados.es/) |
| Indonesia | [Indonesia Stock Exchange (IDX)](https://www.idx.co.id/) |
| Turkey | [Borsa Istanbul](https://www.borsaistanbul.com/) |
| Netherlands | [Euronext](https://live.euronext.com/) |
| Saudi Arabia | [Saudi Exchange (Tadawul)](https://www.saudiexchange.sa/) |
| Switzerland | [SIX Swiss Exchange](https://www.six-group.com/) |
| Poland | [Warsaw Stock Exchange (GPW)](https://www.gpw.pl/) |
| Taiwan | [Taiwan Stock Exchange (TWSE)](https://www.twse.com.tw/en/) and [TPEx](https://www.tpex.org.tw/) |
| Belgium | [Euronext](https://live.euronext.com/) |
| Sweden | [Nasdaq Nordic](https://www.nasdaqomxnordic.com/) |
| Argentina | [BYMA](https://www.byma.com.ar/) |
| Ireland | [Euronext Dublin](https://live.euronext.com/) |
| Thailand | [Stock Exchange of Thailand (SET)](https://www.set.or.th/en/) |
| United Arab Emirates | [Abu Dhabi Securities Exchange (ADX)](https://www.adx.ae/) and [Dubai Financial Market (DFM)](https://www.dfm.ae/) |
| Israel | [Tel Aviv Stock Exchange (TASE)](https://www.tase.co.il/en/) |
| Austria | [Vienna Stock Exchange](https://www.wienerborse.at/en/) |
| Norway | [Euronext Oslo](https://live.euronext.com/) |
| Singapore | [Singapore Exchange (SGX)](https://www.sgx.com/) |
| Vietnam | [Ho Chi Minh Stock Exchange (HOSE)](https://www.hsx.vn/) and [Hanoi Stock Exchange (HNX)](https://www.hnx.vn/) |
| Bangladesh | [Dhaka Stock Exchange (DSE)](https://www.dsebd.org/) and [Chittagong Stock Exchange (CSE)](https://www.cse.com.bd/) |
| Egypt | [Egyptian Exchange (EGX)](https://www.egx.com.eg/) |
| Philippines | [Philippine Stock Exchange (PSE)](https://www.pse.com.ph/) |
| Malaysia | [Bursa Malaysia](https://www.bursamalaysia.com/) |
| Denmark | [Nasdaq Nordic](https://www.nasdaqomxnordic.com/) |
| South Africa | [Johannesburg Stock Exchange (JSE)](https://www.jse.co.za/) |
| Finland | [Nasdaq Nordic](https://www.nasdaqomxnordic.com/) |
| Chile | [Santiago Stock Exchange](https://www.bolsadesantiago.com/) |
| Romania | [Bucharest Stock Exchange (BVB)](https://www.bvb.ro/) |
| Czechia | [Prague Stock Exchange](https://www.pse.cz/en) |
| Portugal | [Euronext Lisbon](https://live.euronext.com/) |
| Hong Kong | [Hong Kong Exchanges and Clearing (HKEX)](https://www.hkex.com.hk/Listing/Listed-Companies) |
| Peru | [Lima Stock Exchange (BVL)](https://www.bvl.com.pe/) |
| USA | [SEC EDGAR](https://www.sec.gov/edgar/search/) and the relevant primary exchange (NYSE/Nasdaq) |
| UK | [London Stock Exchange](https://www.londonstockexchange.com/) and [FCA](https://www.fca.org.uk/markets/primary-markets) |
| Germany | [Deutsche Börse](https://www.deutsche-boerse.com/) and [Frankfurt Stock Exchange](https://www.boerse-frankfurt.de/) |
| Australia | [Australian Securities Exchange (ASX)](https://www.asx.com.au/) |
| Canada | [TMX / Toronto Stock Exchange](https://www.tsx.com/) and [TSX Venture Exchange](https://www.tsx.com/listings/listing-with-us) |
| China | [Shanghai Stock Exchange (SSE)](https://english.sse.com.cn/) and [Shenzhen Stock Exchange (SZSE)](https://www.szse.cn/English/) |

Cross-check legal name, headquarters and operating status against the issuer's latest annual report/official website and regulator filing when exchange records alone do not establish those facts. Market availability, listing scopes and provider usage terms can change; record the actual source and access date in the dataset.

## 3. Logo/image rules: store the asset in GitHub

Every record must point to an image file checked into the repository. Do not depend on a third-party image CDN or search the web at runtime.

1. Prefer an official company newsroom, press kit or brand-assets page that explicitly permits the planned reuse. Otherwise use a repository entry whose licence explicitly permits the intended use.
2. A logo being visible on the web does **not** make it public domain or automatically permit redistribution. Record the logo source URL, licence/permission basis, attribution text, retrieval date and original filename/hash. If reuse permission cannot be established, do not bundle that image; keep the record incomplete and report it as a blocker rather than inventing a logo or using a random search result.
3. Save approved, sanitized and optimized files under `client/public/assets/company-logos/`, using a stable company ID rather than a ticker as the filename, for example `client/public/assets/company-logos/cik-0000320193.svg` or `company-<stable-id>.webp`. The precise ID format must be deterministic and collision-safe.
4. Store a repository-relative path such as `/assets/company-logos/<stable-id>.webp` in the catalogue. Images must render from the application's own static assets; no runtime network call, database blob or hotlink should be required.
5. Prefer sanitized SVG or optimized WebP/PNG. Reject active content, scripts, external references and malformed files in SVG. Keep each asset small enough for efficient page rendering and lazy-load logos in lists.
6. Include the logo's licence and attribution in a machine-readable asset manifest, and retain any licence-required notices in the repository.
7. If a company has no permitted official image, it is **not** counted as image-complete. Do not silently substitute a country flag, a different company, or a generated mark and label it as that company's official logo.

## 4. Suggested record contract

The static JSON should support at least these fields (use `null` for unknown data; never invent values):

```json
{
  "id": "stable-internal-id",
  "legalName": "Issuer legal name",
  "displayName": "Issuer display name",
  "ticker": "EXAMPLE",
  "exchange": "Primary exchange name",
  "exchangeMic": "ISO-10383-MIC-or-null",
  "instrumentType": "ordinary-share",
  "listingStatus": "active",
  "countryCode": "JP",
  "headquarters": {
    "city": "Verified city or null",
    "countryCode": "JP"
  },
  "officialWebsite": "https://issuer.example/",
  "sector": null,
  "industry": null,
  "isin": null,
  "lei": null,
  "cik": null,
  "logoPath": "/assets/company-logos/stable-internal-id.webp",
  "sources": {
    "listingRecordUrl": "https://official-exchange.example/...",
    "companyInformationUrl": "https://issuer.example/investors/...",
    "logoSourceUrl": "https://issuer.example/media/...",
    "logoLicense": "documented terms or permission reference",
    "logoAttribution": "required attribution or empty string when none",
    "sourceProvider": "official exchange / regulator / issuer",
    "retrievedAt": "ISO-8601 timestamp",
    "lastVerifiedAt": "ISO-8601 timestamp"
  }
}
```

This is a reference-data schema, not proof that a trade was executed, a customer owns a security, or a profit was earned.

## 5. Legal/licensing and data-source cautions

- Use exchange/regulator files only within their stated terms; permission to view data does not necessarily permit bulk redistribution or commercial reuse.
- SEC EDGAR's company-ticker file is useful for US CIK/name/ticker/exchange associations. It does **not** provide dependable headquarters, sector, official logo, complete security type or proof of current tradability by itself.
- Do not rely on Yahoo Finance data for a redistributed static dataset; its help page states that users must not redistribute information provided by Yahoo Finance: [Yahoo Finance data-provider notice](https://help.yahoo.com/kb/SLN2352.html).
- Third-party logo APIs or CDNs are not an automatic licence to download, rehost or commit every returned logo. Verify terms for caching, redistribution and commercial use before adding any asset.
- Keep source-specific attribution next to the dataset and keep all licence notices. Never copy another project's code or dataset solely because it is publicly available.
- Listing status and symbols can change. Maintain a repeatable review/update process and preserve historical trade/record identifiers rather than silently replacing historical identity data.

## 6. Acceptance gates

The catalogue is not complete until all gates pass:

- Exactly 1,000 distinct issuer records.
- Exactly 550 Pool A records from the specified 40 countries (Hong Kong replaces Kazakhstan, whose source coverage was insufficient) and exactly 450 Pool B records from the specified six countries.
- Every one of the 46 specified countries has at least one verified record.
- Every issuer has a non-empty legal/display name, ticker or approved exchange symbol, primary exchange, verified country, official source URL and verification timestamp.
- Every record has a resolvable local logo path; every logo has recorded source and permitted-reuse evidence.
- No duplicate issuer identities, reused stable IDs, dangling logo paths, missing files, invented fields or unresolved company/image substitutions.
- Generated country counts and group totals reconcile exactly to 550 + 450 = 1,000.
- Catalogue loading and lookup remain file-backed/in-memory and do not read/write the database or call external providers at runtime.
- The test report states the dataset revision/hash and exact file totals that were checked.

**Important current-state note:** the pre-existing branch catalogue has 950 US issuer/ticker records from a July 2026 SEC snapshot, with the entries marked unverified and logo fields absent. It does not satisfy this revised specification. Do not change metadata counters to 1,000 or declare acceptance until the 1,000 sourced records and permitted local image assets actually exist and validation passes.
