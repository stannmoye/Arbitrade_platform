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

- `customer.opportunities` is the authenticated customer read path for the customer's own offers and persisted delivery summary.
- `customer.popupDeliveryStatus` acknowledges delivery/render/failure state using the authenticated customer context and optional dispatch lease token.
- Existing popup lifecycle actions remain the owner for notice/open/dismiss/withdraw/display state. These actions must not create financial effects.

## Contract stability

- Do not expose admin generation controls to customer roles.
- Do not add a second customer opportunity endpoint or an alternate company lookup path for generation.
- Do not make customer clients select package, payout rate, duration or company outside server policy.
- Any API changes by another workstream must be recorded here with router path, authorization class, input/output contract, idempotency and compatibility notes.
- Exact generated output types should continue to be inferred from the existing tRPC router rather than copied into duplicate hand-maintained DTOs.


## Workstream 6 monitoring contract

- No new API procedure or public/customer API is introduced.
- Existing admin-only Worker Health & Recovery and System Diagnostics surfaces remain the only monitoring read paths.
- The opportunity worker cycle result includes an aggregate `customerFailures` integer. It contains no customer identifiers or raw exception text and is consumed internally by the existing worker-health wrapper.
- Existing admin authorization, error sanitization and unavailable-versus-empty semantics remain unchanged.
