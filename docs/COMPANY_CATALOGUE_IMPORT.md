# Verified listed-company catalogue

The initial catalogue target is **950 unique publicly listed-company reference records** across available markets. Records must be traceable to a permitted data source; do not fabricate or duplicate entries to reach the count.

## Data source selection

A public candidate for evaluation is the [Adanos free global ticker database](https://github.com/adanos-software/free-ticker-database). Its repository describes an MIT-licensed source project and provides listing-level exports. Before production use, pin a specific release/snapshot, review the license and attribution requirements, record the snapshot date, inspect its coverage report, and verify that its fields map correctly to this application's `companies` and `market_instruments` records. A public dataset is reference data, not proof that every listing is currently tradable. Do not import rows until source fields and listing-status semantics have been checked.

If another provider is used, retain its license/contract, permitted-use and attribution terms, export date, and provider identifiers in the operational runbook. Do not store API keys or commercial exports in this repository unless the license explicitly permits redistribution.

## Seed the 950-record starter catalogue

After applying migrations through the normal guarded migration process and configuring the application's own `DATABASE_URL`, run `pnpm companies:seed:950`. The command downloads the upstream `core_listings.csv`, selects 950 unique stock listing records using a country-balanced round-robin, validates and imports them transactionally, then removes its temporary CSV. It refuses to invent rows if the source cannot supply 950 eligible listings. This requires network access to the source at seed time; the data is stored in the application's own database after a successful run.

**Important status limitation:** the upstream core listing export does not establish current tradability for every record. Seeded records are therefore stored as `unverified`; they must not be treated as confirmed active/tradable companies and are not eligible for active-only rotation until independently verified. `lastVerifiedAt` on these rows records the source-import observation time, not an independent live-listing verification.

## Manual CSV import

Apply migrations through the normal guarded migration process, then run:

```sh
DATABASE_URL='(configured in protected server environment)' node scripts/import-listed-companies.mjs /secure/path/listed-companies.csv
```

The normalized CSV headers are:

`name,ticker,exchangeCode,instrumentType,listingStatus,headquartersCity,headquartersCountry,countryCode,sector,providerId,dataSource,sourceUrl,lastVerifiedAt`

The importer validates the complete file before opening a transaction, rejects duplicate exchange/ticker pairs within the file, requires provenance for active records, and rolls back the whole import on database failure. The raw source export may use different field names; normalize it to the documented schema only after reviewing its data dictionary. Use a current snapshot; active records older than 180 days are not eligible for rotation until reverified.

After import, verify at least **950 unique records**, with a separately verified active subset with recent verification timestamps and meaningful coverage across supported countries/markets described in `docs/TRADING_SYSTEM_SPECIFICATION.md`. Count records by stable listing identity, not just company name or ticker. The script must report actual counts; it must not pad the catalogue to meet the target.

## Rotation

`server/modules/company-rotation.ts` filters to active, recently verified companies and supports country, sector, and exclusion filters. It can create a shuffled cycle with no duplicates within a cycle. The caller must persist the cycle and its selection audit in the database and connect the selected company to the actual instrument behind the opportunity. Do not replace the company identity on an unrelated market offer merely to make the popup appear to rotate.

## Important integration boundary

The migration and import/selection groundwork does not itself populate 950 companies or connect rotation to the production opportunity-delivery path. That requires a reviewed dataset import, count and coverage verification, and an integration that binds each opportunity to the actual listed instrument and persists rotation events. Do not claim the catalogue is complete or live until those checks pass.