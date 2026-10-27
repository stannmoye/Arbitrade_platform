# Repository-wide instructions

Read the root `AGENTS.md`, `BUILD_SOURCE.json`, and `BUILD_AND_RELEASE.md` before proposing or making code changes.

## Trading specification has precedence

**Before touching any Trade/Trading code, data, UI, job, migration, test or documentation, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full. It is the only detailed Trade/Trading implementation guide and the single source for customer and admin behavior.** Do not create another trading guide or reproduce a competing requirements list elsewhere.

If any older document, comment, issue, roadmap, test fixture, or prompt conflicts with the canonical trading specification, do not follow the conflicting trading instruction. Treat that older instruction as superseded for trading behaviour, and update the relevant document when safe. Do not delete historical migrations or audit evidence merely because they describe legacy behaviour; preserve history but label old product guidance as superseded. If a code/test currently implements the old rule, report it as a mismatch to fix rather than treating it as authoritative.

When trading requirements change, update `docs/TRADING_SYSTEM_SPECIFICATION.md` and its tests in the reviewed change. No companion PDF is tracked. The README and root `AGENTS.md` must link to this canonical guide; general documents should contain only a short pointer for trading behavior.

The canonical source is `stannmoye/Arbitrade_platform` on `main`. Resolve and record the latest full commit SHA before building; use the root `Dockerfile` and locked pnpm dependencies. Run `pnpm check`, `pnpm test`, and `pnpm build` for source changes. Never export a stage-only app package, include actual environment secrets, or treat tests from a different SHA as validation for the current source.

Preserve all six themes across customer/admin nested content panels. Keep Stage 5 TOTP/recovery and manual-payout behavior server-backed and idempotent. The hosted acceptance status remains separate from source integration; marking a manual payout as paid does not itself transfer money.
