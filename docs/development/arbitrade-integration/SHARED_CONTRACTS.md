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
- Queue admission persists one `opportunity_popup_events` row and one `opportunity_delivery_idempotency` fence per customer/offer. It is not proof that the browser received or rendered the notice.
- The authenticated customer opportunity read claims queued/retry-due dispatches through `claimPopupDeliveryDispatches(userId)`. A successful claim returns `deliveryStatus=in_progress` and a dispatch lease token; the customer payload must carry that token unchanged as `deliveryLeaseToken`.
- Customer popup eligibility may accept `in_progress` only when a non-empty server-issued lease token is present. An unleased `in_progress` row, `queued`, `retry_wait`, and terminal statuses are not renderable. Previously acknowledged `delivered`, `received`, and `rendered` rows remain refresh-recoverable while the offer is open and unexpired.
- The browser acknowledges `received`, then `rendered`, using the same event ID and lease token. The server verifies customer ownership, current offer status/expiry, in-progress state and lease-token equality; stale tokens cannot acknowledge or mutate another customer's event.
- Retry/lease expiry uses the existing shared delivery retry policy and bounded lifecycle. Dismissed/expired deliveries are terminal and must not be resurrected.
- Delivery state and presentation actions do not create financial effects.
- Do not duplicate delivery queues, delivery idempotency keys or lifecycle workers.

## Financial boundary

No opportunity-generation, publishing or delivery operation may initiate real-money execution, customer fund allocation, result determination, automatic settlement, or wallet/ledger mutation. Do not weaken authorization, audit, or existing financial guards.

## Worker monitoring and partial-batch outcomes

- The existing durable worker-health registry remains the single monitoring source; do not create a parallel health table, queue, endpoint or worker.
- The Trading opportunities worker reports a degraded outcome when one or more customer sub-cycles fail, even if the outer batch loop completes and other customers succeed.
- The cycle result exposes only an aggregate `customerFailures` count for monitoring. Do not include customer IDs, account details, raw exception messages or secrets in the aggregate diagnostic.
- Aggregate failure details use the existing sanitized worker-health path and stable `CUSTOMER_CYCLE_FAILURES` diagnostic code. A partial failure must not be represented as healthy.
- Worker health persistence remains best-effort and must not prevent durable opportunity processing.


## Window 1 company-selection contract

- Use `server/modules/company-spotlight-rotation.ts` (`buildCompanySpotlightPool` and `nextCompanySpotlight`) for brand-only company identity and rotation. Do not route informational company selection through the older ticker/exchange/recent-verification-oriented `server/modules/company-rotation.ts`.
- Preserve all 1,811 stable Logo IDs and local assets. Only current admin-verified, enabled and non-archived IDs enter the display pool; disabled/archived override stale verified IDs. Country filters apply after status eligibility.
- Missing/malformed admin state or an empty eligible pool fails closed; opportunity generation may continue without a company identity. Never use an unapproved fallback.
- Persist the returned customer/package cursor and company snapshot atomically with the opportunity. Replays must not advance rotation twice.

## Window 2 package-policy contract

- Use `server/modules/package-opportunity-policy.ts` as the canonical typed policy row, package patch allowlist, new-package defaults and package-isolated resolver.
- Existing package policy rows are preserved. New package policy rows receive the package-level opportunity defaults; explicitly saved zero values and omitted existing values must remain unchanged.
- Global tier-policy, informational popup delivery, company rotation, randomized timing and burst delivery are global masters owned by Package Configuration and saved through the audited `adminOperations.updateGlobalTradeControl` mutation. Migration 0105 defaults these safe informational masters ON only for an untouched migration-created global policy; a saved administrator decision is preserved. The legacy per-package boolean placeholders are not editable through the package-policy patch API.
- The package-policy patch allowlist excludes global master flags, `automaticTradingEnabled`, and settlement-guard fields. `automaticTradingEnabled` remains false and real-money execution, customer-fund allocation and settlement remain outside this architecture.
- Schedule targets and timing defaults must be checked against the product's requested package-specific cadence before declaring new-package scheduling complete; the current default policy still has zero hourly/daily generation targets.

## Window 5 admin-settings contract

- Reuse existing admin mutations, authorization, policy versions, audit reasons and fresh server read-back. Client-side validation improves feedback but never replaces server validation.
- Preserve valid numeric zero values when hydrating Trade timing settings; do not use truthy fallback expressions for saved numeric settings.
- Invalid fee/retry drafts must be blocked with field-level explanations; success feedback appears only after mutation and persisted read-back succeed.
- No new settings table, API procedure or duplicate settings registry is permitted.
