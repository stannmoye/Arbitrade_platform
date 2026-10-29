# Trading Implementation Coordination — Part 5

**Owner:** PART 5 — TRADING UI & END-TO-END ACCEPTANCE  
**Scope:** Customer/admin Trading presentation and read-only browser acceptance.  
**Canonical product contract:** `docs/TRADING_SYSTEM_SPECIFICATION.md` and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`.  
**Issue:** [#228](https://github.com/stannmoye/Arbitrade_platform/issues/228)

## Authoritative UI policy

- Customer accounts cannot browse a package catalogue, choose a tier, subscribe, purchase, activate, or manually start/stop Trading.
- The customer Trading page is informational and reads server-owned eligibility and cumulative daily allowance through the existing `customer.tradingEligibility` tRPC query. Only the highest active assigned tier and the next enabled milestone may be presented, in line with the canonical specification; never expose an activation action.
- Qualification is based only on distinct, persisted qualifying credits manually issued by an authorized administrator through the admin Credit Customer / wallet-credit flow and recorded as `admin_manual_deposit_credit`, with credit-time USD attribution. Other credit sources are excluded.
- Admin configuration and financial actions remain server-authoritative, authorized, validated, audited and persisted. Customer UI must not infer trade execution, settlement or realized profit from a timer, animation, catalogue entry or local UI state.
- Opportunity cards must use persisted server records and their saved snapshots. An unavailable status or missing persisted field must be presented as unavailable/pending, not invented.

## Existing contracts observed

- Customer eligibility component: `client/src/components/CustomerTradingEligibility.tsx`.
- Customer eligibility route: `customer.tradingEligibility` in `server/routers.ts`; it rejects non-customer roles with `FORBIDDEN`.
- Admin navigation group: `client/src/admin-navigation.ts`, with **Trade Settings** and **Packages & Eligibility** entries.
- The customer eligibility component polls the existing API and includes loading, error, manual refresh, current eligibility, next milestone and total allowance states.
- Do not create duplicate endpoints for package settings or opportunities. Parts 1–4 own their respective server policy, FX, worker and company-rotation contracts; request coordination before touching their files.

## Part 5 acceptance additions

- `server/trading-ui-policy.contract.test.ts` provides source-level regression guards only. It is not a browser or database end-to-end test.
- `scripts/trading-ui-browser-acceptance.cjs` is a read-only Playwright acceptance runner. It connects to a running deployment without intercepting API routes, requires existing customer/admin authenticated storage-state files, checks customer eligibility through the real tRPC endpoint, verifies that customer activation controls are absent, and checks admin Trade Settings navigation.
- Required environment for the browser runner: `TRADING_ACCEPTANCE_BASE_URL`, `TRADING_CUSTOMER_STORAGE_STATE`, and `TRADING_ADMIN_STORAGE_STATE`. Do not commit storage states, cookies, credentials, or customer data.
- Run the browser runner only against a dedicated acceptance environment with seeded test accounts and a disposable/non-production database. The current runner performs read-only UI checks and does not create credits, packages, opportunities, trades or settlements.

## Remaining acceptance gaps

1. Verify exact current `main` SHA and reconcile this branch with the open Parts 1–4 PRs before final acceptance.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, and `pnpm build` on the exact final branch SHA.
3. Execute the browser runner with real authenticated test accounts against a dedicated acceptance deployment; save CI logs/screenshots as evidence.
4. Add or link database-backed journeys that verify administrator settings save/reload and customer eligibility/opportunity data reflect persisted records, without relying on UI source string checks.
5. Verify forbidden-role API access, invalid admin forms, empty states, API failure/retry, stale data refresh, and customer/admin navigation at mobile and desktop viewports.
6. Coordinate opportunity display snapshots with Part 4 and worker lifecycle status with Part 3; coordinate editable settings with Part 1.
7. Keep the PR unmerged and do not deploy until acceptance gates are green and reviewed.

## Current Part 5 status

- **Implemented:** focused customer UI/API policy contract test; read-only real-API browser acceptance runner; this coordination document.
- **Tested:** GitHub Actions results must be checked for the exact current head; no local execution is claimed.
- **Pending:** run browser acceptance in an authenticated disposable environment; add direct persisted admin-setting and opportunity lifecycle assertions; complete responsive/error/recovery coverage.
- **Blocked:** a full end-to-end result cannot be claimed until the runner is executed against the application and database with valid test sessions.


## 2026-10-29 — Browser acceptance runner correction

- Corrected the customer-page heading locator: “Your Trading Journey” is an eyebrow label, while the actual heading is “Package progress”. The previous locator would time out despite the component being rendered.
- Strengthened the tRPC response assertion so an HTTP 2xx response is not treated as success when the body contains a tRPC error or lacks result data.
- Validation boundary: this correction is source-reviewed only. The runner has not been executed with authenticated test sessions; exact-head CI and browser results must be checked before acceptance.


## 2026-10-29 — Additional browser acceptance coverage

- Extended the read-only browser runner to verify the customer eligibility heading remains visible at desktop (1365×900) and mobile (390×844) viewport sizes.
- Added a negative authorization probe using the authenticated administrator session against the customer-only eligibility tRPC endpoint. The runner requires a 403 or tRPC `FORBIDDEN` response and asserts no eligibility result data is returned.
- These are newly added checks, not passing results: the dedicated runner still requires a running acceptance deployment and valid authenticated customer/admin storage-state files. Exact-head CI for this increment must be checked separately.
