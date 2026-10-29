# Trading worker health and recovery

## Scope

The Trade Settings → **Worker Health & Recovery** page reads durable health rows written by server-side cycles. It does not depend on a customer's browser session and does not infer worker health from `/api/health`, which only confirms that the web process can answer an HTTP request.

## Monitored cycles

- Trading tier qualification (five-second queue polling).
- Automatic Trading opportunity/lifecycle processing (30-second cycle).
- Settlement reconciliation (observed independently from opportunity allocation).
- Application-local scheduled jobs (15-second queue polling).
- Notification-campaign lifecycle (30-second cycle).
- Mining reward processing and Mining price feeds.
- Opportunity-popup retention and market-data refresh.

Each cycle records an instance identifier, latest heartbeat, last successful run, last failed run, duration, consecutive failure count, and bounded sanitized error text. A read-time stale threshold distinguishes stale heartbeats from cycles that are still running. Rows from recent server instances remain visible for 24 hours so crashes and restarts can be investigated.

## Queue view and safety boundary

The dashboard displays pending, processing, completed and dead-lettered Trading tier qualification jobs. A missing health table or inaccessible database is shown as unavailable, not as zero or healthy. Health-write failures are logged once per process and do not prevent the underlying worker from handling its durable work.

The initial increment is intentionally read-only. Dead-lettered financial jobs are retained for investigation; the dashboard does not silently requeue or reset them. A later recovery action must verify the original ledger event, check idempotency/lease state, capture an administrator identity and reason, and write an audit record before reprocessing.

## Validation boundary

The status classifier has pure unit tests. CI must run the full lockfile install, TypeScript check, test suite, production build and migration/installer checks on the exact feature-branch commit. The database migration is forward-only and adds `worker_health_registry`; it does not modify existing customer ledger or trade rows. Production migration and live-host acceptance have not been run by this change.
