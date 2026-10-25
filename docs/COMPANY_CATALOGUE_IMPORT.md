# Static company reference catalogue

Arbitrade stores its 950-record company/listing reference catalogue in the version-controlled file `server/data/company-catalogue.json`. The server imports this JSON as part of its application bundle and creates in-memory lookup indexes once during module initialization. Catalogue searches and lookups do not query the database or call an external provider.

## Included fields and source

Each record has a stable ID, issuer name, ticker, source symbol, exchange code, source provenance, and a market country where the exchange mapping is unambiguous. The market country is not company headquarters. Headquarters, sector, and logo references are `null` where the source does not provide dependable values. Logos can be added later only from a source whose licensing and permitted use have been reviewed.

The data is derived from the Adanos Free Ticker Database international-symbol reference file pinned to commit `0755fc68a578aafcf98d095cad66a2cffd78f17e`. Attribution and the upstream MIT license text are stored in `server/data/COMPANY_CATALOGUE_ATTRIBUTION.md`. The pinned commit prevents automatic, unreviewed changes from a moving upstream branch.

## Build and validation

```sh
pnpm companies:build:950
pnpm companies:verify:950
pnpm test -- server/modules/company-catalogue.test.ts server/modules/company-rotation.test.ts
pnpm check
pnpm build
```

The builder downloads the pinned upstream snapshot only when intentionally run for catalogue maintenance and writes the generated JSON into the repository. It does not require `DATABASE_URL` and does not connect to or write to a database. Normal application startup performs no source download. The verifier is offline and validates record count, identities, metadata, provenance, and status constraints.

## Verification and rotation safety

The catalogue contains exactly 950 reference records, but all 950 initially remain `listingStatus: "unverified"`, `requiresManualVerification: true`, and `lastVerifiedAt: null`. The upstream source labels its records as secondary-review material. Source observation timestamps are not independent confirmation that a listing is currently active or tradable.

The rotation selector only accepts actively listed entries with a valid, recent independent verification timestamp and fails closed while none qualify. Do not mark a record active until it has been checked against an appropriate exchange or trusted licensed source. This static catalogue change does not itself connect company references to live opportunities.

The tRPC routes `companyCatalogue.search`, `companyCatalogue.byId`, and `companyCatalogue.summary` use the cached local service. Search responses are limited to 100 records.

## Database boundary

The catalogue is not bulk-seeded into the database. The platform's existing core `companies` table stays in place because existing opportunity records use integer company IDs. Those operational rows must not be automatically associated with static catalogue records based on a matching name or ticker; a later integration must establish the actual underlying instrument first.
