# API Contracts

**Coordination baseline:** 2026-11-04

## Existing admin operations

The Workstream 1 branch exposes these procedures inside the existing `adminOperations` router:

| Procedure | Contract |
| --- | --- |
| `opportunityGenerationTemplates` | Admin-only query for saved optional templates. |
| `opportunityGenerationMonitor` | Admin-only query for generation control, recent batches/assignments, daily totals and package breakdown. |
| `opportunityGenerationControl` | Admin-only query for persisted generation enabled/version/audit metadata. |
| `saveOpportunityGenerationTemplate` | Admin-only mutation for draft/approve/disable/archive actions. Requires a 5–500 character reason; edits require the expected template version. |
| `updateOpportunityGenerationControl` | Admin-only mutation for enabled state, reason (5–500 characters) and expected control version. Uses a transaction, audit event and fresh read-back; stale versions return CONFLICT. |

The generation-control migration default is ON for new installations. Existing administrator values are preserved. Invalid/unavailable control state fails closed.

## Existing customer operations

- `customer.opportunities` is the protected authenticated-customer read path for only that customer’s offers and persisted delivery summary. The server evaluates active server-assigned subscriptions, current package policy, open/unexpired offers, quota/capacity, and persisted delivery state; the client cannot choose a package or opportunity.
- For normal customer reads (not background worker cycles), the existing path claims queued/retry-due dispatches and returns the event ID, current dispatch status and server-issued lease token as `deliveryLeaseToken`. The token is scoped to that customer/event and must be forwarded unchanged.
- `customer.popupDeliveryStatus` accepts `{ eventId, status: received|rendered|failed, errorCode?, leaseToken? }`. A lease token is operationally required for a state change; the server also checks authenticated customer ownership, lease equality, current offer status and expiry. Missing/stale tokens are no-ops, not acknowledgements.
- Existing `customer.popupLifecycle` actions remain the owner for noticed/opened/dismissed/withdrawn/traded/settled presentation/lifecycle state. These actions must not create financial effects.
- The customer alert may display an `in_progress` dispatch only when the response includes a non-empty `deliveryLeaseToken`; after rendering it acknowledges `received` and `rendered` with that token. Persisted delivered/received/rendered notices can be recovered on refresh while still open and eligible.

## Contract stability

- Do not expose admin generation controls to customer roles.
- Do not add a second customer opportunity endpoint or an alternate company lookup path for generation.
- Do not make customer clients select package, payout rate, duration or company outside server policy.
- Any API changes by another workstream must be recorded here with router path, authorization class, input/output contract, idempotency and compatibility notes.
- Exact generated output types should continue to be inferred from the existing tRPC router rather than copied into duplicate hand-maintained DTOs.

## Workstream 6 monitoring contract

- No new API procedure or public/customer API is introduced.
- Existing admin-only Worker Health & Recovery and System Diagnostics surfaces remain the monitoring read paths.
- The opportunity worker cycle result includes an aggregate `customerFailures` integer. It contains no customer identifiers or raw exception text and is consumed internally by the existing worker-health wrapper.
- Existing admin authorization, error sanitization and unavailable-versus-empty semantics remain unchanged.
- Worker health responses mark each row with `isCurrentInstance`; historical rows remain available for review, while live diagnostic classification uses current-process rows only.
