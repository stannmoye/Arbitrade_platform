# ARBITRADE autonomy readiness and release gates

## Target outcome

Use the agreed **ChatGPT-led development + GitHub Actions validation** method to automate as much routine engineering as this environment supports, with the owner primarily reviewing significant decisions and authorizing production release. This is not an always-on daemon: GitHub Actions validates code but does not author or repair it by itself.

## Layer-by-layer readiness

| Layer | Required capability | Current evidence | Status |
|---|---|---|---|
| 1. Repository/task source | Versioned code, prioritized task queue, acceptance criteria | Stage 1 queue and evidence rules are proposed in PR #65 | IMPLEMENTED IN DRAFT PR; NOT MERGED |
| 2. Workstream separation | Independent bounded tasks; avoid overlapping edits | Queue tasks are scoped; parallel execution/conflict handling are not verified | PARTIAL |
| 3. CI validation | Tests, type checks, build/install/migration checks | Installer validation run #456 passed on its tested revision; broader financial/staging coverage remains incomplete | PRESENT; COVERAGE INCOMPLETE |
| 4. Coding capability | ChatGPT inspects and edits source/tests through connected GitHub tools | This works during active ChatGPT sessions and does not require a separate OpenAI API key | AVAILABLE DURING ACTIVE SESSION |
| 5. Orchestration | Select next task after previous evidence is reviewed | The agreed method is session-driven; no always-on no-API task daemon is configured | MANUAL SESSION CONTINUATION |
| 6. Failure recovery | Inspect failed checks, diagnose, implement bounded fix, rerun validation | Can be done during active ChatGPT work; no autonomous background repair loop is proven | AVAILABLE DURING ACTIVE SESSION |
| 7. Progress dashboard | Report tasks, commits, CI runs, blockers, next task | Dashboard run #26 passed on the revision tested in that run | IMPLEMENTED IN DRAFT PR; VERIFIED ON THAT REVISION |
| 8. Independent quality gates | Scope checks, review, security and financial acceptance | Worker path checks exist; full security and financial acceptance gates remain incomplete | PARTIAL |
| 9. Staging acceptance | Isolated browser/API/database tests, backup/restore, migration validation | Complete end-to-end acceptance is not verified | PARTIAL |
| 10. Protected production release | Human authorization for production changes | No production deployment performed; this remains a human gate | REQUIRED SAFETY GATE |

## Agreed no-separate-API workflow

1. Read the task queue, progress report, current branch head, and open PRs.
2. Choose one high-priority, safely testable task and inspect the implementation and tests.
3. Make a focused code/test change through the connected GitHub tools on a reviewable branch.
4. Inspect the diff and available test evidence; never claim a test ran if it did not.
5. Let GitHub Actions validate the exact change.
6. Inspect failures, make a bounded correction during an active ChatGPT session, and rerun validation.
7. Update the queue and progress report with the commit SHA, workflow URL, test results, limitations, and next task.
8. Repeat while development work is actively being performed.
9. Keep production access, live financial mutations, and production release behind explicit human approval.

## Legacy API-key worker

The separate `.github/workflows/autonomous-coding-worker.yml` uses `OPENAI_API_KEY` and has its own API quota. Its prior run failed due to quota exhaustion. PR #61 deliberately made it manual-only so ordinary CI does not trigger billed API calls. Keep it manual-only; do not enable automatic API-worker chaining for the agreed Option B. The quota error does not block ChatGPT-led development via connected GitHub tools.

## Honest automation boundary

The no-separate-API method can avoid API billing for routine development, but it cannot guarantee continuous unattended coding between ChatGPT sessions. If fully unattended 24/7 code generation is required, that requires a separately authorized and funded agent/runtime; GitHub Actions alone is not that agent. Do not describe the current setup as fully autonomous until such a worker is actually operating and verified.

## Definition of “ready for production approval”

All of the following must be true:
- Required CI passes on the exact release candidate.
- Financial concurrency, idempotency, rollback, and ledger reconciliation tests pass on supported database versions.
- Security review and authorization tests pass.
- Migration upgrade/fresh-install paths and schema drift checks pass.
- End-to-end staging journeys pass using isolated test data.
- Backup and restore are demonstrated; recovery/rollback instructions are tested.
- Monitoring and actionable alerts are verified.
- External settlement, FX, and payout flows are configured only where provider and business rules are defined and tested; otherwise they remain disabled and visibly marked unavailable.
- No known critical/high unresolved security or financial correctness defect remains.
- Owner explicitly approves production deployment.

**A green CI run alone is never a production approval.**
