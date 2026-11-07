# Popup delivery acknowledgement reliability

## State meanings

The durable delivery row preserves its current database status names and lease/retry lifecycle:

- `queued`: persisted and awaiting a customer poll/dispatch claim; not evidence of browser receipt.
- `in_progress`: claimed for one dispatch attempt with a server-issued fencing token.
- `received`: the authenticated browser acknowledged receipt of the dispatch.
- `rendered`: the browser acknowledged the alert after React committed it to the document. This is terminal for delivery.
- `failed`: an actual server-observed dispatch/lease failure, subject to the saved retry policy; customer acknowledgement RPCs cannot request this state.
- `expired`: the offer closed before delivery. It is terminal and cannot be retried.
- `retry_wait`: a genuine retryable dispatch failure is waiting for its saved retry deadline. `dismissed` is a separate terminal customer action.

## Acknowledgement and recovery

The customer alert is first committed to React, then a post-commit effect sends `received` followed by `rendered` with the same event ID and lease token. If the RPC or its response is interrupted, the browser repeats the same idempotent sequence; the server may have committed a transition before the response was lost. The client never sends `failed` because an acknowledgement request rejected.

The server locks the popup row and checks ownership, offer validity, current state and lease token before a state change. Repeated `received` while received, repeated `rendered` after rendered, stale tokens, and attempts to fail a received/rendered row do not change state. Competing requests serialize on the row lock. A customer may refresh or reconnect: active in-progress/received/rendered deliveries remain refresh-recoverable under the existing delivery identity, while expiry and dismissed/rendered terminal states are not re-admitted as new deliveries. Existing delivery idempotency keys, pending caps, lease recovery and package schedules remain unchanged.

The browser integration test intentionally aborts the first `rendered` acknowledgement request and verifies that the customer's popup stays visible and its retry subsequently persists `rendered` in the disposable database. MySQL 8.4 and MariaDB 11.4 run the same integration through `.github/workflows/trading-opportunity-worker-integration.yml`.

Delivery acknowledgement state is informational only. It has no wallet, ledger, allocation or settlement effects.
