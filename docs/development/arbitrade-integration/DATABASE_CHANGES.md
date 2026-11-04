# Database Changes

**Coordination baseline:** 2026-11-04  
**Observed generation migration source:** PR #278, branch `feat/automatic-template-opportunities`, current head `b7567f4ae2b1c99342014925c5a667d1896fba21`.  
**Ownership note:** The supplied assignments place company catalogue/rotation in Window 1 and opportunity generation in Window 3. PR #278 contains generation changes but labels itself Window 1; Window 7 must reconcile attribution and migration ownership before merge.

## Observed generation migration sequence in PR #278

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

All three migrations are represented in the Drizzle journal and schema on PR #278's branch. Their final order must be reconciled against all other workstream migrations. Window 6's CI head `962ae780e62e44ded236454040302afe9c5241e4` is based on `main` and does not itself include PR #278's migrations.

## Window 6 database boundary

- No database table, column, index, migration, journal entry or seed change is introduced by Window 6.
- Window 6 reuses the existing `worker_health_registry` migration (0084) and durable monitoring implementation.
- The opportunity worker reports an aggregate failed-customer count through its existing cycle result; the monitor records partial batch outcomes as degraded. This is application-level observability only.

## Preservation and rollout rules

- Do not drop or rebuild existing package, company, logo, customer, wallet, ledger, trade or historical opportunity tables.
- Do not import a replacement company catalogue or require re-entry of the existing 16 packages / 1,811 company identities.
- Apply only forward migrations through the repository's supported migration runners. Never run a fresh-install reset against a populated database.
- Before production rollout, Window 7 must verify 0103–0105 and all other workstream migrations against the final merged migration journal on disposable MySQL 8.4 and MariaDB 11.4 databases, then validate upgrade compatibility from the supported prior schema.
- No production migration or deployment is claimed by Window 6.
