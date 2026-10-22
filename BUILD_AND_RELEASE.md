# Canonical Build and Release Guide

## One source of truth

- The production source branch is `main` in this repository: `stannmoye/Arbitrade_platform`.
- Deploy only code that has been merged into `main` and passed the checks for its exact commit.
- Do not build production from the older `release/arbitrade-v5-production-pass4` branch, an uploaded ZIP, a stale image, or an unmerged feature branch.
- Record the full commit SHA used by every deployment. A branch name alone is not a reproducible release identifier.

## Standard build

Requirements: Node.js 22, pnpm 10.18.0, and MySQL 8 or compatible MariaDB.

```sh
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The production container build is defined by the root `Dockerfile`. Use that Dockerfile on Blitz.cloud and compatible container hosts. The container installs from the lockfile, builds the Vite client and Express server, runs the guarded Drizzle migrations, and starts `dist/index.js`. The health endpoint is `/api/health`.

## Required runtime configuration

Set values in the deployment platform's secret/environment configuration, not in Git:

- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY`: stable 32-byte key (64 hex characters or base64) used to encrypt customer authenticator secrets. Generate once, back it up securely, and do not rotate it without a verified migration plan.
- SMTP and provider credentials only for integrations that have been configured and approved.
- `TRUST_PROXY_HOPS`: set to the actual trusted reverse-proxy hop count; use `0` for direct access rather than guessing.

The full variable reference is `.env.example`. Never commit real credentials, production database exports, or a populated `.env` file.

## Identity and account provisioning

There are no default production credentials. Provision or reset accounts only with the documented `pnpm accounts:provision` workflow and the explicit environment variables it requires. Make sure the provisioning command uses the same production database as the running service. Do not paste secrets into logs or commit them.

## Release procedure

1. Review and merge the complete intended change set into `main`.
2. Confirm that the exact `main` commit has passed the repository's build/test, installer/migration, and relevant browser/theme acceptance workflows.
3. In Blitz.cloud, select this repository, branch `main`, repository root, and the root `Dockerfile`. Disable or remove any custom start command that overrides the Dockerfile entry point unless it is exactly equivalent and intentionally required.
4. Confirm the build logs identify the intended commit SHA. Do not assume that a healthy service means it built the latest source.
5. After a backup and planned migration window, deploy the exact passing commit and verify `/api/health`, administrator login, customer login, key page contents, theme switching, and relevant feature flows.
6. For the authenticator/manual-payout feature, follow `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md`. Do not consider its production acceptance complete until the hosted checks have passed.
7. Tag the verified commit and publish release notes with its SHA, checks run, migrations included, required secrets, and known limitations.
8. Keep an immutable rollback target. Back up the database before migrations; do not roll back schema changes blindly.

## Release integrity

- `BUILD_SOURCE.json` is the machine-readable source/build manifest for connected application platforms and automation.
- `.github/workflows/build-test-production.yml` runs lockfile install, type checking, automated tests, and a production build for pull requests into and pushes to `main`.
- Keep dependencies reproducible with `pnpm-lock.yaml`; do not check in `node_modules` or generated build directories.
- Do not claim a stage is complete just because a build succeeds or a login works. Code inclusion, automated validation, hosted acceptance, and owner release approval are separate checkpoints.

## Current integration note

The source and theme-system integration was merged through [PR #128](https://github.com/stannmoye/Arbitrade_platform/pull/128), with TypeScript/tests/build, mining regression, and installer/migration checks passing on the integrated baseline. A follow-up candidate is adding the manual payout/TOTP flows and the portal render-recovery boundary; those changes must pass the new combined exact-head CI before they are merged into `main`.

PR #127 was the older divergent release candidate and is retained for history only. Use `main` as the deployment source after the follow-up candidate is reviewed and merged. The six-theme system and portal surface bridge are in source; hosted visual acceptance must still be performed on the deployed service.
