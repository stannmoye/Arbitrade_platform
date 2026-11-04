# Company Catalogue & Rotation Selection Contract

**Owner:** Workstream 1 — Company Catalogue & Automatic Company Rotation  
**Status:** Runtime loader corrected to use stable brand identity independently of optional ticker enrichment; awaiting exact-head CI and Window 7 re-review  
**Canonical implementation:** `server/modules/company-catalogue-reference.ts` and `server/modules/company-spotlight-rotation.ts`

## Purpose and boundary

This contract supplies an informational company identity (stable Logo ID, display name, local logo and descriptive source metadata) to non-financial opportunity generation. It does not select a tradable instrument, validate a security listing, supply a market quote, execute a trade, allocate customer funds, or settle a financial position.

Do not use `server/modules/company-rotation.ts` for this purpose. That older listed-instrument helper requires an active listing, ticker, exchange and recent verification timestamp; those are intentionally not requirements for the brand-only image catalogue. It is a separate instrument-oriented helper and is not called by the current opportunity lifecycle.

## Catalogue source and integrity

- Source of truth is the checked-in 1,811-row logo mapping and local country-grouped image assets, aligned by stable IDs `logo-brand-0001` through `logo-brand-1811`.
- `COMPANY_REFERENCE_CATALOGUE` loads the source logo mapping at runtime. Stable IDs are assigned from mapping order; non-empty company names and valid local logo paths establish catalogue identity. The production mapping must retain exactly 1,811 usable records and unique asset paths, but ticker workbook files are not a startup dependency. Isolated loader tests may inject a smaller expected mapping size without changing production defaults.
- Ticker/exchange workbook snapshots are optional best-effort enrichment. Missing, partial or malformed workbook data is ignored; it cannot prevent startup, catalogue loading, selection or opportunity generation. Supplied metadata is retained when it can be safely associated with the matching stable ID and company name. No exact ticker/supplement record counts are required for catalogue initialization.
- Records remain `referenceOnly: true`, `eligibleForVerifiedTradeRotation: false`, `listingStatus: "unverified"`, and `recordCompleteness: "brand-only"`. Supplied ticker/exchange fields are descriptive metadata only.
- Duplicate display names are valid; stable Logo IDs and unique asset paths distinguish records. Never deduplicate by company name.
- The catalogue is static application data, not a second customer/company database. Preserve all source rows and local logo assets.

## Eligibility rules

A company may be attached to a customer opportunity only when all these conditions hold:

1. Its stable ID exists in the source catalogue and has a non-empty display name and local logo path.
2. Its ID is in the current persisted administrator `verifiedIds` allowlist.
3. Its ID is absent from both `archivedIds` and `disabledIds`. Archived and Disabled always take precedence over stale approval entries.
4. It matches the optional exact country-folder filter, applied after the status allowlist.
5. The selection pool has no duplicate stable IDs.

Administrator Verified means approved for customer-facing company display only. It does not change the source listing status, prove a public listing, or enable securities/trading eligibility. Brand-only records can be selected using only their stable company ID, non-empty display name and local logo path. Ticker, symbol, exchange, sector, headquarters and market-data fields are optional and are not part of the selection predicate.

Missing or malformed administrator state fails closed to an empty pool. An empty pool is not an opportunity-generation failure: publish/deliver the opportunity without company identity. Never fall back to an unverified, disabled, archived or arbitrary company.

## Service contract consumed by opportunity generation

Import from `server/modules/company-spotlight-rotation.ts`.

### Build the eligible pool

```ts
buildCompanySpotlightPool(
  countryNames: string,
  adminState: CompanyCatalogueAdminState,
  catalogue?: readonly CompanyReferenceRecord[],
): CompanyReferenceRecord[]
```

- `countryNames`: empty string for all countries, otherwise comma-separated exact country-folder labels.
- `adminState`: parsed current state with `verifiedIds`, `archivedIds`, and optional legacy-compatible `disabledIds`.
- `catalogue`: optional source override for deterministic tests; production uses `COMPANY_REFERENCE_CATALOGUE`.
- Returns the eligible source records, retaining all brand-only and descriptive metadata.

### Select and advance a rotation slot

```ts
nextCompanySpotlight(
  pool: CompanyReferenceRecord[],
  priorState: unknown,
  userId: number,
  packageName: string,
  repeatPolicy: "avoid_until_exhausted" | "allow_repeats",
): {
  company: CompanyReferenceRecord;
  state: CompanySpotlightState;
  rotationCycle: number;
  rotationSequence: number;
  poolFingerprint: string;
}
```

- `priorState` is the previously persisted `CompanySpotlightState`, or null when no valid state exists.
- `userId` must be a positive safe integer.
- `packageName` is the stable package scope; the current worker passes the package ID string.
- `avoid_until_exhausted` traverses a deterministic per-customer/package ordering without repeats until the entire eligible pool has been visited, then starts the next cycle.
- `allow_repeats` permits deterministic repeat selection.
- The state includes pool fingerprint, repeat policy, cycle number, next index, request count and last Logo ID. Persist the returned state with the opportunity snapshot in the same transaction.

## Rotation, country filters and concurrency

- Rotation scope is per customer and package, not global across all customers.
- Country names are exact folder labels from the source catalogue. Unknown labels and more than 100 filters are rejected. Country labels are organizational metadata, not verified headquarters.
- A changed eligible ID pool changes the fingerprint and resets the cursor; unchanged pools resume from the saved cursor.
- The worker serializes each customer/package cursor using a row lock in `app_settings`, rechecks delivery idempotency after acquiring the lock, and writes the new cursor and opportunity company snapshot in one database transaction.
- A transaction rollback must roll back both the opportunity row and cursor advancement. Do not advance rotation in a read-only preview or outside the opportunity-creation transaction.
- Active opportunity reads re-check current admin status and hide a company identity after unverify/disable/archive. Immutable historical snapshots remain unchanged.

## Persistence and database dependencies

No database migration is required for this correction. The change affects only application startup data loading and in-memory enrichment; it does not change schema, persisted company IDs, admin state, package policy fields, cursor keys or opportunity snapshot columns. Existing catalogue identity remains in the checked-in logo mapping, while existing database records and settings are untouched.

Existing dependencies:
- `app_settings.settingKey = 'trade.companyCatalogue.adminState'`: audited admin approval/disable/archive state.
- `app_settings.settingKey = 'trading.companyRotation.<userId>.<packageId>'`: persisted customer/package cursor. The current worker can read the legacy package-name key for compatibility.
- `opportunity_package_policies.companyRotationEnabled`, `companyRotationCountryNames`, and `companyRotationRepeatPolicy`: package-level controls introduced by existing migration `drizzle/0090_trading_company_spotlight_rotation.sql`.
- `opportunity_popup_events`: persisted company reference ID, display name, local logo URL, metadata JSON and reference-only flag. Existing migration chain owns these columns.

The current database stores catalogue status and rotation state in existing `app_settings`; it does not duplicate the 1,811 source catalogue rows.

## Error handling

- Invalid country label / excessive country filters: reject the invalid configuration; do not silently widen the pool.
- Missing or malformed admin state: empty pool; opportunity may proceed without a company.
- Empty eligible pool: omit company identity; no unapproved fallback.
- Duplicate IDs: throw and surface a monitored selection failure; never silently deduplicate.
- Invalid customer/package scope or repeat policy: reject the selection.
- Malformed persisted cursor: selection helper initializes a fresh deterministic cycle. The caller must retain transaction/idempotency protections.
- Database lock, read or write failures: roll back the whole opportunity/cursor transaction and let the existing worker retry/monitor the failure.

## Window 3 integration instructions

Window 3's opportunity-generation engine should consume this contract rather than implement a second company selector:

1. Read the package's saved rotation enabled/country/repeat settings.
2. Within the same transaction used to create the durable opportunity, read and lock current `trade.companyCatalogue.adminState`.
3. Call `parseCompanyCatalogueAdminState`, then `buildCompanySpotlightPool`.
4. If the pool is empty, continue opportunity creation with null company identity.
5. If non-empty, lock the customer/package cursor, call `nextCompanySpotlight`, persist the returned state and immutable company metadata snapshot atomically with the opportunity.
6. Preserve the idempotency re-check after waiting for the cursor lock.
7. Never treat any company metadata as evidence of a tradable instrument or financial execution.

The existing `server/opportunityLifecycle.ts` already demonstrates this transaction boundary. Coordinate any changes to its lock order, settings keys or snapshot fields with Window 7 before implementation.

## Existing verification coverage

Regression coverage includes the production loader invoked with isolated fixture paths and missing ticker workbook files, partial ticker enrichment, the 1,811-record catalogue and local logo assets, stable IDs, admin approval, disabled/archived precedence, malformed-state fail-closed behavior, exact country filters, duplicate detection, repeat avoidance, cursor restart restoration, and no-fallback behavior for an empty eligible pool. Existing database rotation integration coverage runs in CI on MySQL 8.4 and MariaDB 11.4. CI results are automated verification only; they do not establish a live production deployment, production database upgrade or customer acceptance.
