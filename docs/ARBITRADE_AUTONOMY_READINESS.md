# ARBITRADE autonomy readiness and release gates

## Target outcome

Automate routine development, testing, bounded repair attempts, progress reporting, and staging acceptance so the owner primarily reviews decisions and authorizes production release. This is a target design, not a claim that every layer is already active.

## Layer-by-layer readiness

| Layer | Required capability | Current evidence | Status |
|---|---|---|---|
| 1. Repository/task source | Versioned code, prioritized task queue, documented acceptance criteria | Stage 1 queue and evidence rules added in this PR | IMPLEMENTED IN PR |
| 2. Workstream separation | Independent, bounded tasks; avoid overlapping edits to shared files | Queue tasks are scoped; parallel execution is not yet verified | PARTIAL |
| 3. CI validation | Tests, type checks, build/install/migration checks on relevant changes | Installer validation workflow exists; current PR validation is running | PRESENT; coverage still incomplete |
| 4. Coding agent | Agent reads repo, edits source/tests, returns a reviewable patch | Codex Actions worker exists; previous attempt hit API quota exhaustion | BLOCKED ON API QUOTA |
| 5. Orchestration | Select next eligible task only after prior validation passes | PR proposes push-validation-triggered follow-on guarded by `ARBITRADE_AUTONOMOUS_WORKER_ENABLED`, with a five-task cap | WIRED IN PR; NOT ACTIVE |
| 6. Failure recovery | Diagnose failed checks and bounded retries, then stop/escalate | Worker stops on failed validation, empty patch, stale revision, disallowed paths, and five-task cap; end-to-end behavior not yet verified | PARTIAL |
| 7. Progress dashboard | Report task, commit, CI run, blockers, and next task from evidence | `.github/workflows/autonomy-progress.yml` completed successfully on PR head during run #4 | IMPLEMENTED IN PR; VERIFIED ON THAT REVISION |
| 8. Independent quality gates | Scope validation, review, security and financial acceptance | Worker patch allowlist and stale-head guard exist; full release/security gates remain incomplete | PARTIAL |
| 9. Staging acceptance | Isolated browser/API/database testing, backup/restore, migration validation | Some disposable DB validation exists; full end-to-end acceptance not verified | PARTIAL |
| 10. Protected production release | Separate human authorization for production changes | No production deployment performed; must remain a human gate | REQUIRED SAFETY GATE |

## Safe development loop

1. Read the queue and current progress report.
2. Verify branch head and required checks.
3. Select one highest-priority unblocked task.
4. Run the coding agent in an isolated workspace with least-privilege permissions.
5. Accept only allowed source/test/documentation paths; reject deletions and stale patches by default.
6. Run focused tests, then full CI on the exact candidate commit.
7. If validation fails, stop and report; do not launch another coding task. Repair must be an explicit, bounded follow-up.
8. After success, update the progress report with exact commit and workflow evidence.
9. Start another task only when the previous task's required checks have succeeded.
10. Never auto-merge, deploy, access production, or mutate real customer financial data.

## Activation blockers and operator actions

- **API quota:** The current coding worker uses `OPENAI_API_KEY`. The prior worker attempt failed with a quota-exceeded error. An authorized repository owner must restore API quota/billing and verify limits before unattended coding can run. Do not paste the key into chat, commits, issues, or logs.
- **Merge and controlled first run:** Review and merge the workflow wiring, then run one small test-only task manually on `integration/auth-installer-vps-safety` with the automatic-worker variable disabled. Inspect the patch and logs and confirm validation on the exact resulting commit.
- **Enable chaining only after proof:** Set repository variable `ARBITRADE_AUTONOMOUS_WORKER_ENABLED` to `true) only after the supervised run succeeds. Automatic chaining is bounded to five consecutive automatic commits and only follows successful push-triggered Installer validation.
- **Progress reporting:** The dashboard job summary is implemented in this PR. The workflow must be merged to the default branch for its `workflow_run` trigger to report subsequent validation completions.
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
