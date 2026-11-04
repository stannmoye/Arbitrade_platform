# Arbitrade Shared Architecture

**Coordination baseline:** 2026-11-04  
**Repository:** `stannmoye/Arbitrade_platform`  
**Current implementation reference:** Window 3 PR [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), branch `feat/automatic-template-opportunities`.

## Purpose

This directory is the shared integration contract for six implementation workstreams and Window 7 (final integration and verification). It supplements, and does not replace, the canonical product contract in `docs/TRADING_SYSTEM_SPECIFICATION.md`, the detailed admin contract in `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, or the repository instructions in `AGENTS.md`.

## Target information-opportunity flow

1. **Eligibility:** use the existing server-owned customer package subscription / tier qualification records. Do not create a second qualification mechanism or accept customer-selected packages.
2. **Generation control and policy:** read the persisted generation control, global delivery controls and the selected package's saved policy. Invalid or unavailable required policy fails closed.
3. **Company selection:** use the existing company catalogue and stable Logo IDs. The generation pool is the administrator-approved set minus disabled and archived IDs, then constrained by saved country filters. Brand-only entries are valid identities; a ticker, exchange, quote feed or manually authored company template is not required.
4. **Rotation:** when enabled, select through the existing durable customer/package rotation state. Persist the selected company and rotation metadata with the opportunity in the same transaction. When rotation is disabled, choose only from the same currently eligible pool; do not use an unapproved fallback.
5. **Terms:** use the selected package's persisted capital, payout-rate and duration bounds. A saved approved company template may enrich display terms for the already-selected company, but it must not determine pool membership or be required for generation.
6. **Persistence:** persist the customer-specific offer, generation assignment, package-policy snapshot, company identity snapshot and unique generation key transactionally. A retry must reuse the existing assignment and must not reroll terms or advance rotation twice.
7. **Delivery:** pass persisted offers into the existing opportunity-delivery lifecycle. Enforce the existing delivery idempotency, pending-delivery limits, retries and lease/fencing behaviour. Do not build a second popup delivery worker.
8. **Customer display:** return only offers assigned to the authenticated customer and eligible under their active server-owned package entitlement. Company display comes from the saved offer/delivery snapshot and current catalogue approval checks.
9. **Monitoring and recovery:** expose persisted generation batches, assignment outcomes, package breakdown and failures through the existing admin monitoring surface. Keep errors visible and bounded; recover through durable state.

## Window 1 and Window 3 ownership boundary

Window 1 owns the Company Catalogue and Automatic Company Rotation, including the approved-company catalogue and the existing rotation contract/state. Window 3 owns Automatic Opportunity Generation and its generation-to-delivery handoff; its implementation is in PR #278. Window 3 consumes Window 1's catalogue and rotation contracts and does not own the independent delivery lifecycle, package qualification engine, global Trade policy editor, financial allocation, settlement, or final integration. Window 7 owns final cross-workstream integration and verification.

## Financial and data boundary

- Information-opportunity generation and display must not execute trades, allocate customer funds, determine results, settle trades, or write wallet/ledger entries.
- Existing financial safeguards, authorization, audit controls and hard-disabled automatic financial execution remain unchanged.
- Preserve the existing 16 packages, 1,811 company catalogue records, logos, customers and historical rows.
- Brand-only records remain brand identities. Never fabricate symbols, exchange listings, prices, market data, or realized outcomes.
- Database changes are forward-only, additive where possible, ordered, documented and retry-safe. Never reset or reseed populated production data.

## Integration authority

Window 7 owns final cross-branch conflict resolution, migration ordering, exact-head CI, database/browser acceptance and the integration decision. No implementation window merges directly to `main`.
