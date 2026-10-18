# ARBITRADE Stage 1 automation task queue

This queue is the source of truth for bounded development tasks. A task is complete only when its acceptance criteria are met and evidence is linked in the progress report. Do not infer completion from a green build alone.

## Queue rules

- Work one coherent task at a time unless tasks are demonstrably independent and touch disjoint files.
- Prefer P0 financial correctness and security over cosmetic work.
- Each task must include focused regression tests and record the exact commit and CI run.
- Stop on unclear requirements, missing provider/business decisions, failing safety checks, or any need to touch production. The agreed ChatGPT-led path does not require separate API quota; the legacy API worker remains disabled/manual-only.
- Never merge, deploy, access production systems, or mutate real financial data automatically.
- An agent may not mark a task complete solely by editing this queue or the progress report.

## Prioritized backlog

### S1-A — Wallet mutation concurrency and ledger reconciliation
**Priority:** P0 · **Status:** READY FOR REVIEW — implementation and CI validated; reviewer decision/merge pending · **Owner:** coding agent + reviewer

**Scope**
- Add database-backed concurrent credit/debit tests against disposable MariaDB and MySQL 8-compatible environments.
- Prove competing debits cannot overspend and that accepted operations reconcile with ledger entries and final balances.
- Exercise duplicate wallet rows and the unique `(userId, currency)` index across supported fresh-install and upgrade paths.
- Verify a post-commit telemetry failure does not misreport a committed wallet mutation as failed.

**Acceptance criteria**
- Tests exercise actual database transactions, not only mocks.
- Concurrent operations end with a non-negative balance and exact ledger/balance reconciliation.
- Duplicate-wallet preflight fails closed with actionable diagnostics; it never silently deletes or merges financial rows.
- Migration/install tests cover fresh install and upgrade paths supported by the project.
- Evidence names the exact commit and successful CI run(s).

**Current evidence:** PR [#62](https://github.com/stannmoye/Arbitrade_platform/pull/62), head commit `1e674f431282b3d08e0e386d86b59bd24aaa0718`; cross-database wallet integration [run #27](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39155238918) passed on MySQL 8.0 and MariaDB 11.4; full installer validation [run #497](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39155238949) passed. Do not call this task fully complete until reviewer decision/merge is recorded.

### S1-B — Settlement single-winner, idempotency, and rollback
**Priority:** P0 · **Status:** PARTIAL — daily Mining boost settlement guard and cross-database integration coverage validated; broader settlement paths still need review

**Scope**
- Audit settlement paths for duplicate delivery, simultaneous claims, retry behavior, and partial failure.
- Add database-backed tests for exactly-once ledger effects, one winning settlement claim, and rollback of incomplete financial work.

**Acceptance criteria**
- Replaying the same source/idempotency reference cannot duplicate a credit/debit.
- Competing settlement workers produce one accepted result.
- Failures leave either a fully committed auditable transaction or no partial financial mutation.
- Tests run against the supported disposable database matrix.

**Current evidence:** Draft PR [#66](https://github.com/stannmoye/Arbitrade_platform/pull/66) adds an exact-one-row settlement transition guard and database-backed competing-worker, retry/reconciliation, and rollback tests. Installer validation [run #505](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39156091708) passed all jobs; settlement integration [run #1](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39156044176) passed on MySQL 8.0 and MariaDB 11.4. This evidence covers daily mining boost settlement only; general trade/stake settlement paths remain to be audited. Review/merge is pending.

### S1-C — Mining settlement allocation readiness
**Priority:** P0 · **Status:** BLOCKED ON PRODUCT/PROVIDER INPUTS

**Required inputs**
- Third-party settlement source and evidence format/API.
- Gross-versus-net costs and operator/customer revenue-share policy.
- Allocation denominator and eligible purchased hash-time definition.
- FX/CKI valuation source and timestamp policy.

**Acceptance criteria**
- No rewards are calculated or credited from hashrate alone.
- Each posted period links to source settlement evidence and an idempotent ledger allocation.
- Missing or inconsistent settlement evidence fails closed.

### S1-D — Payout request reservation and audit
**Priority:** P1 · **Status:** BLOCKED ON PRODUCT DECISION

**Required decision**
- Whether funds are reserved/locked when a payout ticket is requested, and the release behavior on rejection/cancellation.

**Acceptance criteria**
- Ticket state transitions and financial reservation are transactional and audited.
- No external transfer is initiated automatically without an explicitly configured and tested provider.

### S1-E — End-to-end staging acceptance
**Priority:** P1 · **Status:** NOT STARTED

**Scope**
- Run browser-level customer/admin journeys against an isolated staging environment.
- Validate authorization boundaries, wallet history, package purchase, reports, error states, and recovery.
- Exercise backup/restore and deployment health checks.

**Acceptance criteria**
- Critical user journeys pass on a release candidate.
- Staging is isolated from production accounts, secrets, and funds.
- Evidence and known limitations are recorded before any production approval.

### S1-F — Release and recovery evidence
**Priority:** P1 · **Status:** NOT STARTED

**Scope**
- Verify release artifact reproducibility, migration ordering, health checks, rollback/recovery procedure, backup restore, monitoring, and alert routing.

**Acceptance criteria**
- A release checklist is signed off with links to exact CI, staging, migration, backup/restore, and security evidence.
- Production deployment remains a separate human-authorized action.

## Autonomous worker operating limits

- The legacy GitHub Actions coding worker uses a separate OpenAI API credential and quota; it is not part of the agreed Option B path.
- Keep that legacy worker manual-only. Do not enable scheduled or CI-triggered API-backed coding runs for this project workflow.
- The agreed path is ChatGPT-led development during active sessions plus GitHub Actions validation. A green CI run proves only the configured checks passed; it does not mean an agent wrote or repaired code.
- When using any separately authorized worker in the future, retries must be bounded and stop after validation failure, invalid patch, branch movement, empty patch, quota error, or exhausted retry budget.
