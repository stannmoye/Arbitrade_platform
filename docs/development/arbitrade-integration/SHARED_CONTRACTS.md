# Shared Contracts

**Updated:** 2026-11-04

## Company selection (Window 1 → Window 3)

Canonical details: [Company Selection Contract](../../trading/COMPANY_SELECTION_CONTRACT.md).

- Pool: `buildCompanySpotlightPool(countryNames, adminState, catalogue?)`.
- Selection: `nextCompanySpotlight(pool, priorState, userId, packageName, repeatPolicy)`.
- Source record type: `CompanyReferenceRecord` from `server/modules/company-catalogue-reference.ts`.
- Admin state: `CompanyCatalogueAdminState`; persisted key `trade.companyCatalogue.adminState`.
- Repeat policy: `avoid_until_exhausted` or `allow_repeats`.
- Empty pool means continue the non-financial opportunity without a company identity.
- Cursor and opportunity snapshot must commit or roll back together.

No company ID, ticker, logo, country folder or admin display approval authorizes financial execution.
