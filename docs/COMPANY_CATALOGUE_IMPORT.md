# Verified listed-company catalogue

The initial operational acceptance target for this implementation is **at least 600 unique, verified publicly listed companies** across supported markets. Records must be traceable to a permitted data source; do not fabricate or duplicate entries to reach the count.

## Data source selection

A public candidate for evaluation is the [Adanos free global ticker database](https://github.com/adanos-software/free-ticker-database). Its repository describes an MIT-licensed source project and provides listing-level exports. Before production use, pin a specific release/snapshot, review the license and attribution requirements, record the snapshot date, inspect its coverage report, and verify that its fields map correctly to this application's `companies` and `market_instruments` records. A public dataset is reference data, not proof that every listing is currently tradable. Do not import rows until source fields and listing-status semantics have been checked.

If another provider is used, retain its license/contract, permitted-use and attribution terms, export date, and provider identifiers in the operational runbook. Do not store API keys or commercial exports in this repository unless the license explicitly permits redistribution.

## Import

Apply migrations through the normal guarded migration process, then run:

```sh
DATABASE_URL='(configured in protected server environment)' node scripts/import-listed-companies.mjs /secure/path/listed-companies.csv
```

The normalized CSV headers are:

`name,ticker,exchangeCode,instrumentType,listingStatus,headquartersCity,headquartersCountry,countryCode,sector,providerId,dataSource,sourceUrl,lastVerifiedAt`

The importer validates the complete file before opening a transaction, rejects duplicate exchange/ticker pairs within the file, requires provenance for active records, and rolls back the whole import on database failure. The raw source export may use different field names; normalize it to the documented schema only after reviewing its data dictionary. Use a current snapshot; active records older than 180 days are not eligible for rotation until reverified.

After import, verify at least **600 unique active records** with recent verification timestamps and meaningful coverage across supported countries/markets described in `docs/TRADING_SYSTEM_SPECIFICATION.md`. Count records by stable listing identity, not just company name or ticker. The script must report actual counts; it must not pad the catalogue to meet the target.

## Rotation

`server/modules/company-rotation.ts` filters to active, recently verified companies and supports country, sector, and exclusion filters. It can create a shuffled cycle with no duplicates within a cycle. The caller must persist the cycle and its selection audit in the database and connect the selected company to the actual instrument behind the opportunity. Do not replace the company identity on an unrelated market offer merely to make the popup appear to rotate.

## Important integration boundary

The migration and import/selection groundwork does not itself populate 600 companies or connect rotation to the production opportunity-delivery path. That requires a reviewed dataset import, count and coverage verification, and an integration that binds each opportunity to the actual listed instrument and persists rotation events. Do not claim the catalogue is complete or live until those checks pass.