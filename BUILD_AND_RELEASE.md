# Canonical Build and Release Guide

## One source of truth

- The production source branch is `main` in this repository: `stannmoye/Arbitrade_platform`.
- Deploy only code merged into `main` that has passed the checks for its exact commit.
- Do not build production from the older `release/arbitrade-v5-production-pass4` branch, an uploaded ZIP, a stale image, or an unmerged feature branch.
- Record the full commit SHA used by each deployment. A branch name alone is not a reproducible release identifier.

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
- `TRUST_PROXY_HOPS`: set to the actual trusted reverse-proxy hop count; use `0` for direct access rather than guessing.
- SMTP and provider credentials only for integrations that have been configured and approved.

The full variable reference is `.env.example`. Never commit real credentials, production database exports, or a populated `.env` file. Do not share the value of `TOTP_ENCRYPTION_KEY` in chat or logs.

## Identity and account provisioning

There are no default production credentials. Provision or reset accounts only with the documented `pnpm accounts:provision` workflow and the explicit environment variables it requires. Make sure the provisioning command uses the same production database as the running service. Do not paste secrets into logs or commit them.

## Release procedure

1. Review and merge the complete intended change set into `main`.
2. Confirm that the exact `main` commit has passed the repository's build/test, installer/migration, and relevant browser/theme acceptance workflows.
3. In Blitz.cloud, select this repository, branch `main`, repository root, and the root `Dockerfile`. Remove any custom start command that overrides the Dockerfile entry point unless it is exactly equivalent and intentionally required.
4. Confirm the build logs identify the intended commit SHA. Do not assume a healthy service means it built the latest source.
5. Back up the production database and verify a recovery path before applying migrations. Then deploy the exact passing commit and verify `/api/health`, administrator login, customer login, key page contents, and theme switching.
6. Follow `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md` for authenticator/manual-payout hosted checks. Do not consider Stage 5 production acceptance complete until those checks have passed.
7. Tag the verified commit and publish release notes with its SHA, checks run, migrations included, required secrets, and known limitations.
8. Keep an immutable rollback target. Do not roll back schema changes blindly.

## Release integrity

- `BUILD_SOURCE.json` is the machine-readable source/build manifest for connected application platforms and automation.
- `.github/workflows/build-test-production.yml` runs lockfile install, type checking, automated tests, and a production build for pull requests into and pushes to `main`.
- Keep dependencies reproducible with `pnpm-lock.yaml`; do not check in `node_modules` or generated build directories.
- Do not claim a stage is complete just because a build succeeds or a login works. Code inclusion, automated validation, hosted acceptance, and owner release approval are separate checkpoints.

## Current source status

The canonical theme/Stage 4 source integration was merged through [PR #128](https://github.com/stannmoye/Arbitrade_platform/pull/128). The follow-up containing TOTP authenticator enrollment/recovery, reserved manual payout requests, migrations `0059`–`0061`, and portal render recovery was merged through [PR #129](https://github.com/stannmoye/Arbitrade_platform/pull/129).

PR #129's exact head passed:
- [Build, TypeScript, automated tests, and production build](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39867795292)
- [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39867795310)
- [Installer and migration validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39867795425)

The GitHub Actions checks are also being rerun on the resulting `main` commit. The hosted Blitz build must be checked separately and must show the latest `main` SHA. The source is integrated, but Stage 5 hosted acceptance remains pending; see `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md`.

PR #127 is the older divergent release candidate and is closed for history only. Do not build from that branch instead of `main`.
