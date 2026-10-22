# Repository-wide instructions

Read the root `AGENTS.md`, `BUILD_SOURCE.json`, and `BUILD_AND_RELEASE.md` before proposing or making code changes.

The canonical source is `stannmoye/Arbitrade_platform` on `main`. Resolve and record the latest full commit SHA before building; use the root `Dockerfile` and locked pnpm dependencies. Run `pnpm check`, `pnpm test`, and `pnpm build` for source changes. Never export a stage-only app package, include actual environment secrets, or treat tests from a different SHA as validation for the current source.

Preserve all six themes across customer/admin nested content panels. Keep Stage 5 TOTP/recovery and manual-payout behavior server-backed and idempotent. The hosted acceptance status remains separate from source integration; marking a manual payout as paid does not itself transfer money.
