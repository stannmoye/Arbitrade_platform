# Agent instructions for Arbitrade Platform

Read these files before changing the application:

1. `BUILD_SOURCE.json` — machine-readable canonical branch, build requirements, package contents, and acceptance boundary.
2. `BUILD_AND_RELEASE.md` — exact build and release process.
3. `docs/REPOSITORY_GUIDE.md` — repository layout and source ownership.
4. The acceptance or implementation document relevant to the files being changed.

## Canonical source

- The application source of truth is `stannmoye/Arbitrade_platform` on `main`.
- Resolve the latest `main` SHA before starting work; pin builds and acceptance evidence to the full SHA.
- Do not treat an old branch, cached clone, generated ZIP, or stage-only release tag as newer than the current `main` head.
- Do not create a standalone stage-only application package. The release bundle must contain the complete integrated application.
- Keep the root `Dockerfile`, `pnpm-lock.yaml`, and `BUILD_SOURCE.json` aligned. If a build contract changes, update the manifest, documentation, and validation test in the same change.

## Development and validation

Use Node.js 22 and pnpm 10.18.0. Before submitting source changes, run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Never commit `node_modules/`, generated `dist/` output, release archives, actual `.env` files, credentials, private keys, customer data, or production database dumps.

When changing a portal, preserve the shared behavior across customer and administrator pages. Theme changes must cover nested/middle content surfaces, not just the outer shell, and must follow all six implemented themes. Add automated contract coverage for stylesheet load order, theme-token use, and responsive behavior. Do not claim browser/device acceptance when it has not been performed.

Database changes should use ordered forward migrations and retry-safe server-side behavior. Do not erase migration/install recovery markers to force an install retry. Never run a fresh install against a populated database.

## Functional boundaries

TOTP authenticator encryption requires a stable server-side `TOTP_ENCRYPTION_KEY`; never write the key into a file or output. Recovery codes must remain single-use. Payout requests reserve/release funds according to server-side state and admin resolution; marking a payout paid does not prove or initiate external money movement.

## Release discipline

The only current full-application packaging workflow is `.github/workflows/full-production-release.yml`, dispatched from `main`. See `BUILD_AND_RELEASE.md` for its required tag pattern and artifact checks. Code inclusion, exact-commit CI, hosted acceptance, actual deployment, and production certification are separate gates.
