# Canonical Build and Release Guide

## Authoritative source

- Repository: [stannmoye/Arbitrade_platform](https://github.com/stannmoye/Arbitrade_platform)
- Canonical application branch: `main` (`refs/heads/main`).
- Machine-readable build contract: [`BUILD_SOURCE.json`](BUILD_SOURCE.json).
- Repository map and coding-agent rules: [`docs/REPOSITORY_GUIDE.md`](docs/REPOSITORY_GUIDE.md) and [`AGENTS.md`](AGENTS.md).

Resolve the current `main` HEAD immediately before each build and record its full 40-character commit SHA. A branch name alone is not a reproducible build identifier. Do not build the newest application from unmerged feature branches, old integration branches, stale ZIP files, or historical Stage 4-only release tags.

## Build from source

Requirements: Node.js 22, pnpm 10.18.0, and MySQL 8-compatible MySQL/MariaDB for runtime use.

```sh
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The root `Dockerfile` is the canonical container build definition. Configure the connected build platform to use this repository, branch `main`, repository root as the build context, and `Dockerfile` as the container definition. Do not replace its start command with a competing command. At runtime it applies guarded migrations and starts `dist/index.js`; health is checked at `/api/health`.

## Runtime configuration

Set the values below using the host's protected environment/secret manager, not source files:

- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY`: a stable key for encrypted authenticator secrets. Use a 32-byte key (64 hexadecimal characters or base64), back it up in a separate protected location, and do not rotate it without a reviewed migration/recovery plan.
- `TRUST_PROXY_HOPS`: set to the actual trusted reverse-proxy hop count; use `0` for direct access instead of guessing.
- SMTP and provider credentials only for integrations that have been approved and configured.

See `.env.example` for the environment reference. Never commit populated `.env` files, production credentials, the TOTP encryption key, production data, or production database dumps. Do not paste secret values into chat, source code, test fixtures, logs, or release artifacts.

## Full application package

The authoritative packaging workflow is [`.github/workflows/full-production-release.yml`](.github/workflows/full-production-release.yml). It is manually dispatched from `main`, runs the full lockfile install, type check, test suite, and production build, verifies required Stage 5 files, and packages the integrated application—not a stage-only patch.

The workflow creates an archive named like `arbitrade-full-application-v2.0.6-stage5-full.zip`, includes source, `dist/`, `node_modules/`, migrations, installers, docs, tests, and assets, and publishes a detached SHA-256 checksum. It excludes Git metadata, GitHub workflow metadata, and actual environment secrets. The workflow records the exact source commit SHA and build run in release provenance.

Use a new tag matching `vMAJOR.MINOR.PATCH-stage5-full`. The workflow refuses to publish from a branch other than `main` or reuse a tag already attached to a release. The archive is a full deployable application bundle; it does not certify the deployment, live provider execution, or hosted acceptance.

The legacy `stage4-full-release.yml` and `build-production-release-pass4.yml` publishers are intentionally disabled because their fixed stage-specific outputs and non-canonical branch targets could mislead connected tools. Do not use old Stage 4/Pass 4 ZIPs or artifacts as the latest source.

## Feature and acceptance status

The canonical source includes the customer/admin portals, six theme variants, Stage 4 notification and support features, Stage 5 authenticator enrollment/recovery, manual payout requests, and portal-render recovery. See `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md` for the exact hosted acceptance checklist.

**Source integration is complete; Stage 5 hosted acceptance remains pending.** Verify current GitHub Actions results against the exact resolved `main` SHA before deployment. Prior tests on a different branch or commit must not be treated as evidence that a later commit passed. The source build also does not prove that the live service was updated or that external money movement is configured.

Manual payout tickets and an administrator marking a request paid are records of status, not a bank or blockchain transfer. Do not represent configured estimates as verified real returns or simulated balances as withdrawable funds.

## Release procedure

1. Resolve and record the current `main` commit SHA.
2. Confirm the GitHub Actions build, type-check, and test results correspond to that exact SHA.
3. Back up the database and verify a recovery path before applying any migration.
4. Dispatch the full application packaging workflow from `main` with a new Stage 5 full-release tag.
5. Verify the release asset, included migrations, provenance file, and SHA-256 checksum.
6. On an isolated staging host and dedicated test database, follow `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md` and the VPS/cPanel deployment guide.
7. Verify customer/admin login, TOTP enrollment/recovery, payout request lifecycle, nested theme surfaces, and `/api/health`.
8. Record hosted acceptance separately before describing the application as production-certified.

Never use fresh-install mode against a database containing customer or business data. Preserve an immutable rollback target and do not roll back schema changes blindly.
