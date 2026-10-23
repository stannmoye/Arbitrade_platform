# Customer API Access Centre

## Overview

The API Access Centre extends the existing Arbitrade customer and administrator portals. It uses the current authentication and customer records rather than a parallel account database. Each customer can issue up to five active API keys, give each key distinct scopes, inspect aggregate usage, create signed webhooks and choose notification preferences.

The administrator controls global API enablement, per-key request limits, message wording, approved WhatsApp template mappings, provider credential storage, scheduled-notice policy, the published fee schedule and declared platform incidents.

## Installation and secret management

1. Apply portal migrations using the existing installer/migration workflow. The new migration is `0065_api_access_automation.sql`, registered in Drizzle schema, portal migrations and migration recovery.
2. Set `API_ACCESS_ENCRYPTION_KEY` in the server's private environment. It must have at least 32 characters. Back it up securely and do not rotate it casually: stored credentials and webhook signing secrets require this key to decrypt.
3. Sign in as an administrator and open **API & Integration Centre** to configure API policies and provider values.
4. Provider secrets are encrypted with AES-256-GCM before persistence. Settings/status queries return whether credentials exist and when they changed, never the secret.
5. Provider credentials being stored is not the same as a provider being verified or connected. Keep provider-dependent features disabled until the provider-specific adapter, callback verification and account-reference mapping are tested.

## Customer API keys

Keys are cryptographically generated, individually scoped and customer-owned. Only a SHA-256 hash and non-secret prefix are stored. The complete API secret is shown once after creation. Customers can revoke a key; the secret cannot be retrieved later. Never expose a key in browser JavaScript, a public repository, analytics or logs.

Send the key over HTTPS in the standard header:

```http
Authorization: Bearer arb_live_<secret>
```

Read-only API scopes cannot initiate withdrawal requests. The separate `withdrawals:create` scope is disabled by default and, when the administrator enables it, requires an authenticator code and idempotency key; the existing payout workflow reserves eligible account funds and creates a request for manual review. It does not execute a transfer. Every account operation is bound to the key owner's authenticated customer ID.

## Current endpoints

All routes require the administrator's global API switch, rate-limit allowance and the endpoint-specific scope. Account endpoints return only data belonging to the authenticated key owner.

| Endpoint | Scope | Status |
|---|---|---|
| `GET /api/v1/account/balances` | `balances:read` | Connected to current balance records |
| `GET /api/v1/account/trades` | `transactions:read` | Connected to current trade records |
| `GET /api/v1/account/withdrawals` | `withdrawals:read` | Connected to withdrawal requests |
| `POST /api/v1/account/withdrawals` | `withdrawals:create` | Disabled by default; requires admin enablement, six-digit authenticator code, idempotency key and manual review. Creates a request only; it does not execute a transfer. |
| `GET /api/v1/account/analytics` | `analytics:read` | Derived from available balance/trade/withdrawal data |
| `GET /api/v1/account/exchange-rates` | `exchange-rates:read` | Uses stored application rates |
| `GET /api/v1/account/statements/daily?date=YYYY-MM-DD` | `statements:read` | Partial statement dataset; identifies missing sections |
| `GET /api/v1/account/tax-support?year=2026` | `tax-support:read` | Tax-support summary of available trade records only; not tax advice |
| `GET /api/v1/account/notification-history` | `notifications:read` | Customer's delivery history |
| `GET /api/v1/account/api-usage` | `usage:read` | Aggregate daily per-key request/error/latency metrics |
| `GET /api/v1/platform/fee-schedule` | `fees:read` | Reads admin-published schedule, if one exists |
| `GET /api/v1/account/fees` | `fees:read` | Explicit unavailable response until authoritative fee ledger is connected |
| `GET /api/v1/account/deposits` | `deposits:read` | Explicit unavailable response until verified deposit provider/ledger is connected |
| `GET /api/v1/platform/status` | `platform:status` | API route health plus administrator-declared state; not a service-level probe |
| `GET /api/v1/platform/incidents` | `incidents:read` | Administrator-managed incident history |
| `GET /api/v1/webhooks` | `webhooks:manage` | Lists only webhooks belonging to authenticated customer |
| `POST /api/v1/webhooks` | `webhooks:manage` | Creates a signed HTTPS webhook and shows its signing secret once |
| `DELETE /api/v1/webhooks/:webhookId` | `webhooks:manage` | Revokes only the authenticated customer's webhook |

The REST webhook management routes expose a signing secret only at creation. Deliveries use an HMAC-SHA256 signature over the timestamp, a timestamp header, event ID and an idempotency identifier. Consumers should reject requests outside a short timestamp window, use constant-time signature comparison, and deduplicate by event/idempotency ID. Destinations must be public HTTPS addresses; use an outbound egress policy/proxy in production for stronger SSRF protection.

## Notifications and scheduling

Customer preferences support in-app notifications, opt-in WhatsApp events, WhatsApp destination verification, customer-selected time zone and daily delivery time. Customers can separately schedule daily activity, statement and tax-support notices. Tax-support notices contain only the stored trade records available for the report and explicitly do not constitute a tax calculation or tax advice. The database outbox deduplicates delivery requests and tracks attempts, status, timestamps and safe error codes. A worker processes due messages and applies bounded retries.

The administrator must enable WhatsApp delivery, provide the sender number, store valid Meta Cloud API credentials, configure an approved one-parameter verification template, and map event types to approved Meta templates where required. The event parameter order is fixed by the application and described beside each template editor. Meta's registered template content must match its parameter count/order. Message-body drafts do not create Meta-approved templates. Outside an active customer-service window, free-form WhatsApp text may be rejected; the delivery is recorded as failed rather than reported as successful.

Recipients must opt in and verify their number. No WhatsApp messages are sent to an unverified destination. Daily activity/statement messages are notices to query API data endpoints, not PDF attachments. Statement data is partial until deposit and fee sources exist. Fee-summary delivery should not be regarded as authoritative until a fee ledger is connected.

## Wallet provider integration

The administrator can save provider name, public API/webhook URLs, an enable-policy flag and encrypted token/secret fields without changing code. This is a credential vault/configuration foundation, not a universal provider adapter: providers use different API contracts, callback signatures and deposit-reference mappings. Before activating a specific provider, implement and test its adapter, signature validation, idempotent event ingestion and account reconciliation. The API intentionally returns `DEPOSIT_PROVIDER_NOT_CONFIGURED` until that source of truth is available.

## Platform status

Admin-created incidents are persisted and can be resolved from the admin portal. Current status prefers an active incident, then the administrator-declared status setting. Until infrastructure health checks are wired, the response labels this state as administrator-declared and does not represent it as automatic real-time health monitoring.

## Security requirements

- Keep credentials and encryption keys server-side.
- Use per-customer ownership checks and scopes on every account endpoint.
- Never use a customer-supplied ID as authorization.
- Do not execute withdrawals using an API key alone; any future write API needs additional verification, limits, idempotency and an audited approval path.
- Keep detailed account data out of WhatsApp bodies; use authenticated API endpoints instead.
- Never mark a provider-dependent feature as connected because its credentials merely exist.
- Configure outbound egress restrictions and keep dependencies updated.
- Run TypeScript checks, regression tests, migration/installer checks and staging API tests before enabling the master API switch in production.

## Not implemented by this foundation

Provider-specific wallet adapter, actual deposit ledger ingestion, authoritative fee ledger, withdrawal initiation API, automated tax calculation or jurisdiction-specific advice, service-level health probes, stored PDF report generation and expiring report links. These must be built against the actual provider, ledger and report sources selected by the project owner rather than being simulated with fabricated data.
