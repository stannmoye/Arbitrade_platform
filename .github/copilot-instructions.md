# Repository-wide instructions

Read the root `AGENTS.md`, `BUILD_SOURCE.json`, and `BUILD_AND_RELEASE.md` before proposing or making code changes.

## Trading specification has precedence

**Before touching any trading-related code or documentation, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full. It is the single canonical product specification for trading behaviour.** This rule applies to customer Trading UI, packages/entitlements, opportunities, auto-allocation, wallet accounting, trade lifecycle, settlement, fees, company catalogue, notifications, admin controls, tests, migrations, scripts, and AI coding workflows.

If any older document, comment, issue, roadmap, test fixture, or prompt conflicts with the canonical trading specification, do not follow the conflicting trading instruction. Treat that older instruction as superseded for trading behaviour, and update the relevant document when safe. Do not delete historical migrations or audit evidence merely because they describe legacy behaviour; preserve history but label old product guidance as superseded. If a code/test currently implements the old rule, report it as a mismatch to fix rather than treating it as authoritative.

When the canonical trading requirements change, update `docs/TRADING_SYSTEM_SPECIFICATION.md` and its companion PDF together in the same reviewed change. The README and root `AGENTS.md` must keep linking to the canonical specification.

The canonical source is `stannmoye/Arbitrade_platform` on `main`. Resolve and record the latest full commit SHA before building; use the root `Dockerfile` and locked pnpm dependencies. Run `pnpm check`, `pnpm test`, and `pnpm build` for source changes. Never export a stage-only app package, include actual environment secrets, or treat tests from a different SHA as validation for the current source.

Preserve all six themes across customer/admin nested content panels. Keep Stage 5 TOTP/recovery and manual-payout behavior server-backed and idempotent. The hosted acceptance status remains separate from source integration; marking a manual payout as paid does not itself transfer money.
