# API Contracts

**Updated:** 2026-11-04

## Existing generation administration — Window 3

The existing adminOperations router procedures introduced with PR #278 remain the single generation administration surface:

| Procedure | Contract |
|---|---|
| opportunityGenerationTemplates | Admin-only read of optional company display-term templates. |
| opportunityGenerationMonitor | Admin-only read of persisted generation batches, assignments, package breakdown and daily outcomes. |
| opportunityGenerationControl | Admin-only read of persisted generation enabled/version/audit metadata. |
| saveOpportunityGenerationTemplate | Admin-only audited create/update/approve/disable/archive of optional templates. |
| updateOpportunityGenerationControl | Admin-only audited, version-checked generation pause/resume with fresh persisted read-back. |

Do not add a competing generation API or expose generation controls to customer roles.

## Existing customer operations — Window 4

- customer.opportunities remains the authenticated customer read path for that customer's own persisted opportunities and delivery summary.
- customer.popupDeliveryStatus remains the existing acknowledgement path, including dispatch lease-token handling.
- Customer clients do not choose package, company, payout rate, duration or generation state.

## Compatibility

Use inferred tRPC types from the existing router. Any future API changes must document authorization, validation, idempotency, versioning and backward compatibility here. Generation API success does not imply delivery, customer display or financial execution.
