# ARBITRADE Stage 1 — Autonomous Work Queue

**Repository:** `stannmoye/Arbitrade_platform`  
**Working branch:** `integration/auth-installer-vps-safety`  
**Baseline:** Stage 1 of 30 — last recorded estimate **40%**; retain until acceptance evidence changes.  
**Safety:** no production deployments, production database/VPS changes, live financial mutations, or automatic PR merges.

## How to use this queue

Treat the workstreams below as durable tasks. At the start of a development run, read this file and the Stage 1 audit/roadmap, select the highest-priority unblocked task, and work through safe independent subtasks without waiting for a user to say “proceed.” Parallelize read-only investigations and disjoint test work where practical. Before ending a run, update the evidence/status and next actions. Do not mark a task complete on source inspection alone when its acceptance criteria require tests or runtime evidence.

The GitHub Actions installer-validation workflow runs independent validation lanes in parallel and publishes a per-run dashboard in the Actions job summary. This shortens feedback for those checks; it is not itself an AI coding agent.

## Prioritized task queue

| ID | Priority | Workstream | Acceptance evidence | Status |
|---|---|---|---|---|
| S1-A | P0 | Wallet adjustment concurrency | Disposable MySQL/MariaDB competing credit/debit tests; no lost update; ledger totals reconcile | Partial mitigation in PR #62; DB acceptance open |
| S1-B | P0 | Manual trade settlement | Competing settlement test, duplicate-reference test, affected-row/single-winner assertion, rollback verification | Open |
| S1-C | P0 | Mining purchase/swap | Disposable DB tests for quote owner/status/expiry, replay, competing confirmations, concurrent spending, rollback, and per-asset ledger reconciliation | Open |
| S1-D | P1 | API ownership/security | Endpoint-level cross-customer authorization, notification ownership, and replay/deduplication tests | Open |
| S1-E | P1 | Schema/migration parity | Fresh and upgrade paths on disposable MariaDB and MySQL 8; verify constraints/types/tracker history | In progress |
| S1-F | P1 | Transaction-console session isolation | Regression test for event cleanup scoped to the intended session and an explicit event-retention policy decision | Open |
| S1-G | P1 | Installer rollback/failure injection | Disposable host or command-mocked failures for APT publication/update, service activation, Nginx reload, and Certbot; preserve pre-existing files/services | Open |
| S1-H | P2 | Browser/accessibility acceptance | Automated browser interaction and keyboard checks; viewport evidence at 320, 360, 390, 430, 480, 768, 1024, 1280, 1440, and 1920 px | Open |
| S1-I | P2 | Event/sound acceptance | Verify confirmed-event semantics, replay behavior, browser audio opt-in, enable/mute transitions, and event-specific sound coverage | Open |
| S1-J | P0 | Exact-head CI and review | CI passed on exact head `7922f2832534af383fd84813121b008335aee32b` (run #39143923462); human review and non-CI acceptance gaps remain; keep PR draft | CI green; review/gaps open |

## Execution rules

1. Start with a brief checkpoint: current branch/head, CI state, completed evidence, and blockers.
2. Use parallel workers only for independent work. Coordinate edits to shared files to avoid races.
3. Prefer small patches with regression tests. Run focused tests first, then relevant broad checks.
4. Use only disposable databases/hosts for destructive or failure-injection tests.
5. Record actual test commands and pass/fail results. Never infer a pass from an old commit's run.
6. Keep Stage 1 completion percentage tied to verified acceptance criteria, not the number of tasks attempted.
7. Before stopping, update this queue and `docs/ARBITRADE_STAGE_1_PROGRESS_2026-10-18.md` if repository write access is available.

## Orchestration limitation

GitHub Actions can automatically start CI on pushes/PR updates, parallelize validation jobs, and publish a dashboard. It cannot independently author/fix application code without a configured coding-agent runtime and credentials. The currently available repository connector does not expose a coding-agent dispatch or persistent-worker service. Do not claim automatic AI code-writing or an immediate restart after every job unless such a worker has been configured and verified. The existing scheduled automation is a checkpoint/resume fallback, not a continuous daemon.
