# Company catalogue source attribution and provenance

The target source policy for the 1,000-company catalogue is documented in [Company Catalogue Source Guide](../../docs/COMPANY_CATALOGUE_SOURCE_GUIDE.md). The target requires source-level evidence per company and separate reuse evidence for every bundled logo. A source that provides tickers is not automatically a source for headquarters, sector, legal status or logos.

## Existing 950-record prototype (not the final catalogue)

- Official SEC source: https://www.sec.gov/files/company_tickers_exchange.json
- Immutable retrieval snapshot: https://github.com/VlKAS/open-tax-ledger/commit/613c946973fb3cab27ecee35905eb5d91731f8e0
- Pinned retrieval file Git blob ID: `c3116b277d7b4df067a136078d6895ebfc06c287`
- Official SEC payload SHA-256 in the pinned manifest: `e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c`
- SEC source last-modified time carried in the pinned manifest: `2026-07-24T13:32:36Z`
- Required prototype attribution: “Source: U.S. Securities and Exchange Commission, company_tickers_exchange.json.”

The SEC file supplies CIK/name/ticker/exchange associations but does not provide dependable headquarters, sector, logos, complete instrument type, or proof of current tradability. The 950-record sample remains US-only, unverified and without local images. This file is evidence for that prototype only; it is not proof the revised 1,000-company requirements are complete.

## Requirements for every future source

For every field, record the source provider and exact record/page URL, retrieval timestamp, source version/hash where available, and last verification timestamp. Each logo must have its own source URL, file hash, licence/permission basis and required attribution. Verify that the source's terms allow the planned caching, redistribution and commercial use before committing content. Do not infer reuse rights from a public webpage. Preserve required notices and source-specific attribution with the assets.

The final data should not be labelled verified until the current listing and issuer details have been checked against the relevant official exchange/regulator record and/or official issuer documents. Never fabricate a record, fill missing fields with guesses, or set a status flag to bypass the incomplete-data check.
