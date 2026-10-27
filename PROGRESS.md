# Progress

Last updated: 2026-10-27
Repository: [stannmoye/Arbitrade_platform](https://github.com/stannmoye/Arbitrade_platform)

## Approved behavior

- Trading package activation is free; the qualifying wallet balance is an eligibility threshold, not a package deposit or trade amount.
- Package activation creates an entitlement only. It does not debit or reserve funds or create a trade.
- The existing scheduled server worker is the only path that allocates eligible opportunities. Customer page refreshes and package activation do not trigger execution.
- Keep the existing customer package panel visible and report activation separately from trade execution.

## Work status

| Item | Status | Evidence / remaining review |
|---|---|---|
| Confirm repository and continuation point | WORKING | Base `main` is `8e610823941cb49f45e8bff0f35759994a395221`; PR #181 is merged. Current work continues on draft PR #202. |
| Keep activation separate from worker allocation | WORKING | PR #202 keeps customer activation/catalogue reads out of the allocation path; the scheduled worker explicitly opts in. Contract and recovery checks pass on the validated code commit below. |
| Preserve customer Trading package panel | WORKING | Panel stays mounted; activation messaging distinguishes entitlement from trade execution. Nullable activation dates now show a safe fallback. |
| Keep catalogue diagnostics contract aligned | WORKING | Stale assertions now match the current main-branch diagnostic/error contract; full application tests pass. |
| Route Trading Overview to recorded activity | COMPLETE | Trade Settings → Overview now opens the persisted opportunity lifecycle dashboard rather than the offer-configuration screen; a regression assertion is in `client/src/admin-navigation.test.ts`. |
| Flag reward-reservation/reward contradictions in recovery | COMPLETE | The read-only classifier escalates released-with-positive-reward and credited-with-zero-reward evidence to `MANUAL_FINANCIAL_REVIEW`; regression tests cover both cases. |
| Complete the broader Trading system | NEEDS FURTHER REVIEW | Worker-boundary, Overview routing, and reservation/reward recovery checks are done; settlement/replay idempotency, full ledger reconciliation, admin controls, and acceptance behavior remain under audit. |

## Verification

- Base branch/commit: `main` / `8e610823941cb49f45e8bff0f35759994a395221`.
- Validated code commit: `182f1b175ef9f16548ad3e94d36aaf9a7ca4ca02` on `fix/trading-worker-only-allocation-20261027`.
- `pnpm check`: PASS in GitHub Actions (TypeScript validation).
- `pnpm test`: PASS — 90 test files passed, 3 skipped (93 total).
- `pnpm build`: PASS in the production-source workflow.
- Customer portal real-browser recovery checks: PASS; artifact `customer-portal-browser-acceptance` (ID `12768879236`).
- Installer and migration regression tests, fresh MariaDB and MySQL compatibility/recovery checks, production build/bundle budget/server smoke, deployment-package validation, Mining regression checks, and Trading recovery checks: PASS.
- All five workflow groups completed successfully for the validated code commit:
  - [Trading recovery](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40581873424)
  - [Production source build and tests](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40581873243)
  - [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40581873155)
  - [Mining regressions](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40581873157)
  - [Application verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40581873162)
- Latest recovery-classification code/test commit: `026da0cad938ac6fcdbcd899e274fb706b6afb79`; all 14 reported GitHub checks completed successfully, including the browser recovery check. [Primary validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40588181514) · [Operational validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40588181402) · [Typecheck/build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40588181476)
- Latest overview-route code/test commit: `be8976bdc515c49bad82ec29c2977fd870b65fef`; all 14 reported GitHub check runs completed successfully, including TypeScript, application unit tests, production build/smoke, browser recovery, installer/migration, MySQL/MariaDB compatibility, deployment-package, and Mining regression checks. [Primary validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40586408341) · [Operational validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40586408170) · [Install/type/test/build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40586408186)
- The earlier exact-head failures were a nullable activation timestamp passed to `Date` and stale catalogue diagnostic assertions; both are fixed in the validated code commit.
- No production deployment, production database change, live trade, or financial balance change was performed.

## Current GitHub state

- [PR #202](https://github.com/stannmoye/Arbitrade_platform/pull/202) is open and remains a draft against `main`.
- Validated code/test commits: worker-boundary `182f1b175ef9f16548ad3e94d36aaf9a7ca4ca02`; overview routing `be8976bdc515c49bad82ec29c2977fd870b65fef`; recovery classification `026da0cad938ac6fcdbcd899e274fb706b6afb79`. This progress entry is a documentation-only follow-up.
- Draft PR #200 proposes package/deposit behavior that conflicts with the approved free-activation model above; no changes from that draft were applied in this recovery fix.
- Nothing has been merged or deployed.

## Next work

1. Continue the settlement retry/idempotency audit alongside open PR #197’s timing-schema repair; do not duplicate its migration work.
2. Continue admin Trading controls and acceptance review; resolve PR #200’s competing package-model proposal before making package-policy changes.
3. Keep production and live-trading operations out of this coding/verification work.
