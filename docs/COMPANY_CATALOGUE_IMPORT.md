# Static company reference catalogue

Arbitrade's target is now a **1,000-company static reference catalogue** with 550 companies from the specified 40-country Pool A and 450 from the USA, UK, Germany, Australia, Canada and China (Pool B). The complete country list, field-by-field source hierarchy, official market-source starting points, logo-permission requirements, schema, and acceptance gates are documented in [Company Catalogue Source Guide](COMPANY_CATALOGUE_SOURCE_GUIDE.md).

## Current implementation status

The existing `server/data/company-catalogue.json` on this branch contains **950 US issuer/ticker records** derived from a SEC EDGAR snapshot dated July 24, 2026. Its entries are marked unverified, and sector, headquarters, instrument type and logo fields are not populated. It is a useful prototype for static/in-memory lookup only; **it does not meet the revised 1,000-company country split and has no local company-logo collection**.

Do not alter `targetCount` or `companyCount` metadata to 1,000 until 1,000 real records have been sourced and validated. Do not claim logo completeness unless every record points to an existing, licensed/permissioned image asset in GitHub.

## Required architecture

- Keep the dataset in a version-controlled JSON data file; do not bulk-seed the reference records into MySQL/MariaDB.
- Import/index catalogue data in memory at startup or through a generated static module. Lookups must not query the database or fetch a remote data provider at runtime.
- Keep company logos as local static files in `client/public/assets/company-logos/`, with repository-relative `logoPath` values and a machine-readable manifest of source, licence/permission and attribution.
- Use issuer/exchange identifiers as stable identities. Do not map live/operational company references by ticker or company name alone.
- Do not fill missing headquarters, country, sector, company image, or current-listing status by inference or placeholders.

## Existing prototype source and attribution

The current prototype subset uses SEC EDGAR's `company_tickers_exchange.json` for CIK/name/ticker/exchange associations. The immutable source snapshot and SEC payload hash are recorded in `server/data/company-catalogue.json`; attribution and registry evidence are recorded in `server/data/COMPANY_CATALOGUE_ATTRIBUTION.md`. This source does not establish company headquarters, sector, a logo, complete instrument type, or current tradability. Its current US-only records cannot be carried forward as the full multinational catalogue without independently verified country and image evidence.

## Validation and implementation status

The existing scripts named `companies:build:950` and `companies:verify:950` validate the old 950-record prototype only. They must be replaced/extended before the revised acceptance target can be claimed. The required acceptance checks are listed in the source guide. A valid final validation report must include the dataset revision/hash, group totals (550 and 450), per-country counts, unique issuer count, number of licensed local logo files, unresolved/incomplete rows (must be zero), and test results.

## Financial integrity boundary

This file contains company reference information only. It is not a feed of actual executed trades and must not be presented as proof that a trade occurred or a customer earned profit. Customer-facing execution and realized-result statements require actual trade/settlement records and a committed, auditable ledger event.
