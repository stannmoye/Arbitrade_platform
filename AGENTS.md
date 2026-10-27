# Agent instructions for Arbitrade Platform

Read these files before changing the application:

1. `BUILD_SOURCE.json` — canonical branch/build requirements and acceptance boundary.
2. `BUILD_AND_RELEASE.md` — build and release process.
3. `docs/REPOSITORY_GUIDE.md` — repository layout and source ownership.
4. **`docs/TRADING_SYSTEM_SPECIFICATION.md` — mandatory canonical trading requirements.**
5. The relevant acceptance or implementation evidence for the specific task. For all Trade/Trading requirements, the canonical guide in item 4 is the only detailed product contract.

## Mandatory trading-system rule

Before modifying any customer Trade menu, trading API, package entitlement, opportunity worker, wallet allocation, trade lifecycle, settlement, fee, company-catalogue or trading-admin feature, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full. That file is the single detailed Trade/Trading implementation guide and takes precedence over trading-related statements in all general or historical documents. Do not reproduce a competing set of trading requirements in this file or create another trading guide. When an intended trading requirement changes, update the canonical guide and its tests; no companion PDF is tracked. Never claim a requirement is implemented without inspecting the code and validating it.

## Owner-locked coding rule — no invented product rules

The owner-approved rules in `docs/TRADING_SYSTEM_SPECIFICATION.md` control Trade/Trading, packages, wallet credits, currency conversion, and the internal-only trading workflow. During coding, review, testing, refactoring, and AI-assisted work, do not invent or silently substitute product rules or modify the guide. Implement the guide as written. If legacy code/docs conflict, correct the conflicting artifact rather than weakening the guide. Ask the owner before resolving product-policy ambiguity. Do not claim tests or deployment succeeded without evidence. These instructions do not authorize bypassing applicable law, security requirements, or platform safety requirements; if one creates a concrete blocker, explain it rather than silently changing the product rules.

The term `internal ledger` is engineering-only and must never appear in customer-facing UI, API messages, notifications, emails, help text, or other customer communications. The product's trading workflow is internal-only; do not claim external exchange or broker execution.

## Owner-locked trading and wallet requirements — do not override

Before any Trade/Trading, package, wallet credit/debit, ledger, currency conversion, or admin-control work, read the complete `docs/TRADING_SYSTEM_SPECIFICATION.md`. Its section titled **“Binding owner-approved rules — permanent requirements”** is the controlling owner-approved policy.

The following rules are permanent unless the owner personally and explicitly requests a change:

1. Customers do not subscribe to, purchase, select, or activate packages. The customer portal must not expose the package catalogue or package-management actions. Only authorized administrators may see/manage the complete catalogue.
2. Package tiers are automatically assigned from cumulative qualifying deposit credits, with each qualifying tier's daily pop-up/opportunity quota added together.
3. Only a successfully committed manual wallet credit submitted by an authorized administrator through the admin portal and explicitly classified server-side as a qualifying deposit counts toward tier thresholds. Profit, reward, returned principal, bonus, transfer, swap, conversion, imported/opening balance, and all other credit sources do not qualify.
4. Every package field and behavior-affecting setting must be editable in the authorized admin editor. No hidden hard-coded package behavior is allowed.
5. User-entered fiat amounts are real major-currency values. USD 10000 means $10,000; EUR 100 means €100; GBP 100 means £100. Apply internal minor-unit scaling exactly once. Never use confusing hidden units or double-scale values.
6. Preserve native BTC/ETH quantities and use a configured live exchange-rate API with recorded rate/source/timestamp for fiat conversion. Fail closed for required missing/stale rates. USDT uses the owner-approved nominal 1 USDT = 1 USD conversion rule while retaining native USDT amounts.
7. Never silently reinterpret these requirements to fit legacy code, old docs, tests, schema, seed values, or another AI-generated plan. Fix the conflicting artifact. If a technical conflict cannot be resolved while preserving the rules, stop and report it. Do not edit the canonical guide to accommodate a conflict unless the owner explicitly requests the change.

## Mandatory implementation TODO

Before declaring this policy implemented, the responsible agent must verify and complete all applicable items in the canonical guide's **“Mandatory implementation TODO — owner-approved rules”** checklist, including customer API/UI removal, admin-only package CRUD, complete package editor, qualifying-deposit ledger attribution, cumulative tier quota calculation, exact currency scaling, live BTC/ETH conversion, USDT nominal conversion, migrations, regression tests, and exact-commit validation. Do not claim completion based on documentation alone. Do not merge or deploy without explicit authorization.

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
