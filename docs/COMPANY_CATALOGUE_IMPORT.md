# Verified listed-company catalogue

The initial operational acceptance target for this implementation is **at least 600 unique, verified publicly listed companies** across supported markets. This is a staged minimum, replacing the larger initial rollout target for this phase. Records must be traceable to approved/licensed data sources; do not fabricate or duplicate entries to reach the count.

## Data source requirements

Obtain a CSV export from an approved/licensed market-data source or from exchange/issuer datasets whose terms permit this use. The export must include provider identifiers and source provenance. Keep the provider contract, license/attribution terms, and export date with the operational runbook. Do not store API keys in this repository.

## Import

Apply migrations through the normal guarded migration process, then run:

```sh
DATABASE_URL='(configured in protected server environment)' node scripts/import-listed-companies.mjs /secure/path/listed-companies.csv
```

The CSV headers are:

`name,ticker,exchangeCode,instrumentType,listingStatus,headquartersCity,headquartersCountry,countryCode,sector,providerId,dataSource,sourceUrl,lastVerifiedAt`

The importer validates the complete file before opening a transaction, rejects duplicate exchange/ticker pairs within the file, requires provenance for active records, and rolls back the whole import on database failure. Use a current export; active records older than 180 days are not eligible for rotation until reverified.

After import, verify at least **600 unique active records** with recent verification timestamps and meaningful coverage across supported countries/markets described in `docs/TRADING_SYSTEM_SPECIFICATION.md`. The script must report actual counts; it must not pad the catalogue to meet the target.

## Rotation

`server/modules/company-rotation.ts` filters to active, recently verified records and supports country, sector, and exclusion filters. It can create a shuffled cycle with no duplicates within a cycle. The caller must persist the cycle and its selection audit in the database and connect the selected instrument to the real opportunity/market instrument. Do not replace the company identity on an unrelated market offer merely to make the pop-up appear to rotate.

## Important integration boundary

This migration and import/selection groundwork does not itself populate 600 companies or connect rotation to the production opportunity-delivery path. That requires a licensed data export, import verification, and a reviewed integration that binds each opportunity to the actual listed instrument and persists rotation events. Do not claim the catalogue is complete or live until those checks pass.
