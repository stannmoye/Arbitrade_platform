# Customer API Access Centre

## Current implementation slice

This feature is being delivered in small, testable stages. The initial slice adds:
- Unique per-customer API secrets generated with a cryptographically secure random source.
- SHA-256 hashes only in the database; the secret is returned once to the customer.
- A maximum of five active keys per customer, with per-key read scopes and revocation.
- A customer-facing API Access Centre with key creation, permission selection, one-time secret display, copy, and revocation.
- Administrator-controlled database settings for the global API policy, request limit, WhatsApp sender number, editable message templates, and wallet-provider connection metadata.
- Initial read-only REST endpoints for balances, trade history, withdrawal status, and API-service status. Every request must use its own customer's key and an authorized scope.

## API endpoints

Send the key using an HTTPS request header, never a URL query parameter:

```http
Authorization: Bearer arb_live_<secret>
```

| Endpoint | Required scope | Notes |
|---|---|---|
| `GET /api/v1/account/balances` | `balances:read` | Returns account-owned balances in minor units and currency scale. |
| `GET /api/v1/account/trades` | `transactions:read` | Returns only the authenticated customer's trade history. |
| `GET /api/v1/account/withdrawals` | `withdrawals:read` | Returns status and references without destination details. |
| `GET /api/v1/platform/status` | `platform:status` | Reports API availability; full multi-service health and maintenance status are not yet configured. |

All endpoints remain disabled until the administrator enables the global API policy. Unknown, revoked, closed-account, or insufficient-scope keys are rejected. Per-key rate limiting uses the configured shared Redis rate-limit store when available and a bounded process-local fallback otherwise; multi-instance production deployments should configure the shared store.

## Explicitly not active yet

- No endpoint can initiate a withdrawal.
- Deposit status is not exposed until a verified provider-backed deposit lifecycle exists.
- Fee records and downloadable statements are not exposed until authoritative sources and report delivery are connected.
- WhatsApp sender/template settings are saved as configuration only; no WhatsApp messages are sent in this slice.
- Wallet provider name/base URL/webhook metadata is saved as configuration only. Provider secrets must be handled by a reviewed encrypted secret vault, and a provider must pass signature/health checks before being considered connected.
- Platform status does not claim a real maintenance or full-service health state until those sources are implemented.

## Security requirements for follow-up work

- Keep key secrets out of logs, query strings, database plaintext, analytics, and customer-visible history after initial creation.
- Add API key creation/revocation audit events and key rotation UX.
- Move rate limiting to a shared store for multi-instance deployment.
- Add integration tests with two customer accounts proving cross-customer isolation.
- Connect notifications only after authoritative, committed state transitions; event processing must be idempotent.
- Store provider credentials encrypted, mask them in the admin UI, and never return them from settings queries.
- Require webhook signatures, replay protection, idempotency, verified provider callbacks, and explicit approval for sensitive payout actions.
- Keep migrations forward-only and registered in both the portal migration runner and read-only recovery inventory.
