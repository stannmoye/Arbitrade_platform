# API Contracts

**Updated:** 2026-11-04

## Window 1 company selection

This is an internal TypeScript service contract, not a new HTTP/tRPC endpoint.

- Module: `server/modules/company-spotlight-rotation.ts`.
- Catalogue type: `CompanyReferenceRecord`.
- Admin state parser: `parseCompanyCatalogueAdminState(raw)`.
- Eligibility: `buildCompanySpotlightPool(countryNames, adminState, catalogue?)`.
- Selection: `nextCompanySpotlight(pool, priorState, userId, packageName, repeatPolicy)`.
- Output includes selected company, persisted state, cycle, sequence and eligible-pool fingerprint.

No new public/customer endpoint or API authorization surface is added by Window 1. Existing customer catalogue routes continue to enforce the current verified-for-display allowlist server-side.
