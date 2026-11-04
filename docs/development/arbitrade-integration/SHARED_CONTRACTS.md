# Shared Contracts

**Coordination baseline:** 2026-11-04  
**Primary references:** `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `docs/trading/IMPLEMENTATION_COORDINATION.md`.

## Company identity

- The existing catalogue is the source of company identity. Use stable IDs matching `logo-brand-####`; preserve the associated name, logo and supplied metadata.
- All 1,811 catalogue entries remain preserved. Brand-only entries are supported without ticker, exchange, live quote or market-data requirements.
- For customer-facing opportunity identity, use only the current admin-verified, enabled, non-archived pool. Disabled and archived states override verification. Apply package country filters to that eligible pool.
- Empty or malformed approval state fails closed. Never fall back to an unverified company.
- Catalogue membership and admin display approval do not establish securities listing, execution eligibility, a price, or realized profit.

## Package terms

- The selected active server-owned package subscription determines the applicable package policy.
- Capital minimum/maximum, payout rate minimum/maximum, trade-duration minimum/maximum, display duration, pending-delivery limit and company country/repeat policy come from persisted package/global policy.
- Payout rate and duration are selected inclusively within validated saved bounds and stored once in the package snapshot. Retries/restarts reuse the stored selection.
- A saved approved company template is optional display-term enrichment for the already-selected company. It cannot shrink the company pool, gate generation, or override package-specific payout/duration bounds.
- Catalogue-native opportunities use a non-market sentinel (currently `BRAND`) and informational venue labels. Do not present these as a real ticker or venue.

## Idempotency and snapshots

- Generation key is unique per generated customer/package/quota assignment; database uniqueness is authoritative.
- Company rotation cursor and opportunity assignment must advance/commit atomically. A replay must not advance the cursor a second time.
- Assignment and offer snapshots retain package ID/subscription, package policy version, selected terms, company Logo ID and identity metadata, generation batch, and optional template ID/version.
- Template provenance is nullable for catalogue-native assignments. Existing historical template references remain intact.
- Customer reads are authenticated and customer-scoped. Do not expose another customer's assignment or the full admin catalogue through customer routes.

## Delivery boundary

- Generation persists the opportunity; the existing delivery lifecycle owns popup delivery state, idempotency, pending capacity, dispatch claims, retries and recovery.
- Delivery state and presentation actions do not create financial effects.
- Do not duplicate delivery queues, delivery idempotency keys or lifecycle workers.

## Financial boundary

No opportunity-generation, publishing or delivery operation may initiate real-money execution, customer fund allocation, result determination, automatic settlement, or wallet/ledger mutation. Do not weaken authorization, audit, or existing financial guards.
