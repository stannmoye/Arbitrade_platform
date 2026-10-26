# Agent instructions for Arbitrade Platform

Read these files before changing the application:

1. `BUILD_SOURCE.json` — canonical branch/build requirements and acceptance boundary.
2. `BUILD_AND_RELEASE.md` — build and release process.
3. `docs/REPOSITORY_GUIDE.md` — repository layout and source ownership.
4. **`docs/TRADING_SYSTEM_SPECIFICATION.md` — mandatory canonical trading requirements.**
5. The acceptance or implementation document relevant to the files being changed.

## Mandatory trading-system rule

Before modifying the Trading page, opportunity engine, package entitlements, wallet allocation, trade lifecycle, settlement, fees, company catalogue, or related admin controls, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full. Treat it as the canonical product contract for trading behaviour. It covers package defaults, free activation/qualifying balance, same-package repurchase controls, combined customer earnings ceiling, insufficient-balance opportunity pop-ups, server-side automatic processing, 15% fee on realized positive profit, retries/carry-forward, company rotation, wallet notifications, and admin controls.

Do not introduce behaviour that conflicts with the specification. If a codebase constraint or later user instruction appears to conflict, stop and document the conflict before implementing. Update the canonical specification and its PDF together when requirements are formally revised. Never claim a requirement is implemented without inspecting the code and validating it.

## Canonical source

- The application source of truth is `stannmoye/Arbitrade_platform` on `main`.
- Resolve the latest `main` SHA before starting work; pin builds and acceptance evidence to the full SHA.
- Do not treat an old branch, cached clone, generated ZIP, or stage-only release tag as newer than current `main`.
- Do not create a standalone stage-only application package. Keep release artifacts integrated with the full application.
- Keep the root `Dockerfile`, `pnpm-lock.yaml`, and `BUILD_SOURCE.json` aligned.

## Development and validation

Use Node.js 22 and pnpm 10.18.0. Before submitting source changes, run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Never commit `node_modules/`, generated `dist/` output, release archives, actual `.env` files, credentials, private keys, customer data, or production database dumps.

Database changes should use ordered forward migrations and retry-safe server-side behaviour. Do not run a fresh install against a populated database.

## Financial safety and release discipline

Live execution requires a named, authorized provider, verified result references, and settlement reconciliation. Configured opportunity estimates are never sufficient to credit real profit. Admin changes to financial policy must be permissioned and auditable. Passing build checks, source inclusion, hosted acceptance, deployment, and production certification are separate gates.


## Ticker candidate data safeguards

- The imported candidate snapshot is `server/data/company-trading-symbol-candidates-1811.json.gz.b64`; the service validates its 1,811 rows and 814 public candidates at startup.
- Join candidate ticker data to the image catalogue using the stable sequential logo ID, never fuzzy name matching.
- The source workbook includes 637 invented placeholder codes, 265 parent-brand ticker references, and 95 historical tickers. Those values must not be exposed as active candidates.
- The 814 rows marked Public are still unverified research candidates. Keep all entries ineligible for verified trade rotation until independent authoritative verification, source URL, provider instrument ID, and verification timestamp are recorded.
- Do not use ticker search results to authorize live orders, market quotes, or settlement.


### Company catalogue UI integration
- The company catalogue contains 1,811 logo-ID-aligned records and is searchable from the customer Trading Opportunities page.
- Keep company ID, local logo, country folder, supplied ticker, exchange, and dataset status associated on the same result.
- Search endpoint may return up to 1,811 records, but the customer UI should request and render at most 100 results at a time.
- Display supplied ticker values as supplied; do not imply they are verified or guaranteed to resolve with a market-data provider.
\n- Import every row and every column from `company_trading_symbols.xlsx` aligned by its 1-based `#` field to Logo ID; preserve supplied ticker, exchange, status, parent ticker, and reason fields even for placeholder, parent, and historical rows.\n- Placeholder codes are display-only and must not be passed to market-data or order APIs. Historical and parent-company ticker references must remain visibly classified; do not silently convert them into direct listings.\n