# SEC company catalogue source attribution

The static company/listing reference subset in `company-catalogue.json` uses the U.S. Securities and Exchange Commission (SEC) EDGAR company-ticker-exchange reference file.

- Official SEC source: https://www.sec.gov/files/company_tickers_exchange.json
- Official source last-modified time carried in the pinned manifest: 2026-07-24T13:32:36Z
- Official payload SHA-256 as recorded in that manifest: `e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c`
- SEC source row count in the pinned manifest: 10432
- Immutable retrieval snapshot: https://github.com/VlKAS/open-tax-ledger/commit/613c946973fb3cab27ecee35905eb5d91731f8e0
- Pinned retrieval file Git blob ID: `c3116b277d7b4df067a136078d6895ebfc06c287`
- Source-specific licensing registry snapshot: https://github.com/adanos-software/free-ticker-database/commit/0755fc68a578aafcf98d095cad66a2cffd78f17e
- That registry marks `sec_company_tickers_exchange` as `verified_open`, permits redistribution of the raw/derived data and commercial use, and requires attribution.
- Required attribution: “Source: U.S. Securities and Exchange Commission, company_tickers_exchange.json.”

The SEC source maps filers to ticker and exchange associations, does not guarantee accuracy or scope, and does not provide sector, logo, instrument type, or headquarters fields. Its July 2026 snapshot is not proof of current tradability. All entries remain unverified and require manual verification. This subset does not use the separate review-only FinancialData feed or redistribute Adanos repository code.
