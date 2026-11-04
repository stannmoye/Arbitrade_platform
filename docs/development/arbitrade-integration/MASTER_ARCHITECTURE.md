# Arbitrade Shared Architecture

**Coordination baseline:** 2026-11-04  
**Repository:** `stannmoye/Arbitrade_platform`  
**Implementation references:** Window 1 catalogue/rotation PR [#283](https://github.com/stannmoye/Arbitrade_platform/pull/283); Window 2 policy PR [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284); generation implementation currently present in PR [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), with ownership attribution to be reconciled against Window 3's assignment.

## Purpose

This directory is the shared integration contract for six implementation workstreams and Window 7 (final integration and verification). It supplements, and does not replace, the canonical product contract in `docs/TRADING_SYSTEM_SPECIFICATION.md`, the detailed admin contract in `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, or repository instructions in `AGENTS.md`.

## Target information-opportunity flow

1. **Eligibility:** use existing server-owned customer package subscription / tier qualification records. Do not create a second qualification mechanism or accept customer-selected packages.
2. **Generation control and policy:** read persisted generation controls, global delivery controls and the selected package's saved policy. Invalid or unavailable required policy fails closed.
3. **Company selection:** Window 1's existing company catalogue and stable Logo IDs are authoritative. The eligible pool is the administrator-approved set minus disabled and archived IDs, then constrained by saved country filters. Brand-only entries are valid identities; ticker, exchange, quote feed or manually authored company template is not required.
4. **Rotation:** Window 1 owns durable customer/package rotation state. Persist the selected company and rotation metadata with the opportunity in the same transaction. Do not use an unapproved fallback.
5. **Package terms:** Window 2 owns package-specific policy contracts, validation and persistence. Use the selected package's persisted capital, payout-rate and duration bounds. A company template may enrich display terms but cannot determine pool membership or override package bounds.
6. **Generation and persistence:** Window 3 owns automatic non-financial opportunity generation, unique generation keys, assignment persistence and immutable package/company snapshots. A retry must reuse the existing assignment and must not reroll terms or advance rotation twice.
7. **Delivery:** Window 4 owns the existing persisted opportunity-delivery lifecycle. Enforce delivery idempotency, pending-delivery limits, dispatch leases/fencing, retries and acknowledgement. Do not build a second popup delivery worker.
8. **Customer display:** Window 4 owns customer popup eligibility and rendering. Return only offers assigned to the authenticated customer and eligible under their active server-owned package entitlement. A first render for an `in_progress` delivery requires a non-empty server-issued lease token.
9. **Administration:** Window 5 owns Trade settings navigation, control organization, save/read-back behavior and administrator feedback. Settings shown in the UI must map to one authoritative persisted contract.
10. **Monitoring and recovery:** Window 6 owns independent verification and observability improvements using the existing worker-health registry and admin diagnostics. Partial customer-batch failures must be reported as degraded even when the outer worker completes normally.

## Workstream implementation boundaries

- **Window 1 — Company Catalogue & Automatic Company Rotation:** company catalogue identity, brand-only compatibility, admin eligibility/status rules, country filtering, rotation cursor and repeat policy.
- **Window 2 — Package Policies & Configuration:** package-specific policy schema/contracts, defaults, validation and independent persistence.
- **Window 3 — Automatic Opportunity Generation Engine:** non-financial opportunity generation, assignment idempotency, snapshots and handoff to Window 4.
- **Window 4 — Opportunity Delivery & Customer Portal:** persisted popup delivery, lease/fencing, retry/recovery, customer API visibility and browser rendering.
- **Window 5 — Admin Trade Settings & Database Persistence:** Trade admin controls, unique settings ownership, save/read-back and visible success/error feedback.
- **Window 6 — Testing, Monitoring & Production Readiness:** test matrix, independent regression/integration evidence, worker health observability, install/upgrade and deployment-readiness verification.
- **Window 7 — Final Integration and Verification:** cross-branch conflict resolution, migration ordering, exact-final-head CI, authenticated hosted acceptance and merge decision.

## PR attribution requiring reconciliation

PR #278 contains both catalogue-rotation integration and substantial automatic-generation implementation, although its PR description labels it Window 1. The supplied workstream assignments separate catalogue/rotation (Window 1) from generation engine (Window 3). Window 7 must split/reconcile the ownership attribution and contracts; do not infer code ownership from the earlier PR label. PR #283 documents the Window 1 company-catalogue contract; PR #284 documents the Window 2 policy contract; PR #280 is the Window 4 delivery-contract PR; PR #279 is the Window 6 monitoring PR.

## Financial and data boundary

- Opportunity generation and display are informational workflows only. They must not execute real-money trades, allocate customer funds, determine results, settle unattended or mutate wallet/ledger.
- Existing financial safeguards, authorization, audit controls and hard-disabled automatic financial execution remain unchanged.
- Preserve the existing 16 packages, 1,811 company catalogue records, logos, customers and historical rows.
- Brand-only records remain brand identities. Never fabricate symbols, exchange listings, prices, market data or realized outcomes.
- Database changes are forward-only, additive where possible, ordered, documented and retry-safe. Never reset or reseed populated production data.

## Integration authority

Window 7 owns final cross-branch conflict resolution, migration ordering, exact-head CI, database/browser acceptance and the integration decision. No implementation window merges directly to `main`.
