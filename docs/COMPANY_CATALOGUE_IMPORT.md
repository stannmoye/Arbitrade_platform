# Static company reference catalogue

Arbitrade keeps a 950-record company reference subset in the version-controlled file `server/data/company-catalogue.json`. The server imports this JSON with the application bundle and builds in-memory indexes once at module initialization. Catalogue lookups and searches do not query the database and do not call external providers at runtime.

## Data source and permitted use

The subset is derived from the SEC EDGAR `company_tickers_exchange.json` file, which provides CIK, issuer name, ticker, and exchange. The immutable retrieval snapshot and Git blob ID are recorded in the JSON. The pinned source manifest records the official SEC payload SHA-256 and a last-modified timestamp of **July 24, 2026**. The source-specific licensing registry snapshot marks the SEC feed as `verified_open` with raw/derived redistribution and commercial use allowed, while requiring attribution. See `server/data/COMPANY_CATALOGUE_ATTRIBUTION.md`.

The deterministic selection removes duplicate CIK/name records, excludes blank and OTC exchange values and obvious ETF/ETN/ETP/fund/trust name labels, then selects 950 rows round-robin across Nasdaq and NYSE. Each item retains a stable SEC CIK. `countryCode` identifies the U.S. listing market, not issuer headquarters. Sector, headquarters, instrument type, and logos are null because the source does not provide reliable values for them.

## Build and validation

```sh
pnpm companies:build:950
pnpm companies:verify:950
pnpm test -- server/modules/company-catalogue.test.ts server/modules/company-rotation.test.ts
pnpm check
pnpm build
```

The maintenance-time builder downloads an immutable snapshot and checks its Git blob ID and schema before rewriting JSON. It does not require `DATABASE_URL` or connect to a database. Normal application startup does not fetch the source. The validator runs offline.

## Verification and live-trading boundary

All 950 records initially remain `listingStatus: "unverified"`, `requiresManualVerification: true`, and `lastVerifiedAt: null`. The upstream snapshot is several months old and the SEC file does not guarantee accuracy or scope, so the data is not evidence of a current listing or tradability. The rotation selector only accepts independently verified active listings and fails closed while none qualify.

The SEC file contains filers and ticker associations; name-pattern filtering cannot prove every selected entity is an operating company. Manually review records before company-only use. This catalogue is not yet connected to live opportunity/popup delivery, and no operational opportunity is automatically mapped by ticker or name.

## Database boundary

The catalogue itself is not bulk-seeded into the database. The existing `companies` table stays in place because existing opportunities reference integer company IDs. Those operational rows are not populated or remapped from this static file; any future integration must verify the actual underlying instrument identity first.
