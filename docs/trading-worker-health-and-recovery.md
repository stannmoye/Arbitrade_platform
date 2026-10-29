# Trading worker health and recovery

## Email outbox lease fencing

Email delivery is an at-least-once external side effect. The durable outbox claims each row with a lease timestamp aligned to the database's timestamp precision, and the worker must compare that exact persisted lease value before marking a message sent, retrying it, or dead-lettering it. A stale worker whose lease was reclaimed cannot overwrite the newer worker's queue state. Provider timeouts can still make the delivery outcome ambiguous; do not claim exactly-once delivery unless the provider supports and confirms an idempotency mechanism.

## Scope

The Trade Settings → **Worker Health & Recovery** page reads durable health rows written by server-side cycles. It does not depend on a customer's browser session and does not infer worker health from `/api/health`, which only confirms that the web process can answer an HTTP request.

## Monitored cycles

- Trading tier qualification (five-second queue polling).
- Automatic Trading opportunity/lifecycle processing (30-second cycle).
- Settlement reconciliation (observed independently from opportunity allocation).
- Application-local scheduled jobs (15-second queue polling).
- Notification-campaign lifecycle (30-second cycle).
- Email outbox delivery and daily digest queueing (30-second cycle, using the existing delivery settings and idempotency keys).
- Mining reward processing and Mining price feeds.
- Opportunity-popup retention and market-data refresh.

Each cycle records an instance identifier, latest heartbeat, last successful run, last failed run, duration, consecutive failure count, and bounded sanitized error text. A read-time stale threshold distinguishes stale heartbeats from cycles that are still running. Rows from recent server instances remain visible for 24 hours so crashes and restarts can be investigated.

## Queue view and safety boundary

The dashboard displays pending, processing, completed and dead-lettered Trading tier qualification jobs. A missing health table or inaccessible database is shown as unavailable, not as zero or healthy. Health-write failures are logged once per process and do not prevent the underlying worker from handling its durable work.

The dashboard permits a guarded retry of dead-lettered tier-qualification jobs only. The server locks the job row, confirms it remains dead, locks and validates the linked source ledger record and its qualifying USD attribution, then resets the queue item to pending and inserts a `v5_audit_events` record in the same transaction. The admin must supply a reason of 8–500 characters. No wallet balance, customer entitlement, or trade settlement is directly changed; the normal idempotent worker performs the eligibility reconciliation. The latest 25 dead-lettered jobs are shown to bound reads and response size.

## Validation boundary

The status classifier and error-sanitization functions have unit tests; the disposable-database tier worker integration also exercises valid audited requeue, invalid source rejection, and duplicate-entitlement prevention. CI must run the full lockfile install, TypeScript check, test suite, production build and migration/installer checks on the exact feature-branch commit. Migration `0084` is forward-only and adds `worker_health_registry`; deployment/runtime-schema bridge and installer tracking include it. It does not modify existing customer ledger or trade rows. Production migration and live-host acceptance have not been run by this change.
