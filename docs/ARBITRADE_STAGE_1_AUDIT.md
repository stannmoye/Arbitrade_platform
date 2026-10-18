# Arbitrade Stage 1 — Application Audit and Development Baseline

**Audit date:** 2026-10-18  
**Roadmap:** `docs/ARBITRADE_MASTER_DEVELOPMENT_ROADMAP.md` (version 2.0; 30 stages)  
**Audited branch:** `integration/auth-installer-vps-safety`  
**Audit status:** In progress — repository/source inspection started; executable baseline checks are not yet run in this environment.  
**Rule:** This is a source inspection, not a claim that the application has been built, tested, or production-validated.

## 1. Repository and stack observed

The repository is a TypeScript application with a React/Vite client, an Express server, tRPC APIs, Drizzle ORM, and a MySQL/MariaDB database. The README states Node.js 20+ (Node.js 22 recommended), pnpm 10.18, HTTPS, and SMTP/approved email configuration for production.

Key source locations observed:

- `client/src/App.tsx` — main customer/admin portal application and many page/component implementations. Current inspected blob SHA: `93a52e7cca80f758058b55b557d102c7f0aa4f6c`.
- `client/src/index.css` — large global stylesheet; inspected source length was approximately 227 KB.
- `client/src/components/CustomerSlideMenu.tsx` — customer navigation registry and menu.
- `client/src/components/AdminSlideMenu.tsx` — administrator menu implementation (listed in the client component directory).
- `client/src/admin-navigation.ts` — canonical admin navigation groups and destinations.
- `client/src/contexts/ThemeContext.tsx` — existing standalone light/dark theme context.
- `server/_core/index.ts` — Express startup, authentication endpoints, background workers and application middleware.
- `server/routers.ts` — tRPC API router and customer/admin operations.
- `server/db.ts`, `server/storage.ts`, `drizzle/schema.ts`, `drizzle/*.sql`, and root `database.sql` — database and migration surface.
- `shared/money.ts` and `shared/money.test.ts` — shared decimal-safe money utilities and tests.
- `installer/` — PHP setup wizard, install scripts, preflight/recovery helpers and installer safety tests.
- `cpanel/README.md`, `installer/README.md`, `installer/vps-setup.sh`, and related VPS scripts — deployment instructions and tools.
- `.github/workflows/installer-validation.yml` — an existing installer-validation workflow.
- `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, and `vitest.installer.config.ts` — dependency and test configuration.

## 2. Routes and portal shape

The repository documents these main entry points:

- `/` — portal gateway.
- `/customer` — customer authentication and portal.
- `/ops-console-7f3a` — administrator authentication and operations portal.
- `/api/health` — health endpoint.
- `/installer/` — temporary PHP setup wizard.

The main React application has dedicated customer and admin flows. Source inspection identified customer areas for dashboard/workspace, wallet, opportunities/trading, mining, yield/staking, activity, notifications, account preferences, security, support, reports, knowledge/resources and research. Admin areas include overview, customer directory, finance/ledger review, credit/debit adjustments, currencies/assets, mining, opportunities, policies, API/provider settings, branding, sound settings, audit, support tickets, email, KYC, delivery monitoring, risk watchlist, transaction review and exports/reports. Exact reachability and behaviour of every menu destination still needs systematic route testing.

## 3. Existing functionality that should be preserved and verified

Source inspection indicates the project already contains substantial functionality. This roadmap must improve it incrementally rather than replace it wholesale.

- Database-backed customer and admin authentication flows are present in the main application and server.
- The backend contains wallet/balance and ledger operations, customer notifications, opportunity/trade lifecycle code, mining logic, staking/yield operations, KYC, support tickets, email delivery, audit-related APIs and operational tooling.
- The customer notification centre reads notification records and supports marking notifications read.
- The admin portal includes a **Sound settings** screen. It currently exposes three sound categories in the inspected component: opportunity pop-up, wallet credited and wallet debited. It uses 30 generated tone presets and stores global settings through the admin settings API. Sound playback also depends on browser audio support and a customer-side local preference.
- A branding screen exists for platform name, tagline, browser title, accent colour, logo, favicon and share-image URL. This is not the same as a complete five-theme system.
- The main application includes pointer-based button-press/ripple feedback.
- Responsive CSS exists, including narrow-phone rules around 420 px and mobile rules around 720–760 px in inspected stylesheets; reduced-motion rules also exist in some styles.
- Customer wallet preferences are stored through the server API and include trading currency, swap currency, auto-top-up and withdrawal-whitelist preferences.
- The repository contains numerous unit/integration-style test files, including authentication, admin authorization, mining rules/motion, money handling, opportunity eligibility/lifecycle, trade settlement and installer safety/recovery tests.

These observations are from code/document inspection only. They do not establish that every feature is wired correctly or passes tests in a running environment.

## 4. Initial findings and risks to investigate

### P0 — Preserve financial correctness and existing account/data state
- Never use frontend animation, local storage, estimated opportunity returns, mining countdowns or sound as proof of a financial event.
- Confirm wallet balances, transaction states, trade settlement, mining credits and swaps against authoritative server/database records and immutable ledger behaviour.
- Do not run migrations, provisioning, database restore/backup commands, account creation, wallet adjustments, settlement workers or destructive cleanup as part of a visual audit.
- The README and `TODO.md` explicitly state that verified third-party settlement is not connected and that configured estimates must not be treated as verified real profit. Keep that boundary intact.

### P1 — Very large central frontend files
- `client/src/App.tsx` is approximately 248 KB and includes many customer/admin components and workflows in one file.
- `client/src/index.css` is approximately 227 KB. Several additional large feature stylesheets exist.
- This increases the risk of accidental regressions and makes broad redesign changes difficult to review. Before refactoring, identify existing CSS ownership and dependencies. Prefer small, reversible changes and avoid a large rewrite.

### P1 — Theme architecture needs a careful reconciliation
- The standalone `ThemeContext.tsx` supports only `light` and `dark` and persists a simple localStorage value when switchable.
- The main portal also has a database-backed branding configuration and custom CSS variables. We have not yet verified whether the standalone theme context is used by all current portal routes.
- The five-theme implementation should use one consistent theme policy and shared design tokens. Preserve the current visual appearance as Theme 1; do not assume that the existing branding accent control equals complete theme support.

### P1 — Notification/sound scope is narrower than the new roadmap
- A notification centre and sound settings already exist, so the new work should extend and test them rather than create a duplicate system.
- Current admin sound controls observed cover opportunity, credit and debit categories, not the complete event catalogue in the roadmap. Event mapping, deduplication, preferences, quiet mode, volume and confirmed backend event semantics need an explicit gap review.
- Verify whether sound playback is triggered by confirmed persisted events or by local UI callbacks; avoid celebratory sound on a request alone.

### P1 — Route/documentation consistency
- `route-manifest.md` describes some entry points as simulated workspaces, while the current README and inspected main application describe database-backed customer/admin sessions. Reconcile this documentation against the running application and tests before using the manifest as the definitive route inventory.

### P2 — Responsive baseline is present but not measured
- Existing mobile media queries and reduced-motion styles are positive starting points.
- No actual viewport/browser checks have been executed during this source audit. Layouts must be checked at the roadmap widths: 320, 360, 390, 430, 480, 768, 1024, 1280, 1440 and 1920 px, including keyboard/dialog behaviour and horizontal overflow.

### P2 — Deployment documentation is substantial but requires environment-specific proof
- The repository documents a universal installer, cPanel Node.js application setup, private terminal commands, VPS setup/rollback tools and verification/diagnostic scripts.
- PHP-only hosting cannot run the Express server. Installer files should not remain publicly accessible after setup; private application files, `.env`, SQL dumps and logs must not be exposed.
- No clean sandbox install, cPanel install or fresh VPS install was performed as part of this source review. These remain separate verification tasks in Stage 30.

## 5. Test and build baseline

The package scripts declare these non-destructive baseline commands:

```bash
pnpm check
pnpm test
pnpm build
```

Installer-specific tests/configuration also exist, including `vitest.installer.config.ts`, shell/Node safety tests and the `installer-validation.yml` workflow.

**Execution status on audit date:** The commands were not run directly from this audit session. A GitHub Actions **Installer validation** run was found and is currently in progress: [run 39121401277](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39121401277). Its syntax job had passed PHP/Node/shell syntax checks and dependency installation, while TypeScript validation was still running at the time inspected; the full test suite, installer/recovery tests and production build were still pending. This is an interim status, not a final pass/fail result. Recheck the run and record its final conclusion before marking Stage 1 complete. Do not run database-mutating scripts as part of the baseline.

## 6. Initial priority queue

1. Obtain baseline type-check, test, and production-build results without touching production data.
2. Build a complete inventory of customer/admin destinations and map each to the actual component/API and access policy.
3. Identify existing CSS breakpoints, shared components and the true source of the current theme/branding behaviour.
4. Trace existing sound settings to the backend settings schema and real event call sites.
5. Confirm database-backed financial and notification event semantics before designing any new UI feedback.
6. Resolve discrepancies in route/deployment documentation.
7. Capture repeatable screenshots/manual observations at the target viewport widths before visual changes.
8. Only after the baseline is understood, proceed to Stage 2 (shared design system and responsive foundation), preserving working behaviour.

## 7. Audit checkpoint

- [x] Read the 30-stage roadmap and confirm Stage 1 is first.
- [x] Inspect repository structure and declared stack/scripts.
- [x] Inspect main app entry, styles, navigation, theme context, sound settings, notification view, server entry/router and installer documentation.
- [x] Record initial findings and priorities in this report.
- [ ] Run type-check, tests and production build; record actual results.
- [ ] Complete systematic customer/admin page and API inventory.
- [ ] Complete measured responsive/browser baseline.
- [ ] Verify current theme and notification event wiring.
- [ ] Update this report with evidence and mark Stage 1 complete only when exit criteria are satisfied.

**Next action:** Execute non-destructive baseline checks in a real project environment or retrieve current GitHub Actions evidence; then continue the missing route/theme/sound mapping. Do not begin a broad UI rewrite yet.
