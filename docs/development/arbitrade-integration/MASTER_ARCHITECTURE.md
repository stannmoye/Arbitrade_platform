# Arbitrade Shared Architecture

**Updated:** 2026-11-04  
**Repository:** stannmoye/Arbitrade_platform  
**Integration authority:** Window 7

## Target information-opportunity flow

1. **Eligibility:** use existing server-owned customer package subscriptions and tier qualification. Generation never accepts a customer-selected package or creates qualification.
2. **Package policy (Window 2):** read the saved policy for the selected active package subscription, including enablement, daily generation quota, capital bounds, configured payout range, duration range, display timing and pending limits. Invalid required configuration fails closed.
3. **Company selection (Window 1):** call buildCompanySpotlightPool and nextCompanySpotlight from server/modules/company-spotlight-rotation.ts. Use the current verified-for-display, enabled, non-archived pool and exact country filters. Brand-only records are valid; symbols and market data are not required.
4. **Generation (Window 3):** select one eligible customer/package assignment, derive terms only from its persisted package policy, optionally enrich display text from a saved approved template, and persist a durable generated offer and assignment.
5. **Scheduling and recovery (Window 3):** use the existing database-backed worker, durable batch records, bounded customer cursor, generation lock, unique generation key and persisted assignment snapshots. Replays reuse the existing assignment and do not reroll terms or advance company rotation twice.
6. **Publishing handoff:** a generated opportunity is persisted as an open customer-assigned offer. Generation does not create a second publishing or customer-delivery queue.
7. **Delivery (Window 4):** the existing opportunity-delivery lifecycle owns popup admission, pending capacity, dispatch leases, retries, acknowledgements and customer-facing delivery.
8. **Monitoring:** expose generation batch outcomes and worker health through the existing monitoring surfaces. The designated owner and any shared-file changes must be confirmed from Window 6's exact assignment; do not create a parallel health registry.
9. **Final integration (Window 7):** reconcile all six workstreams, ordered migrations, exact-head checks and authenticated acceptance.

## Company-neutral generation

An empty approved company pool is not a generation failure. The engine may persist an informational opportunity with a null company identity. It must not invent a company, use an unapproved fallback, or require a ticker, exchange, quote or market-data record. Template absence is also non-blocking.

## Financial and data boundary

- Generation and publishing are informational workflows only. They must not execute trades, allocate customer funds, transfer funds, determine results, settle positions, or mutate wallets/ledgers.
- Keep existing financial execution safeguards, authorization and audit controls unchanged.
- Preserve all 16 packages, 1,811 company records/logos, customer records and historical snapshots.
- Database changes are forward-only, ordered, documented and retry-safe. Never reset or reseed populated data.
