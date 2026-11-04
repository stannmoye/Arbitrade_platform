# API Contracts

**Coordination baseline:** 2026-11-04

## Existing opportunity-generation administration

The generation procedures currently appear in PR #278's existing `adminOperations` router. The supplied workstream assignments place generation-engine ownership in Window 3; PR #278's earlier description labels this code Window 1, so Window 7 must reconcile attribution without duplicating the procedures.

| Procedure | Contract |
| --- | --- |
| `opportunityGenerationTemplates` | Admin-only query for saved optional templates. |
| `opportunityGenerationMonitor` | Admin-only query for generation control, recent batches/assignments, daily totals and package breakdown. |
| `opportunityGenerationControl` | Admin-only query for persisted generation enabled/version/audit metadata. |
| `saveOpportunityGenerationTemplate` | Admin-only mutation for draft/approve/disable/archive actions. Requires a 5–500 character reason; edits require the expected template version. |
| `updateOpportunityGenerationControl` | Admin-only mutation for enabled state, reason (5–500 characters) and expected control version. Uses a transaction, audit event and fresh read-back; stale versions return CONFLICT. |

The generation-control migration default is ON for new installations. Existing administrator values are preserved. Invalid/unavailable control state fails closed. Verify these behaviors on the final integrated API head.

## Existing customer operations

- `customer.opportunities` is the authenticated customer read path for the customer's own offers and persisted delivery summary.
- `customer.popupDeliveryStatus` acknowledges delivery/render/failure state using the authenticated customer context and optional dispatch lease token.
- The customer opportunity response's delivery summary must include its `enabled` state. PR #278's current source returns `enabled: globalDeliveryEnabled`; validate it through integrated API and browser tests.
- For a first render with `deliveryStatus=in_progress`, the customer payload must carry a non-empty server-issued `deliveryLeaseToken`. The browser must acknowledge `received` and `rendered` using the same event ID and token.
- Existing popup lifecycle actions remain the owner for notice/open/dismiss/withdraw/display state. These actions must not create financial effects.

## Contract stability

- Do not expose admin generation controls to customer roles.
- Do not add a second customer opportunity endpoint or an alternate company lookup path for generation.
- Do not make customer clients select package, payout rate, duration or company outside server policy.
- Any API changes by another workstream must be recorded here with router path, authorization class, input/output contract, idempotency and compatibility notes.
- Exact generated output types should continue to be inferred from the existing tRPC router rather than copied into duplicate hand-maintained DTOs.

## Window 6 monitoring contract

- No new API procedure or public/customer API is introduced by Window 6.
- Existing admin-only Worker Health & Recovery and System Diagnostics surfaces remain the only monitoring read paths.
- The opportunity worker cycle result includes an aggregate `customerFailures` integer. It contains no customer identifiers or raw exception text and is consumed internally by the existing worker-health wrapper.
- Existing admin authorization, error sanitization and unavailable-versus-empty semantics remain unchanged.
