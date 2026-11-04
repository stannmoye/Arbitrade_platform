# Window 7 — Integration Handoff

**Updated:** 2026-11-04  
**Window 3 branch:** workstream/3-automatic-opportunity-engine  
**Base dependency:** Window 1 generation implementation from PR #278, branch feat/automatic-template-opportunities.

## Window 3 implementation handoff

Window 3 extends the existing generator with a missing company-neutral path required by Window 1's new company-selection contract.

### Exact changes

- server/modules/opportunity-generation-template.ts: adds createUnattributedCatalogueOpportunityTemplate; generation terms allow a nullable company reference while admin-managed templates still require a valid Logo ID.
- server/db.ts: no longer aborts generation when the approved company pool is empty; skips rotation and template lookup in that case; persists null company identity and avoids resolving null IDs in the admin monitor.
- drizzle/schema.ts: makes only opportunity_generation_assignments.companyReferenceId nullable; the company template table remains strict.
- drizzle/0106_company_neutral_opportunity_assignments.sql: forward migration to align the assignment column with the company-neutral contract.
- drizzle/meta/_journal.json: registers migration 0106 after 0105.
- server/modules/opportunity-generation-template.test.ts and server/opportunity-generation.contract.test.ts: cover neutral term selection and nullable persistence.

### Integration instructions

1. Integrate the Window 1 company contract and Window 2 package-policy interface without creating duplicate selectors or policy services.
2. Review server/db.ts against Window 2 package-policy changes and Window 6 worker-failure monitoring changes; preserve their logic.
3. Keep Window 4's existing delivery lifecycle as the sole delivery owner. A company-neutral offer must pass through the same existing delivery lifecycle.
4. Verify generated offer and assignment rows persist with null company identity when the eligible company pool is empty; verify no template query or rotation cursor mutation occurs for that case.
5. Verify the same generation key is idempotent and package policy terms are unchanged on retry/restart.
6. Validate migration 0106 after 0105 on MySQL 8.4 and MariaDB 11.4, including upgrade with historical non-null assignments.
7. Run pnpm install --frozen-lockfile, pnpm check, focused generation tests, pnpm test, pnpm build, migration validation and existing worker/delivery integrations on the final integrated SHA.
8. Run authenticated customer/admin browser acceptance on a dedicated staging deployment. CI alone does not prove hosted pop-up display.

## Safety and rollout

No wallet/ledger, trade execution, customer-fund allocation, result determination or settlement behavior is added or enabled. No production migration, deployment, or hosted acceptance is claimed by this branch. Window 7 owns final integration and merge authority.
