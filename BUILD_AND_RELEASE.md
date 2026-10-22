# Canonical Build and Release Guide

## Source of truth

- Canonical production source branch: `main`.
- Build the application from the repository commit on `main`; do not build from an uploaded ZIP, an old deployment image, or an unmerged feature/release branch.
- Every deployment must record the full Git commit SHA it built.
- A release is not production-ready until its exact commit has passed CI and its feature acceptance checklist.

## Standard build

Requirements: Node.js 22, pnpm 10.18, and a compatible MySQL 8/MariaDB database.

```sh
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The production container build is defined in the repository-root `Dockerfile`. Its runtime command applies Drizzle migrations and then starts `dist/index.js`. Never run production migrations against an unbacked-up database.

## Required runtime configuration

Set secrets in the deployment platform, not in Git:
- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY` (stable, backed up, and kept consistent for the lifetime of encrypted authenticator secrets)
- SMTP and provider credentials required by enabled features

Provision accounts only with the documented `pnpm accounts:provision` command and explicitly configured environment variables. Never commit real credentials or `.env` files.

## Release procedure

1. Review and merge the complete intended change set into `main`; do not assume a ZIP or a draft PR is included.
2. Confirm the final commit SHA on `main`.
3. Run the exact-commit CI checks: TypeScript, tests, production build, migration/installer checks, and admin/customer portal theme/viewport acceptance.
4. Build and deploy that exact SHA; configure Blitz to build from `main` and use the repository Dockerfile.
5. Confirm the deployed service reports healthy and test admin and customer login, portal content, theme switching, Stage 4 payout/TOTP flows, and any Stage 5 acceptance items required for that release.
6. Tag the verified commit and publish release notes containing the SHA, test results, migrations, environment requirements, and known limitations.
7. Keep a rollback target. Back up the database before migrations; do not roll back schema changes blindly.

## Release integrity

- Do not claim a stage is included unless its source changes are present in the tagged commit.
- Do not call a release complete based only on a successful container build or login.
- Keep dependency caches and `node_modules` out of release archives and Git history; use the lockfile for reproducible installs.
- Use immutable commit SHAs/tags for release identification. `main` is the current integration target, not an immutable release identifier.

## Current source status

The complete source integration was merged through PR [#128](https://github.com/stannmoye/Arbitrade_platform/pull/128). The integrated commit contains the theme-aware customer/admin portal source, Stage 4 release changes, migration/installer safeguards, a final theme-surface bridge, and a CI workflow that runs type-checks, tests, and a production build.

The integration head `97b725571495690dad9d2c8acfa4a99de0ada2f1` passed the production build/test workflow, mining regression checks, and installer/migration validation. Use the current `main` HEAD SHA for each actual deployment and confirm the corresponding CI result before rollout.

PR #127 is an older divergent release candidate and is not the canonical deployment source. Do not build from that branch as a substitute for `main`. Stage 5 production acceptance must be verified against the specific Stage 5 acceptance checklist before claiming full production certification.
