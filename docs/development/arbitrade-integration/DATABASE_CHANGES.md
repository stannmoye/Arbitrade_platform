# Database Changes

**Coordination baseline:** 2026-11-04  
**Window 3 generation-engine candidate:** PR #278, latest PR head `b7567f4ae2b1c99342014925c5a667d1896fba21`; ownership confirmation pending.

## Window 3 — Generation Engine migration sequence

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


## Workstream 4 — Opportunity Delivery & Customer Portal

- **Schema changes:** none in this workstream increment. It reuses the existing `opportunity_popup_events`, `opportunity_delivery_idempotency`, `opportunity_delivery_events`, `opportunity_offers` and `app_settings` structures.
- No new queue, table, index, migration, backfill, or destructive operation is introduced.
- Window 7 must integrate Workstream 4 against the final combined schema after migrations 0103–0105 and run the existing guarded popup-delivery integration on disposable MySQL 8.4 and MariaDB 11.4 databases.
- Existing packages, company catalogue entries/logos, customers, subscriptions and historical delivery records remain unchanged.

## Workstream 6 — Testing, monitoring and readiness

- No database table, column, index, migration, journal entry or seed change is introduced by Window 6.
- Window 6 reuses the existing `worker_health_registry` migration (0084) and durable monitoring implementation.
- The opportunity worker reports an aggregate failed-customer count through its existing cycle result; the monitor records partial batch outcomes as degraded. This is application-level observability only.
- The current-versus-historical worker-instance marker is derived from the existing persisted `instanceId`; it introduces no schema change.


## Windows 1, 2 and 5 — No schema changes

- Window 1 PR #283 adds catalogue/rotation contract documentation and regression tests only. It reuses the existing static catalogue, `app_settings` state, package policy fields and opportunity snapshot columns.
- Window 2 PR #284 adds a typed package policy module and refactors existing `server/db.ts` logic. It reuses `packages` and `opportunity_package_policies`; no new table, column, index, migration, journal entry or seed rewrite is introduced.
- Window 5 PR #285 adds client-side validation and feedback for existing settings mutations. No schema, migration, table or seed changes are introduced.
- Window 6 PR #279 and the Window 7 current-versus-historical monitoring adaptation also introduce no schema change; they reuse migration 0084 and the existing worker-health registry.
- The integration branch must validate the combined migration chain, including Window 3 migrations 0103–0105, on disposable MySQL 8.4 and MariaDB 11.4. Do not apply to production as part of this workstream.
