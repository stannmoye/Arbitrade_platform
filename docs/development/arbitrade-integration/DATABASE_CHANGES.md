# Database Changes

**Updated:** 2026-11-04

## Window 1

- No new database migration or catalogue table is introduced by Workstream 1.
- The catalogue remains checked-in static source data plus local image assets (1,811 stable Logo IDs).
- Existing `app_settings` stores `trade.companyCatalogue.adminState` and customer/package rotation cursors under `trading.companyRotation.<userId>.<packageId>` (legacy package-name cursor read remains supported).
- Existing `opportunity_package_policies` rotation fields are supplied by `drizzle/0090_trading_company_spotlight_rotation.sql`.
- Existing opportunity popup event company snapshot columns are reused. No historical rows are rewritten.

Other workstreams must append their own migration records here with migration filename, forward/backward compatibility, installer/portal registration, and MySQL/MariaDB evidence. Do not infer schema changes from an unmerged branch.
