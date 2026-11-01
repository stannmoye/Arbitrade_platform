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
- Administrator customer-directory visibility of package ID, assignment ID, assignment status and terms version.

The script submits **no financial, wallet, trade-execution, trade-retry, allocation, transfer, or settlement mutations**. It toggles only the five administrator delivery controls (tier policy, pop-up delivery, company rotation, randomized timing, burst delivery), reads each value back from the real API/database, and restores the original value. Cleanup attempts every restoration independently and verifies that automatic financial execution remains OFF. The browser harness also fails if it observes a non-GET request to a matching financial-operation tRPC endpoint.

## Required isolated test environment

Run only against a dedicated, disposable, non-production Arbitrade deployment with test-only customer/admin accounts and no real customer or financial data. Do not point this script at production. Its `TRADING_ACCEPTANCE_ENVIRONMENT=non-production` value is an operator acknowledgement, not an independent proof of the target deployment's environment.

Provide these environment variables:

- `TRADING_ACCEPTANCE_BASE_URL`: absolute HTTP(S) URL of the isolated test deployment.
- `TRADING_ACCEPTANCE_ENVIRONMENT=non-production`.
- `TRADING_CUSTOMER_STORAGE_STATE`: Playwright storage-state JSON for a seeded, automatically eligible test customer.
- `TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE`: storage-state JSON for a distinct customer with no qualifying manual administrator credit.
- `TRADING_ADMIN_STORAGE_STATE`: storage-state JSON for a test administrator.
- `TRADING_ACCEPTANCE_CUSTOMER_EMAIL`: email of the eligible test customer as shown in the administrator directory.

The storage-state files must already exist in Playwright's `{ cookies, origins }` format. The script does not log in, create accounts, or seed database records. The eligible customer must have an active automatically assigned tier, a valid enabled delivery policy with tier policy, pop-up delivery, company rotation, randomized timing and burst delivery all initially enabled, and at least one reviewed open opportunity already delivered by the running worker; otherwise the popup acceptance check fails with a setup explanation. Keep these files and credentials outside Git and the repository.

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

Use test-only accounts, packages and opportunities. Preserve the JSON result and test logs as acceptance evidence.

## GitHub Actions staging runner

The manual workflow `.github/workflows/trading-authenticated-staging-acceptance.yml` runs this exact authenticated harness against an already-deployed isolated staging host. It is deliberately `workflow_dispatch` only and uses the protected GitHub Environment named `trading-staging`.

**GitHub workflow registration requirement:** GitHub only accepts `workflow_dispatch` events after the workflow file exists on the repository's default branch. A copy that exists only in PR #269 cannot yet be manually dispatched. To keep the application candidate unmerged while enabling the test, register this workflow through a separate workflow-only change to `main`; then dispatch that registered workflow from `main` with `expected_sha` set to the exact candidate commit deployed to isolated staging. Do not merge the application candidate solely to make the workflow dispatchable.

Configure the following **environment secrets** on that GitHub Environment. Never put their values in repository files, workflow inputs, commits, or issue comments:

- `TRADING_ACCEPTANCE_BASE_URL`: the isolated non-production deployment URL.
- `TRADING_CUSTOMER_STORAGE_STATE_JSON`: complete Playwright JSON state for the eligible seeded customer.
- `TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE_JSON`: complete Playwright JSON state for the unqualified seeded customer.
- `TRADING_ADMIN_STORAGE_STATE_JSON`: complete Playwright JSON state for the seeded administrator.
- `TRADING_ACCEPTANCE_CUSTOMER_EMAIL`: eligible test customer's directory email.

Configure environment protection (required reviewer approval) for `trading-staging`. Only authorized maintainers should be able to approve and dispatch this workflow. The workflow writes browser-state secrets to permission-restricted ephemeral runner files, removes them after the test, and does not upload them as artifacts. It uploads only the test report. The workflow input `expected_sha` must identify the exact commit deployed to staging, and the workflow checks out that SHA.

Before dispatch, provision a dedicated disposable non-production deployment at that exact SHA and seed:
1. An eligible customer whose tier was assigned from qualifying manual administrator wallet credits only.
2. A separate customer with no qualifying administrator credit.
3. A test administrator.
4. An open, reviewed, published opportunity already delivered by the running worker to the eligible customer.
5. Valid enabled delivery policy and package settings, with automatic financial execution OFF.

Do not point the workflow at production. The runner changes only the five delivery controls and restores their original values; use a disposable environment and verify automatic financial execution remains OFF. It does not invoke trade retry, execution, wallet, allocation, transfer or settlement mutations.

## Current validation status and limits

The generic Chromium browser-recovery job is a mocked-auth/static-client smoke test. Its 1,032 passing assertions do **not** prove authenticated API/database behavior. The authenticated harness described above has not yet run because the isolated staging deployment, seeded accounts, and protected environment secrets have not been provided. The authenticated wallet API integration against disposable MySQL/MariaDB databases is separate and does not exercise the full portal UI.

The authenticated staging check remains open until the manual workflow completes successfully and its report is reviewed. Do not treat workflow creation, secret configuration, a static preview, or a successful source CI run as hosted acceptance.