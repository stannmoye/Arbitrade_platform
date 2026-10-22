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

## Current recovery note

A release candidate PR titled **Release/arbitrade v5 production pass4** is open as PR #127. It is not merged and must not be treated as the production source. Review its diff and repository history before integrating it: its current metadata shows a very large deletion count and a non-mergeable state. The exact complete Stage 4/Stage 5 source set must be reconciled into the canonical branch before claiming a unified release.
