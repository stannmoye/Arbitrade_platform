# Repository Guide

## Canonical build inputs

| Item | Source of truth | Purpose |
| --- | --- | --- |
| Application revision | `main` in this repository | Current integrated customer/admin app |
| Machine-readable build contract | `BUILD_SOURCE.json` | Branch, toolchain, artifact scope, required checks, and acceptance boundary |
| Human build/release process | `BUILD_AND_RELEASE.md` | Reproducible source and full-application release steps |
| Agent instructions | `AGENTS.md` and `.github/copilot-instructions.md` | Instructions for connected coding assistants |
| Container build | Root `Dockerfile` | Canonical production container context |
| Dependency resolution | `package.json` + `pnpm-lock.yaml` | Reproducible package installation |
| Database evolution | `drizzle/` and guarded migration scripts | Ordered forward schema changes |
| Release packaging | `.github/workflows/full-production-release.yml` | Complete source/dependency/build ZIP and checksum |
| Acceptance status | `docs/ARBITRADE_STAGE_5_ACCEPTANCE.md` plus exact-SHA GitHub Actions runs | Separates source integration from hosted sign-off |

## Main directories

- `client/`: React/Vite customer and administrator portals, shared UI, theme system, responsive styling, and frontend contract tests.
- `server/`: Express/tRPC APIs, authorization, database-backed workflows, ledger/business rules, background processing, and server tests.
- `shared/`: types and modules shared by the client and server.
- `drizzle/`: ordered database migration files.
- `scripts/`: migration guards, diagnostics, audits, recovery planning, and maintenance scripts.
- `installer/`: browser-assisted setup and guarded install/verification tools.
- `cpanel/`: cPanel deployment instructions and supporting files.
- `public/`: public assets, including notification sounds.
- `.github/workflows/`: continuous integration and the current full application release workflow.
- `docs/`: implementation records, test/acceptance gates, theme references, and deployment guidance.

## Required build path

Deploy directly to an operator-managed VPS/container or cPanel Node.js host. For a VPS/container deployment, use the root `Dockerfile`; for cPanel, follow `cpanel/README.md` and the installer guide. Configure `DATABASE_URL` for the operator-managed MySQL/MariaDB database and `UPLOADS_DIR` for a private persistent directory outside `public_html`, writable by the Node service account. Authentication, sessions, business state, scheduled-job records, and attachment metadata are application-owned; uploaded bytes remain on the host's private filesystem. Install the locked dependencies with `pnpm install --frozen-lockfile`, then verify `pnpm check`, `pnpm test`, and `pnpm build` against the same source SHA.

Do not build from historical stage/integration branches or assume the newest-looking ZIP or old release is the newest source. Use the current full-application release workflow when a self-contained ZIP is required. The legacy `stage4-full-release.yml` and `build-production-release-pass4.yml` stage-specific publishers are disabled.

## Integrated scope and limits

The canonical source includes the customer and admin portals, six theme variants, Stage 4 notification/support features, Stage 5 authenticator enrollment/recovery, manual payout requests, and workspace-render recovery. A payout request and an administrator status change are not a real bank or blockchain transfer. Stage 5 hosted acceptance remains pending until the acceptance checklist is completed and recorded.
