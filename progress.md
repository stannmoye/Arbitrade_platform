# Development Progress — Arbitrade Platform

**Last reviewed:** 2026-10-28  
**Repository:** [stannmoye/Arbitrade_platform](https://github.com/stannmoye/Arbitrade_platform)  
**Canonical source:** main (verify the current 40-character SHA before each change or build)

## Current continuation point

The initial Trading-package CI repair is complete. Continue from `fix/trading-package-ci-2026-10-27`, which was branched from canonical `main` at `8e610823941cb49f45e8bff0f35759994a395221`; PR #181 was merged on 2026-10-26 and its older feature branch is not the canonical source. At the start of this follow-up, GitHub reported `main` at `8e610823941cb49f45e8bff0f35759994a395221` and open PR #203 at `4a1b498428d2fcad31f39b2194e100179de9e7d4`, with all 14 check runs successful on that exact head. This follow-up continues the Trading Settings route audit on PR #203; its new code/test head must receive fresh CI verification.

On the baseline main SHA, all four GitHub Actions workflows failed:

- [Installer validation #40557774300](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40557774300): TypeScript failed because `CustomerTradingPackages.tsx` passed nullable `activatedAt` to `new Date`; two catalogue contract assertions still expected an obsolete generic error string. Migration tests, fresh MariaDB/MySQL checks, and production build/smoke jobs passed in that run.
- [Mining regression #40557774383](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40557774383): the same catalogue contract test failure.
- [Verify application #40557774308](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40557774308) and [Build and test #40557774303](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40557774303): TypeScript failed on the nullable activation date.

## Changes on the current work branch

- The customer package history now shows “Activation date unavailable” when the stored activation timestamp is null; valid timestamps keep their existing display. Commit: `136985524c34e37420dfdcbb8f4be2b9dabd593f`.
- The catalogue diagnostics contract test now expects the existing sanitized, phase-specific error message rather than the old generic message. Commit: `70c75eb2f192e79390f8f6308736218fa7b2f496`.
- Added this handoff convention to `AGENTS.md` and the repository guide so future sessions discover and verify this file. Commits: `6eabb9b93bac1195d0178820c7149a0b0c3a43cb` and `70aac5392ac5fa50ff56ced2707bcba343048138`.
- PR #203 is open and unmerged. The exact code/test head `e5a3b6a3dc7a8f8882acc10d483f8594ea38e5f4` passed all five GitHub Actions workflows:
  - [Installer validation #40595242266](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40595242266)
  - [Verify application #40595242269](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40595242269)
  - [Trading recovery verification #40595242285](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40595242285)
  - [Mining regression #40595242385](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40595242385)
  - [Production source build and test #40595242386](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40595242386), including type-check, automated tests, production build, and customer-portal browser acceptance.
- This progress update is documentation-only; no application source or test files changed after the validated code/test head above. Resolve PR #203's live head and check its current Actions state before starting additional work.

## Verified project decisions and boundaries

- The canonical Trading specification and `AGENTS.md` were read at main SHA `8e610823941cb49f45e8bff0f35759994a395221`.
- The approved model is internal-ledger trading; an external broker is not a prerequisite. This does not permit simulated or estimated outcomes to be recorded or shown as real profit. Actual results must be durable, evidence-backed, auditable, and reconciled to the customer ledger.
- No Trading business rule, money movement, database migration, live trade, production database, or deployment was changed in this work.

## Existing progress documents

There was no root `progress.md` on main at the starting SHA. `docs/ARBITRADE_STAGE_1_PROGRESS_2026-10-18.md` is a historical Stage 1 report focused on older Mining/installer work; its progress percentage is not a current Trading completion estimate. Do not use it as current status.

## Next steps

1. Resolve PR #203's latest head SHA and check its GitHub Actions results; required checks are `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, and `pnpm build`.
2. Fix any remaining failures, then verify the new exact SHA rather than reusing older run results.
3. Review PR #203's final diff and status. Do not merge, deploy, touch production data, or initiate live trades without the appropriate authorization.
4. Continue the broader Trading audit in small steps, following `AGENTS.md`, `BUILD_SOURCE.json`, `BUILD_AND_RELEASE.md`, `docs/REPOSITORY_GUIDE.md`, and `docs/TRADING_SYSTEM_SPECIFICATION.md`. Record each code change, exact SHA, test outcome, and next concrete task here. Do not invent an overall completion percentage.


## Continuation update — 2026-10-28

- Re-verified canonical `main` at `8e610823941cb49f45e8bff0f35759994a395221` and PR #203 at `daa61cbb40f39a827788e96cf81b19417b79d97f` before this follow-up. PR #203 remains open/unmerged; all 14 check runs and all five workflow groups passed on that exact head.
- This follow-up adds a pure customer package activation-date formatter and focused regression tests for missing, malformed, and valid dates. It changes presentation only; no eligibility, allocation, ledger, migration, or settlement behavior changes. The exact code/test head `414995fc7b254838b784ef6d23d2f6a12df3ac2a` completed with all 14 GitHub check runs successful, covering app tests, TypeScript, migration regression, fresh MariaDB/MySQL compatibility, production builds, and browser recovery. See [application validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40598736879), [build and test](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40598736982), and [browser recovery](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40598736885).
- Verified PR #202 separately at `80b0884f3cdabe6219d7285e3683e9cf108c18ea`: all 14 reported checks passed. Its worker-only allocation boundary and settlement wallet precision work remain in an open draft PR and are not yet part of `main`.
- PR #197 proposes migration `0079_trade_settlement_timing_schema_repair.sql`; draft PR #200 independently proposes `0079_internal_ledger_execution_mode.sql` and package-policy changes that differ from the current canonical model. Do not combine either migration or adopt the draft policy without resolving the branch/specification conflicts.
- Admin navigation audit: the package/eligibility editor was already mounted on the `packages` screen, so no duplicate was added. The Profit/Fees menu item previously opened the opportunity engine even though the realized-fee editor is on Transaction Review; this change points it to that editor and adds an executable contract test. No financial policy or money movement changed.
- Navigation fix/test commit `2d22e33064ff1c1182bb97cc00658c490da71a39` completed with all 14 GitHub check runs successful, including application tests, TypeScript, migration regression, MariaDB/MySQL compatibility, production builds, and browser recovery. See [application and migration checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40635880948), [type-check/test/build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40635881000), and [browser recovery](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40635880972). PR #203 remains open and unmerged; the later retry-audit commits and their validation are recorded below.
## Follow-up — 2026-10-28 — retry audit

- On PR #203 branch `fix/trading-package-ci-2026-10-27`, updated `server/modules/trade-execution-retry.ts` to inspect a bounded, cycle-safe chain of nested error causes. This preserves the existing transient-code allowlist and the existing attempt/delay policy; it only recognizes known transient errors when a driver wraps them.
- Added regression coverage for a wrapped `ETIMEDOUT`, a transient nested message, and a cyclic cause chain. Source commit: `9866c1b7a6966797943f1c8d27339f1c224f676b`; test commit: `714d1dbdb8112c247d8290e082ac429a433d81e5`.
- Exact test commit `714d1dbdb8112c247d8290e082ac429a433d81e5` completed with all 14 GitHub checks successful, including TypeScript validation, application unit tests, production build/smoke, installer/MariaDB/MySQL compatibility, Mining regression, Trading recovery, and browser recovery. [Production build and browser-recovery run](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40639860710) · [Application verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40639860744) · [Trading recovery](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40639860714) · [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40639860706) · [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40639860702).
- Retry navigation was corrected in later commits on PR #203: it now opens focused package retry settings and clearly states that carry-forward controls are not implemented. This supersedes the earlier routing observation in this historical audit.
- PR #203 remains open and unmerged. PR #202’s worker-only allocation boundary remains a separate open draft; no merge, production deployment, database change, or live trade was performed.

- Next: audit the Trading Overview and Trade Duration & Closing Rules destinations against real database-backed screens; keep unsupported metrics and controls out of the menu. Recheck open PR heads and exact-SHA CI before further edits.


## Follow-up — 2026-10-28 — customer display settings route

- Verified canonical `main` at `8e610823941cb49f45e8bff0f35759994a395221` and PR #203 at `4a1b498428d2fcad31f39b2194e100179de9e7d4` before editing; all 14 check runs were successful on that prior head.
- Mapping audit found `Trade Pop-up & Customer Display` pointed to the read-only persisted delivery-lifecycle report, while the existing package policy editor owns `popupDisplayTargetSeconds` and `completionDisplaySeconds`.
- This change routes the menu item to a focused, per-package display editor that exposes only those existing presentation fields and clarifies they do not alter allocation, execution, or settlement. It reuses the existing versioned package-policy mutation; no policy, ledger, migration, or worker behavior changes.
- Added navigation and source-contract regression coverage for the focused route and display fields.
- The first display-route commit `fdb21f23cf1beef1fdd2d28384743535d56c6d00` failed because of an extra JSX closing tag and a stale retry-contract assertion; both were fixed in `f07a1c820648b59b6c7a36ec908f97fbd2299471`. All 14 GitHub Actions check runs passed on that exact code/test SHA, including TypeScript, application tests, installer checks, production build/smoke, and browser recovery. No merge, deployment, production data change, or live trade was performed.
- Next: validate the overview and duration-route alignment changes below on their exact PR head, then audit the remaining Trade Settings destinations against real persisted functionality.


## Follow-up — 2026-10-28 — overview and duration route alignment

- Baseline before this increment: PR #203 code/test commit `f07a1c820648b59b6c7a36ec908f97fbd2299471` had 14/14 successful GitHub Actions check runs.
- Audit confirmed both Overview and Trade Duration & Closing Rules opened the general Opportunity Engine. The duration control there creates an individual offer; it is not the persisted settlement-timing policy.
- Overview now uses the existing admin-protected database queries for open opportunities, enabled package policies, rolling 24-hour lifecycle events, manual settlement queue, and global allocation gate. Metrics are read-only and display unavailable sources separately from zero; calendar-day totals, complete in-flight status, and worker/provider health are not inferred.
- Duration & Closing Rules now opens a focused view of the existing persisted settlement estimate, wallet-credit delay, cooldown, and block-until-settled controls. The view explains that schedule time is not proof of execution or settlement; unrelated settings are hidden in this focused route.
- Added client navigation and source-contract coverage. No financial business logic, worker behavior, schema, or external provider configuration changed.
- CI for the new code/test commit is pending and must be checked on its exact SHA. PR #203 remains open; no merge, deployment, database write, or live trade was performed.
- Remaining: duration fields are global timing policy only; verify any per-package duration/close-policy support before exposing it. Extend the overview only when calendar-day activity, full in-flight work, exceptions, or worker-health data have a trustworthy persisted source.

## Follow-up — 2026-10-28 — route alignment CI repair

- Re-verified canonical `main` at `8e610823941cb49f45e8bff0f35759994a395221` and open PR #203 on `fix/trading-package-ci-2026-10-27`, head `8ce54747f09fa65dc174aedb0e55d72d4a119b11`; `progress.md` was read from that PR branch, not `main`.
- Read the PR-branch `AGENTS.md` and the canonical `BUILD_SOURCE.json`, `BUILD_AND_RELEASE.md`, repository guide, and full Trading specification before changing Trading settings UI.
- All five Actions workflows failed on head `8ce54747f09fa65dc174aedb0e55d72d4a119b11`. The repeated type-check/build errors point to JSX syntax in `client/src/App.tsx`; the MySQL/MariaDB installer jobs completed migrations and then failed at the same production build parse error. The application unit-test job passed; other dependent checks were skipped after type-check failure.
- Root causes found: `CustomerYieldStrategies` had a stale `!focus` condition without a `focus` prop and a missing JSX expression close; `AdminSettings` rendered its settings tab strip without a matching condition close.
- Fix: restore the customer strategy filter tabs as normal content, hide the unrelated ticket/email/password tabs and panes when `AdminSettings` is rendered with `focus="tradeDuration"`, and add a contract assertion that the focused route exposes only its settlement-timing pane.
- This increment is presentation/navigation-only. No trade rules, financial values, database schema, ledger, worker, or production data are changed. No merge, deployment, or live trade was performed.
- Verification for the new exact branch head is pending; wait for GitHub Actions on the resulting code/test commit and record those exact-SHA outcomes here.


## Follow-up — 2026-10-28 — keep the trading overview read-only

- Revalidated canonical main at 8e610823941cb49f45e8bff0f35759994a395221 and PR #203 branch fix/trading-package-ci-2026-10-27 at fc4b8ff94306c3531647b30f8db432f793ec2256; all 14 reported checks were successful on that baseline.
- Found that the Overview's prior packagePolicies query called listOpportunityPackagePolicies(), which lazily inserts missing default rows. That contradicted the page's read-only snapshot description.
- Added a separate admin-protected overviewPackagePolicies query backed by listPersistedOpportunityPackagePolicies(), a SELECT-only reader of existing rows. The package editor retains its existing default-seeding behavior. Added a contract regression test for the Overview's read-only data path.
- Timing audit across the current branch: package-level minSettlementDelaySeconds / maxSettlementDelaySeconds are persisted and used to derive settlement timestamps; they are not a package trade-close duration. Offer durationSeconds belongs to an individual opportunity. closePolicy is persisted and validated but no runtime consumer was found in the inspected server/client source, so it is not presented as an effective control.
- This increment changes only the Overview read path and tests/docs; no schema, ledger, worker, trading, or financial behavior changes. Exact-SHA verification for the new commit is pending. No merge, deployment, production database change, or live trade was performed.
- Next: continue the Trade Settings audit against real persisted capabilities; keep actual trade close-duration policy pending until server-owned close-time fields and their effective-time behavior are implemented and verified.

## Verification — 2026-10-28 — read-only overview package-policy query

- Code/test commit verified: 6cc2f27ffad80ce43e6956799c46ace5312439ca (overview now reads persisted package-policy rows through an admin-protected SELECT-only query; default seeding remains in the package editor path).
- All five workflow groups completed successfully on this exact SHA:
  - Verify application: https://github.com/stannmoye/Arbitrade_platform/actions/runs/40647469499
  - Build and test production source: https://github.com/stannmoye/Arbitrade_platform/actions/runs/40647469595
  - Mining regression checks: https://github.com/stannmoye/Arbitrade_platform/actions/runs/40647469614
  - Verify Arbitrade trading recovery changes: https://github.com/stannmoye/Arbitrade_platform/actions/runs/40647469535
  - Installer validation: https://github.com/stannmoye/Arbitrade_platform/actions/runs/40647469556
- All 14 reported check runs completed successfully, including TypeScript validation, application tests, production build/smoke, browser recovery, installer and MySQL/MariaDB checks, deployment-package validation, Mining regression, and Trading recovery.
- These results apply to code/test SHA 6cc2f27ffad80ce43e6956799c46ace5312439ca. This handoff update is documentation-only; verify Actions against its resulting head before treating that newer head as validated.
- PR #203 remains open and unmerged. No deployment, production database operation, or live trade was performed.

## Current handoff — 2026-10-28

- Canonical source is `main` at `bf940d02baeb39c92fed66eeea7ed44b1843119f`. PR #197 was merged as `bf940d02`; all five workflows passed on its refreshed head `528600ce`, and all four main-branch workflow groups passed on the resulting main SHA.
- PR #203 is merged; older status notes below that call it open are superseded by this handoff.
- The approved Trading eligibility model is free balance-threshold activation: the qualifying balance is not a fee or trade capital. Activation must only create the entitlement/audit record; only the scheduled worker may allocate trades.
- PR #202 is being reconciled onto the latest main with the worker-only allocation gate, safe settlement-wallet arithmetic, recovery classification, and truthful activation messaging. Its exact updated head still needs fresh CI before merge.
- PR #200 is not included wholesale: its deposit-tier documentation conflicts with the approved model, and its `0079` migration conflicts with the merged settlement repair. Review only compatible, separately verifiable changes.
- No production deployment, production database operation, balance/ledger change, or live trade was performed.
- Next: verify the exact PR #202 head, resolve any CI failures, and merge only after all required checks pass; then review remaining safe Trading work separately.


### Additional integrity review — 2026-10-28

- Removed generated transaction-console pulses; no pulse is emitted without a confirmed ledger-backed event. Regression coverage now asserts `NO_CONFIRMED_LEDGER_EVENT`. Exact final-head CI is pending.
- PR #200 was not merged wholesale: its deposit-tier documentation conflicts with the approved free-activation model, and its `0079` migration conflicts with the merged settlement-timing repair. Its proposed shutdown of automatic offer generation was also kept out because it changes opportunity availability; review the market-derived estimate path separately before changing that behavior.
- Time-based reconciliation only marks due trades as awaiting settlement confirmation; it does not credit an estimated reward. A manual settlement path still requires an explicit settlement reference. No production deployment, database operation, balance change, or live trade was performed.

## Verified continuation — 2026-10-28 — free activation and worker-only allocation

**Working branch:** `fix/trading-worker-only-allocation-20261027` (draft PR #202).
**Code/test SHA:** `4fe1c696973574c9ae0a1dec651fb014124e6cfb`. The earlier pending-CI notes above are superseded: all 14 reported check runs on this exact code/test commit completed successfully. Workflow runs: [application/build checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40651541203), [type-check/test/build and browser recovery](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40651541356), [install/type-check/test/build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40651541169), [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40651541079), and [typecheck/tests/production build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40651541058).

### WORKING — source contract and exact-head CI verified

- Free activation checks the customer’s qualifying available wallet balance and creates the package entitlement/audit record only; activation does not debit funds or call opportunity processing.
- Customer opportunity reads default to non-worker mode. Due-trade processing and automatic allocation are gated behind `workerCycle === true`.
- The existing scheduled server worker calls `runAutoTradeCycle()` and is the only code path that opts into worker processing.
- The customer package panel is imported and mounted on the customer dashboard. Its activation message does not claim that a trade was created.
- `server/trading-worker-boundary.contract.test.ts` covers activation separation, read-only customer queries, worker opt-in/scheduling, and the mounted panel.

### NEEDS FURTHER REVIEW

- These results verify source and CI only; no hosted acceptance, production database, customer balance, deployment, or live trade was exercised.
- PR #202 remains open and unmerged. PR #200 remains open/draft with conflicting deposit-tier documentation and a removed dashboard panel; do not merge it as-is. Its migration conflict is documented above.
- Continue the remaining Trading-spec audit in small, evidence-backed increments. Record exact code/test SHA and checks for each increment; do not claim full application readiness from this slice.

### Next

1. Reconcile or close the obsolete PR #200 draft only after confirming no unique wanted changes would be lost.
2. Continue auditing the remaining required Trading Settings routes and persisted behavior against the canonical guide.
3. Keep merge, production deployment, production database changes, and live trades out of scope unless separately authorized.
