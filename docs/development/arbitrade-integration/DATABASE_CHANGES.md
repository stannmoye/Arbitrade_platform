# Database Changes

**Coordination baseline:** 2026-11-04  
**Workstream 1 reference:** PR #278, head `aa27d664475eaf40dd4ff3d3414b267e569484e9`.

## Workstream 1 migration sequence

### Migration 0103 — `0103_automatic_opportunity_generation_templates.sql`

- Adds customer/package assignment, generation key, company identity, configured payout/duration and package policy snapshot columns to existing `opportunity_offers`.
- Adds unique generation-key and lookup indexes.
- Creates `opportunity_generation_templates` for optional reviewed company-specific display-term enrichment.
- Creates `opportunity_generation_batches` for durable batch status and diagnostics.
- Creates `opportunity_generation_assignments` for customer/package generation provenance, selected terms, snapshots and lifecycle status.
- Seeds `trade.opportunityGeneration.control` ON only when absent; duplicate-key handling preserves an existing administrator decision.

### Migration 0104 — `0104_catalogue_native_opportunity_generation.sql`

- Makes `opportunity_generation_assignments.templateId` and `templateVersion` nullable so catalogue-native generation does not require a manual template.
- Updates only the untouched migration-default reason text. Administrator-edited values are preserved.
- Does not rewrite company catalogue, packages, customer assignments, wallet, ledger or settlement records.

### Migration 0105 — `0105_default_on_global_information_delivery.sql`

- Enables the informational delivery-related global controls only for the untouched migration-created `trade.globalControls` row (`updatedBy IS NULL`, policy version 1).
- Preserves any saved administrator decision/version.
- Does not change the automatic financial execution guard.

All three migrations are represented in the Drizzle journal and schema on the Workstream 1 branch. The branch's migration sequence must be reconciled against every other workstream before integration.

## Preservation and rollout rules

- Do not drop or rebuild existing package, company, logo, customer, wallet, ledger, trade or historical opportunity tables.
- Do not import a replacement company catalogue or require re-entry of the existing 16 packages / 1,811 company identities.
- Apply only forward migrations through the repository's supported migration runners. Never run a fresh-install reset against a populated database.
- Before production rollout, Window 7 must verify 0103–0105 against the final merged migration journal on disposable MySQL 8.4 and MariaDB 11.4 databases, then validate upgrade compatibility from the supported prior schema.
- No production migration or deployment is claimed by this workstream.


## Window 2 — Package policy contract

- No database table, column, index, migration, seed, or data rewrite is introduced by Window 2.
- Reuses `packages`, `opportunity_package_policies`, package terms versions, and the existing audit event table.
- The package policy table is uniquely keyed by `packageName`; the existing package rename path transactionally renames the matching policy row and increments its policy version. Window 7 must reconcile this name-keyed contract with Window 1's package-ID/subscription snapshots without adding a competing policy store.
- Existing package rows and their saved valid policy values are not migrated or reset. Default policy values apply only when the existing create-package path inserts a new policy row.
