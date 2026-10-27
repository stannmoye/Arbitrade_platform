# Agent instructions for Arbitrade Platform

Read these files before changing the application:

1. `BUILD_SOURCE.json` — canonical branch/build requirements and acceptance boundary.
2. `BUILD_AND_RELEASE.md` — build and release process.
3. `docs/REPOSITORY_GUIDE.md` — repository layout and source ownership.
4. **`docs/TRADING_SYSTEM_SPECIFICATION.md` — mandatory canonical trading requirements.**
5. The relevant acceptance or implementation evidence for the specific task. For all Trade/Trading requirements, the canonical guide in item 4 is the only detailed product contract.

## Mandatory trading-system rule

Before modifying any customer Trade menu, trading API, package entitlement, opportunity worker, wallet allocation, trade lifecycle, settlement, fee, company-catalogue or trading-admin feature, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full. That file is the single detailed Trade/Trading implementation guide and takes precedence over trading-related statements in all general or historical documents. Do not reproduce a competing set of trading requirements in this file or create another trading guide. When an intended trading requirement changes, update the canonical guide and its tests; no companion PDF is tracked. Never claim a requirement is implemented without inspecting the code and validating it.

## Canonical source

- The application source of truth is `stannmoye/Arbitrade_platform` on `main`.
- Resolve the latest `main` SHA before starting work; pin builds and acceptance evidence to the full SHA.
- Do not treat an old branch, cached clone, generated ZIP, or stage-only release tag as newer than current `main`.
- Do not create a standalone stage-only application package. Keep release artifacts integrated with the full application.
- Keep the root `Dockerfile`, `pnpm-lock.yaml`, and `BUILD_SOURCE.json` aligned.

## Development and validation

Use Node.js 22 and pnpm 10.18.0. Before submitting source changes, run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Never commit `node_modules/`, generated `dist/` output, release archives, actual `.env` files, credentials, private keys, customer data, or production database dumps.

Database changes should use ordered forward migrations and retry-safe server-side behaviour. Do not run a fresh install against a populated database.
