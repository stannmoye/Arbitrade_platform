# Shared Contracts

**Updated:** 2026-11-04

## Company identity — Window 1

- Stable IDs are logo-brand-####; all 1,811 catalogue records and logos are preserved.
- Brand-only entries are valid and do not require ticker, exchange, quote, listing or market-data data.
- Generation consumes parseCompanyCatalogueAdminState, buildCompanySpotlightPool and nextCompanySpotlight from server/modules/company-spotlight-rotation.ts.
- Only current verified-for-display, enabled, non-archived records can be attached. Disabled and archived override stale verification. Country filters apply after the approval allowlist.
- An empty pool is valid and yields a company-neutral opportunity; never select an unapproved fallback.

## Package policy — Window 2

- Generation consumes the saved package-policy interface and the active server-owned subscription.
- Each generated assignment is tied to one package subscription and snapshots its policy version and effective bounds.
- Capital minimum/maximum, configured payout minimum/maximum, duration minimum/maximum, daily generation quota and package enablement come from persisted package policy. No cross-package fallback or hardcoded economic terms.
- Invalid or unavailable required package policy fails closed and is observable.

## Generation — Window 3

- The existing generateAutomaticCustomerOpportunity transaction is the generation core; the existing scheduled worker and batch tables are reused.
- Approved company templates are optional display-term enrichment only. They cannot gate pool membership or override package policy.
- Payout and duration are selected within the selected package's validated bounds and stored once in the immutable snapshot.
- Company rotation state, opportunity offer, generation assignment and unique generation key commit atomically.
- Replays reuse an existing generated assignment and do not reroll terms or advance rotation twice.
- When no company is selected, companyReferenceId, display name, logo and company metadata are persisted as NULL. The assignment schema allows NULL company identity; no fake catalogue ID is introduced.
- Generation failures are recorded against durable batch state with bounded diagnostic detail. Stale running batches are recovered as partial/interrupted without deleting successful assignments.

## Delivery — Window 4

- Generation persists the opportunity; the existing opportunityLifecycle.ts / opportunity-delivery-lifecycle path owns popup delivery state, idempotency, capacity, leases, retries and acknowledgement.
- Generation must not create a parallel delivery queue, worker, API or idempotency key.
- Customer reads remain authenticated and scoped to the requesting customer.

## Financial boundary

No generation, publishing or delivery operation may initiate real-money execution, customer-fund allocation, transfers, result determination, automatic settlement, or wallet/ledger mutation. Existing financial guards must not be weakened.
