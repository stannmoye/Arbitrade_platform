# Static company reference catalogue

Arbitrade keeps company reference data in version-controlled JSON and serves it from an in-memory service. It is not bulk-seeded into MySQL/MariaDB and is not used as evidence of actual trades, account ownership, or realized profit.

## Current implementation status (2026-10-25)

The new `server/data/company-catalogue-1000.json` contains exactly **1,000 reference candidates** across the 46 configured country/market classifications: **550 Pool A records** (40 countries with 13 or 14 each) and **450 Pool B records** (75 each for the USA, UK, Germany, Australia, Canada and China). The generated distribution metadata, catalogue validator and local asset paths agree with this allocation.

The separate `server/data/company-catalogue.json` legacy catalogue remains at **950 US-only SEC-derived records**. Its existing lookup service and tests are preserved. The multinational reference catalogue is an additional file-backed dataset, not a replacement of that legacy catalogue.

### Important verification limits

The 1,000-record count is a **structural reference-catalogue count**, not a claim that 1,000 listings have been independently verified. All current entries are explicitly marked `listingStatus: "unverified"`, `lastVerifiedAt: null`, `requiresManualVerification: true`, and `recordCompleteness: "incomplete"`. Their country field is the source's market/country classification, not verified headquarters or domicile. The pinned secondary global ticker dataset and official-market supplements provide candidate identities, but they do not establish the current active-listing status, legal domicile, headquarters, or every field for each individual company.

The 1,000 files under `client/public/assets/company-logos/` are locally generated neutral initials-based SVG placeholders (380–386 bytes each in the checked-in set). They are **not official company logos**. The reuse flag applies to the generated neutral placeholders, not to company brand assets. No official logo should be added unless its source and permission for the intended redistribution are documented.

Do not describe this catalogue as a verified security master or as satisfying the source guide's full acceptance gates until per-company official listing/issuer evidence, verification timestamps, and permitted logo assets have been established. Keep a record incomplete when that evidence is missing; never infer or fabricate it to reach a target count.

## Architecture and integration

- Keep both reference datasets as static JSON files; do not bulk-seed reference rows into MySQL/MariaDB.
- Load and index records in memory. Normal catalogue lookup must not require a database query or remote provider request.
- Keep images at local paths in `client/public/assets/company-logos/`; the current generated placeholders avoid runtime image-CDN dependencies.
- Use stable record IDs and exchange/symbol pairs for identity. Do not infer a primary listing or resolve ambiguity solely by ticker.
- Validate record counts, country allocations, global normalized-name uniqueness, IDs, exchange/symbol uniqueness, safe SVG structure, file hashes, and missing/orphan assets with `scripts/validate-company-catalogue-1000.mjs`.
- The package test command runs both the legacy 950-record validator and the 1,000-record structural validator before Vitest.
- The Trading Opportunities page displays the 1,000-record dataset in a separate **Company Reference Spotlight**. It refreshes every 15 seconds, avoids repeating the immediately previous record when alternatives exist, and is explicitly informational. It must not create or alter trades, balances, rewards, settlements, customer activity, or performance records.

## Sources and attribution

The 1,000-candidate dataset records the pinned source repository/commit and the supplemental Moscow Exchange ISS and Dhaka Stock Exchange source URLs in `server/data/company-catalogue-1000.json`. These source references and the explicit unverified status should remain visible; a secondary ticker feed is not a substitute for source-level verification.

The legacy 950-record prototype uses the SEC's `company_tickers_exchange.json` for CIK/name/ticker/exchange association. Its immutable snapshot, payload hash and attribution are recorded in `server/data/company-catalogue.json` and `server/data/COMPANY_CATALOGUE_ATTRIBUTION.md`. The SEC ticker file does not itself establish headquarters, sector, logo rights, full instrument type, or current tradability.

See [Company Catalogue Source Guide](COMPANY_CATALOGUE_SOURCE_GUIDE.md) for the per-field source hierarchy, official exchange starting points, licensing requirements, schema, and remaining acceptance gates.

## Financial integrity boundary

Company-reference rows are display metadata only. They are not executed trades, customer holdings, or settlement records. Financial statements and balances must continue to come from actual trade lifecycle and committed internal-ledger records.