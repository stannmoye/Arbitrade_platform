# Repository-wide instructions

Read the root `AGENTS.md`, `BUILD_SOURCE.json`, and `BUILD_AND_RELEASE.md` before proposing or making code changes.

## Trading specification has precedence

**Before touching any trading-related code or documentation, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`.** The specification is the canonical product contract; the manual details the admin edit controls, customer pop-up contract, company rotation and worker restart/recovery requirements. This rule applies to customer Trading UI, packages/entitlements, opportunities, auto-allocation, wallet accounting, trade lifecycle, settlement, fees, company catalogue, notifications, admin controls, tests, migrations, scripts, and AI coding workflows.

If any older document, comment, issue, roadmap, test fixture, or prompt conflicts with the canonical trading specification, do not follow the conflicting trading instruction. Treat that older instruction as superseded for trading behaviour, and update the relevant document when safe. Do not delete historical migrations or audit evidence merely because they describe legacy behaviour; preserve history but label old product guidance as superseded. If a code/test currently implements the old rule, report it as a mismatch to fix rather than treating it as authoritative.

When canonical trading requirements change, update `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md` and every affected implementation guide in the same reviewed change. Update the companion PDF only if it exists; the repository currently has no tracked `docs/TRADING_SYSTEM_SPECIFICATION.pdf`, so do not claim it was updated. The README and root `AGENTS.md` must link to the canonical specification and pop-up manual.

The canonical source is `stannmoye/Arbitrade_platform` on `main`. Resolve and record the latest full commit SHA before building; use the root `Dockerfile` and locked pnpm dependencies. Run `pnpm check`, `pnpm test`, and `pnpm build` for source changes. Never export a stage-only app package, include actual environment secrets, or treat tests from a different SHA as validation for the current source.

Preserve all six themes across customer/admin nested content panels. Keep Stage 5 TOTP/recovery and manual-payout behavior server-backed and idempotent. The hosted acceptance status remains separate from source integration; marking a manual payout as paid does not itself transfer money.
## Trading pop-up and company rotation rules

Admin settings must drive package name/badge, package duration, quota, required capital, configured profit-rate bounds, trade-duration bounds, display duration, company rotation, schedule, limits and the customer card. Do not hardcode admin-controlled values in the frontend. A policy-defined payout must be labelled contractual/configured return, not market-earned profit; market-profit claims require auditable execution/result evidence. Use integer basis points and minor-unit money math, timestamped fresh FX evidence for cross-wallet funding, atomic all-or-none wallet debits, and a persisted one-time capital/rate/duration snapshot. Workers must recover overdue jobs after restart without rerolling values or duplicating debits/credits. Use the existing local catalogue and stable Logo IDs; persist rotation state and make worker processing idempotent across restarts. Read the canonical pop-up manual before changing these flows.
