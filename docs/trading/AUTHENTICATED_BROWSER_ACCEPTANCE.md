# Authenticated Trading browser acceptance

## Purpose

`scripts/trading-ui-browser-acceptance.cjs` is the repository's real-browser acceptance harness for the customer and administrator Trading portals. It uses Playwright browser storage states and the application's real same-origin tRPC APIs. It does not intercept or mock API responses.

## Coverage

The current script exercises:

- An automatically eligible customer: server-derived package assignment and cumulative daily allowance, visible allowance matching API data, no customer package browse/activate controls, and rejection of the administrator-only package catalogue API.
- Customer refresh, a real browser network outage, stale-state suppression, and recovery through the real eligibility API.
- An unqualified customer: loading and genuine no-package state using a separate seeded account.
- Administrator Trade navigation and package-policy editor on desktop/mobile viewports.
- Real customer opportunities API response and visible popup rendering for a worker-delivered, open offer; any company identity shown must match the server-filtered verified-company result.
- All five persistent administrator delivery switches (tier policy, pop-up delivery, company rotation, randomized timing, burst delivery), each toggled and restored through the real API with database read-back; automatic financial execution must remain OFF.
- A valid bounded policy setting update, persisted read-back and reload, followed by restoration of the original value and verification.
- Rejection of an out-of-range policy update without changing persisted policy values or versions.
- Administrator customer-directory visibility of package ID, assignment ID, assignment status and terms version.

The script submits **no financial or wallet mutations**. It does submit temporary administrator policy-setting mutations and restores every changed value, plus one deliberately invalid policy mutation which must be rejected. It also toggles all five delivery controls OFF/ON or ON/OFF and restores their initial values; automatic financial execution must remain OFF.

## Required isolated test environment

Run only against a dedicated, disposable, non-production Arbitrade deployment with test-only customer/admin accounts and no real customer or financial data. Do not point this script at production. Its `TRADING_ACCEPTANCE_ENVIRONMENT=non-production` value is an operator acknowledgement, not an independent proof of the target deployment's environment.

Provide these environment variables:

- `TRADING_ACCEPTANCE_BASE_URL`: absolute HTTP(S) URL of the isolated test deployment.
- `TRADING_ACCEPTANCE_ENVIRONMENT=non-production`.
- `TRADING_CUSTOMER_STORAGE_STATE`: Playwright storage-state JSON for a seeded, automatically eligible test customer.
- `TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE`: storage-state JSON for a distinct customer with no qualifying manual administrator credit.
- `TRADING_ADMIN_STORAGE_STATE`: storage-state JSON for a test administrator.
- `TRADING_ACCEPTANCE_CUSTOMER_EMAIL`: email of the eligible test customer as shown in the administrator directory.

The storage-state files must already exist in Playwright's `{ cookies, origins }` format. The script does not log in, create accounts, or seed database records. The eligible customer must have an active automatically assigned tier, a valid enabled delivery policy, and at least one reviewed open opportunity already delivered by the running worker; otherwise the popup acceptance check fails with a setup explanation. Keep these files and credentials outside Git and the repository.

## Run

Install the repository's locked dependencies and the Playwright Chromium browser. Playwright is provisioned with `npx` in the existing CI workflow rather than declared as a direct application dependency, so expose its temporary package to Node with `NODE_PATH`:

```sh
npx --yes --package=playwright playwright install chromium
TRADING_ACCEPTANCE_BASE_URL=https://<isolated-test-host> \
TRADING_ACCEPTANCE_ENVIRONMENT=non-production \
TRADING_CUSTOMER_STORAGE_STATE=/secure/test-state/eligible-customer.json \
TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE=/secure/test-state/unqualified-customer.json \
TRADING_ADMIN_STORAGE_STATE=/secure/test-state/admin.json \
TRADING_ACCEPTANCE_CUSTOMER_EMAIL=eligible-customer@example.invalid \
npx --yes --package=playwright -c 'PLAYWRIGHT_MODULES="$(dirname "$(dirname "$(command -v playwright)")")"; NODE_PATH="$PLAYWRIGHT_MODULES" node scripts/trading-ui-browser-acceptance.cjs'
```

Use test-only settings and ensure the original retry-delay setting is valid (5–3600 seconds), because the script temporarily changes and then restores that value. Preserve the JSON result and test logs as acceptance evidence.

## Current validation status and limits

This harness is present in the branch, but its authenticated browser run is **not evidenced**. The current GitHub CI browser-recovery checks are mocked and must not be counted as a run of this harness. The authenticated wallet API integration is separate: it uses real signed sessions, the production tRPC router/context and disposable MySQL/MariaDB databases, but it does not exercise the full portal UI. The repository owner has explicitly accepted deferring this hosted-browser run because no test server is currently available; this is a documented acceptance waiver for the current merge, not a test pass.

A post-deployment verification run still requires an isolated non-production deployment and three seeded authenticated browser storage states. Keep credentials and storage-state files outside Git. This deferred check is not a blocker for the currently authorized merge; it remains a post-deployment acceptance item.