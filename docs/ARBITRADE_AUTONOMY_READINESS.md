# ARBITRADE autonomy readiness and release gates

## Target outcome

Automate routine development, testing, bounded repair attempts, progress reporting, and staging acceptance so the owner primarily reviews decisions and authorizes production release. This is a target design, not a claim that every layer is already active.

## Layer-by-layer readiness

| Layer | Required capability | Current evidence | Status |
|---|---|---|---|
| 1. Repository/task source | Versioned code, prioritized task queue, documented acceptance criteria | Repository and this Stage 1 queue exist | PARTIAL |
| 2. Workstream separation | Independent, bounded tasks; avoid overlapping edits to shared files | Queue tasks are scoped; parallel execution is not yet verified | PARTIAL |
| 3. CI validation | Tests, type checks, build/install/migration checks on relevant changes | Installer validation workflow exists | PRESENT; coverage still incomplete |
| 4. Coding agent | Agent reads repo, edits source/tests, returns a reviewable patch | Codex Actions workflow exists and needs API quota | BLOCKED |
| 5. Orchestration | Select next eligible task only after prior validation passes | Current workflow on `main` is manual-only; no verified continuous loop | BLOCKED |
| 6. Failure recovery | Diagnose failed checks and bounded retries, then stop/escalate | No end-to-end recovery chain verified | PARTIAL/BLOCKED |
| 7. Progress dashboard | Report task, commit, CI run, blockers, and next task from evidence | Queue/progress documents provide a manual evidence record; automated dashboard not yet verified | PARTIAL |
| 8. Independent quality gates | Scope validation, review, security and financial acceptance | Worker allowlist exists; full release/security gates remain incomplete | PARTIAL |
| 9. Staging acceptance | Isolated browser/API/database testing, backup/restore, migration validation | Some disposable DB validation exists; full end-to-end acceptance not verified | PARTIAL |
| 10. Protected production release | Separate human authorization for production changes | No production deployment performed; must remain a human gate | REQUIRED SAFETY GATE |

## Safe development loop to implement

1. Read the queue and current progress report.
2. Verify branch head and required checks.
3. Select one highest-priority unblocked task.
4. Run the coding agent in an isolated workspace with least-privilege permissions.
5. Accept only allowed source/test/documentation paths; reject deletions and stale patches by default.
6. Run focused tests, then full CI on the exact candidate commit.
7. On failure, allow only a small, bounded number of repair attempts; then stop and report the failure.
8. After success, update the progress report with exact commit and workflow evidence.
9. Start another task only when the previous task's required checks have succeeded.
10. Never auto-merge, deploy, access production, or mutate real customer financial data.

## Activation blockers and operator actions

- **API quota:** The current coding worker uses `OPENAI_API_KEY`. The prior worker attempt failed with a quota-exceeded error. An authorized repository owner must restore API quota/billing and verify limits before unattended coding can run. Do not paste the key into chat, commits, issues, or logs.
- **Controlled first run:** After quota is restored, run one small test-only task on `integration/auth-installer-vps-safety`, inspect the patch and logs, and confirm that validation runs against the resulting exact commit.
- **Chaining:** Do not enable automatic CI-triggered coding runs until the controlled run and failure-stop behavior have been verified. Otherwise a quota or CI problem can repeatedly consume Actions minutes without progress.
- **Progress reporting:** The queue and dated progress file are evidence records, not a live dashboard. An automated dashboard must be added and verified separately.
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
