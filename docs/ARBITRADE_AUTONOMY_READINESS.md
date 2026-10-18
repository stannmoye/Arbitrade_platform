# ARBITRADE autonomy readiness and release gates

## Target outcome

Automate routine development, testing, bounded repair attempts, progress reporting, and staging acceptance so the owner primarily reviews decisions and authorizes production release. This is a target design, not a claim that every layer is already active.

## Layer-by-layer readiness

| Layer | Required capability | Current evidence | Status |
|---|---|---|---|
| 1. Repository/task source | Versioned code, prioritized task queue, documented acceptance criteria | Stage 1 queue and evidence rules are present on draft PR #65 | IMPLEMENTED IN DRAFT PR; NOT MERGED |
| 2. Workstream separation | Independent, bounded tasks; avoid overlapping edits to shared files | Queue tasks are scoped; parallel execution and conflict handling are not verified | PARTIAL |
| 3. CI validation | Tests, type checks, build/install/migration checks on relevant changes | Installer validation run #456 passed on PR #65 head; coverage still needs database-backed wallet concurrency and full staging acceptance | PRESENT; COVERAGE INCOMPLETE |
| 4. Coding agent | Agent reads repo, edits source/tests, returns a reviewable patch | Existing worker run [39147213345](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39147213345) failed with an explicit API quota-exceeded error; no patch was published | BLOCKED ON API QUOTA |
| 5. Orchestration | Select next eligible task only after prior validation passes | PR #65 proposes a guarded `workflow_run` chain with a five-task cap; PR remains draft and chain is not active | WIRED IN DRAFT PR; NOT ACTIVE |
| 6. Failure recovery | Diagnose failed checks and bounded retries, then stop/escalate | Repair-only follow-ups are capped at two; repeated failure, empty patch, stale revision, disallowed paths, and chain limit stop work. End-to-end repair behavior is unverified | PARTIAL |
| 7. Progress dashboard | Report task, commit, CI run, blockers, and next task from evidence | Dashboard run [#26](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39152520796) passed on PR #65 head | IMPLEMENTED IN DRAFT PR; VERIFIED ON THAT REVISION |
| 8. Independent quality gates | Scope validation, review, security and financial acceptance | Patch path allowlist and stale-head guard exist; full security and financial acceptance gates remain incomplete | PARTIAL |
| 9. Staging acceptance | Isolated browser/API/database testing, backup/restore, migration validation | Some disposable database validation exists; complete end-to-end acceptance is not verified | PARTIAL |
| 10. Protected production release | Separate human authorization for production changes | No production deployment performed; this must remain a human gate | REQUIRED SAFETY GATE |

## Safe development loop

1. Read the queue and current progress report.
2. Verify branch head and required checks.
3. Select one highest-priority unblocked task.
4. Run the coding agent in an isolated workspace with least-privilege permissions.
5. Accept only allowed source/test/documentation paths; reject deletions and stale patches by default.
6. Run focused tests, then full CI on the exact candidate commit.
7. If validation fails after an automatic task commit, run a repair-only task with captured failure logs; allow at most two repair attempts, then stop and report. Never launch a new feature task on a failed candidate.
8. After success, update the progress report with exact commit and workflow evidence.
9. Start another task only when the previous task's required checks have succeeded.
10. Never auto-merge, deploy, access production, or mutate real customer financial data.

## Activation blockers and operator actions

- **API quota:** The worker run linked above failed with “Quota exceeded. Check your plan and billing details.” An authorized repository owner must restore API quota/billing and verify limits before unattended coding can run. The GitHub connector cannot change provider billing or inspect the secret value. Do not paste the API key into chat.
- **Review and controlled first run:** PR #65 remains a draft and is not merged. Review the workflow wiring; after quota is restored, run one small test-only task on `integration/auth-installer-vps-safety` with automatic chaining disabled. Inspect the patch/logs and confirm validation on the exact resulting commit.
- **Enable chaining only after proof:** Set repository variable `ARBITRADE_AUTONOMOUS_WORKER_ENABLED` to `true` only after the supervised run succeeds and the reviewed workflow is merged. The proposed chain is capped at five consecutive tasks and allows at most two repair-only attempts.
- **Progress reporting:** Dashboard run #26 passed on the draft PR revision. The workflow must be merged to the default branch for its `workflow_run` trigger to report subsequent validation completions.
- **Production inputs:** The production host/database and several real financial product/provider decisions are still unresolved in `TODO.md` and `plan.md`. Production deployment cannot be reduced to a safe “push” until those gates are satisfied.

## Definition of “ready for production approval”

All of the following must be true:
- Required CI passes on the exact release candidate.
- Financial concurrency, idempotency, rollback and ledger reconciliation tests pass on supported database versions.
- Security review and authorization tests pass.
- Migration upgrade/fresh-install paths and schema drift checks pass.
- End-to-end staging journeys pass using isolated test data.
- Backup and restore are demonstrated; recovery/rollback instructions are tested.
- Monitoring and actionable alerts are verified.
- External settlement, FX, and payout flows are configured only where the provider and business rules are defined and tested; otherwise they remain disabled and visibly marked unavailable.
- No known critical/high unresolved security or financial correctness defect remains.
- Owner explicitly approves production deployment.

**A green CI run alone is never a production approval.**
