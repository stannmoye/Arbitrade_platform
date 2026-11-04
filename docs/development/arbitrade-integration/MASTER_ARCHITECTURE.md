# Arbitrade Shared Architecture

**Coordination baseline:** 2026-11-04  
**Repository:** `stannmoye/Arbitrade_platform`  
**Generation-engine candidate:** PR [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), branch `feat/automatic-template-opportunities`; ownership confirmation with Window 3 is pending.

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
9. **Monitoring and recovery:** expose persisted generation batches, assignment outcomes, package breakdown and failures through the existing admin monitoring surface. Keep errors visible and bounded; recover through durable state. The existing worker-health registry must classify partial customer-cycle failures as degraded even when the outer worker completes normally; current-process health drives live diagnostics while historical process rows remain available for investigation.

## Window 3 — Automatic Opportunity Generation Engine

Window 3 owns automatic information-opportunity generation and the generation-to-delivery handoff. PR #278 contains the current candidate generation implementation, but its PR description misattributes the work to Window 1; Window 3 must confirm the exact branch/commit before ownership is finalized. The generation engine consumes Window 1's company-selection contract and Window 2's package-policy contract, then hands persisted offers to Window 4's existing delivery lifecycle. It does not own catalogue eligibility/rotation implementation, package-policy administration, the delivery lifecycle, financial allocation, settlement, or final merge.

## Window 1 — Company Catalogue & Automatic Company Rotation

Window 1 owns the existing 1,811-record brand catalogue, local logos, admin eligibility/status rules, country filtering, repeat policy and durable customer/package rotation cursor. The canonical selector is `server/modules/company-spotlight-rotation.ts`; brand-only identities do not require a ticker, exchange, market quote or securities-listing verification. Administrator approval is display permission only.

## Window 2 — Package Policies & Configuration

Window 2 owns the typed package opportunity-policy row/patch contract, package-specific defaults, allowlist and package-isolated merge/resolution. It reuses `packages` and `opportunity_package_policies`; global delivery masters remain separate. New-package defaults must not enable financial execution.

## Window 4 — Opportunity Delivery & Customer Portal

Window 4 owns the existing persisted customer-scoped delivery lifecycle, dispatch lease/fencing, acknowledgements, retry/recovery and customer rendering eligibility. No parallel queue or dispatcher is introduced.

## Window 5 — Admin Trade Settings & Database Persistence

Window 5 owns the admin settings save UX, draft validation, server read-back feedback and consistency with existing settings mutations. It reuses existing database/API owners and adds no parallel configuration system.

## Window 6 — Testing, Monitoring & Production Readiness

Window 6 reuses the existing durable worker-health registry and monitoring surfaces. Partial customer sub-cycle failures must classify the opportunity worker as degraded even if the outer batch completes. Current-process rows drive live diagnostics; historical rows remain visible for investigation.

## Financial and data boundary

- Information-opportunity generation and display must not execute trades, allocate customer funds, determine results, settle trades, or write wallet/ledger entries.
- Existing financial safeguards, authorization, audit controls and hard-disabled automatic financial execution remain unchanged.
- Preserve the existing 16 packages, 1,811 company catalogue records, logos, customers and historical rows.
- Brand-only records remain brand identities. Never fabricate symbols, exchange listings, prices, market data, or realized outcomes.
- Database changes are forward-only, additive where possible, ordered, documented and retry-safe. Never reset or reseed populated production data.

## Integration authority

Window 7 owns final cross-branch conflict resolution, migration ordering, exact-head CI, database/browser acceptance and the integration decision. No implementation window merges directly to `main`.