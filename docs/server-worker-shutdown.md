# Server worker graceful shutdown

## Runtime behavior

The server registers its recurring worker intervals with the shared worker-runtime helper. This includes Trading qualification/opportunity/reconciliation, notification campaigns, market-data refresh, popup retention, Mining worker/feed loops, email outbox/digests, and application-local scheduled jobs.

When the process receives `SIGTERM` or `SIGINT`:

1. New worker timer ticks are stopped.
2. Idle HTTP keep-alive connections are closed and the server stops accepting new connections.
3. Already-running monitored worker cycles and active HTTP requests are allowed to finish.
4. The shared MySQL pool is closed only after the drain completes.
5. A bounded shutdown deadline force-closes remaining HTTP connections and exits non-zero if a worker or request remains stuck.

The worker health monitor exposes a drain function for cycles it currently tracks. The shutdown deadline is configurable in code and defaults to 25 seconds, bounded between 5 and 120 seconds. Durable queue leases/retry behavior remains the recovery mechanism if the process is terminated after the deadline; shutdown does not mark jobs complete or modify financial records.

## Validation

Unit tests cover interval cancellation and waiting for a monitored worker cycle. CI must pass on the exact feature-branch head before merge. This source-level behavior does not replace a deployment-time restart test on the operator's actual process manager.


## Trading worker durability and restart recovery

Trading workers operate independently of customer sessions and use durable indexed queues, bounded batches, database claims/leases, fencing, idempotency and dead-letter visibility. Startup recovery must reclaim expired leases and discover due/overdue work without full-customer scans. Resume each persisted opportunity's saved policy version, capital, selected percentage, start time, deadline, company Logo ID and funding evidence; never reroll values, reset deadlines, double-advance rotation, or repeat ledger debits/credits after restart. Graceful shutdown stops new ticks and drains active cycles within a bounded deadline. An elapsed deadline alone is not evidence of a successful trade result. See the canonical [Trading Pop-up & Admin Configuration Manual](TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md) and [Trading System Specification](TRADING_SYSTEM_SPECIFICATION.md).
