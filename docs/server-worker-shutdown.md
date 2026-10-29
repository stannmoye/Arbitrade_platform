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


## Trading opportunity and company-rotation recovery

See [Trading Pop-up & Admin Configuration Manual](TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md) for the canonical configuration and rotation contract. Graceful shutdown alone is not enough: scheduled opportunities, policy versions, company rotation cursors, retry counts and lease state must be durable in the database. After restart, expired leases must be safely reclaimed and processing must resume idempotently without double-advancing rotation, allocating capital twice or duplicating settlement. Customer browser sessions must not be required. Never infer a completed trade or profit from a timer or company pop-up.


### Durable financial snapshots

Shutdown/restart recovery must preserve the selected capital, configured payout rate, trade duration, UTC due time, policy version, wallet allocation plan and timestamped FX evidence. A restarted worker must resume the original deadline and reuse the persisted rate and capital. It must not reroll values, re-debit a wallet, or duplicate a payout. Any overdue work is reconciled from durable state with idempotency and lease fencing; elapsed time alone is not proof of market execution.
