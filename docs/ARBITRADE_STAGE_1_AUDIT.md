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

**Execution status:** GitHub Actions **Installer validation** run [39121401277](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39121401277) completed with overall conclusion **success**. The syntax job passed TypeScript validation, the application test suite, installer/migration safety tests, migration preflight/recovery regression tests, production build, frontend bundle/runtime-config budget checks, and the production-server smoke test without a database. The disposable fresh-MariaDB job passed its fresh-install, admin, migration-tracker and cleanup checks. The disposable MySQL 8 job passed the same fresh-install checks plus migration retry/recovery guards. The deployment-packages job assembled and validated one universal deployment ZIP and uploaded it as a workflow artifact. These are CI results on the workflow's tested commit; they do not prove that cPanel or a fresh VPS has been installed and exercised, and the ZIP artifact still needs environment-specific installation verification. No database-mutating commands were run against production as part of this audit.

## 6. Inventory findings added after CI and navigation review

### Customer navigation inventory
The customer navigation registry in `client/src/components/CustomerSlideMenu.tsx` has 5 groups and 22 listed destinations: Main navigation (8), Core Workspace (2), Project & Investment (5), Knowledge & Support (4), and Transparency & Updates (3). Three of the listed destinations are explicitly marked planned/review-only (`Token Launch`, `Tokenomics`, and other planned offerings as surfaced by the menu); menu presence must not be interpreted as a live financial product. The destination registry is a useful inventory, but each target still needs to be traced through `CustomerWorkspace` rendering and the corresponding API/access policy.

### Administrator navigation inventory
`client/src/admin-navigation.ts` defines 9 groups and 33 navigation entries spanning overview, customers, finance, opportunities, verification/risk, communications, platform configuration, integrations, and governance/reports. Multiple entries intentionally share a canonical target (for example, related KYC/risk entries and opportunity subitems). Stage 1 must verify each distinct target is actually rendered and permission-guarded; a menu entry alone does not prove a functioning screen.

### Existing sound/event wiring (source inspection)
- `client/src/App.tsx` defines 30 generated tone presets and a sound settings shape with three configurable categories: `opportunity`, `credit`, and `debit`, plus global enable and opportunity-loop flags.
- The customer workspace fetches `trpc.customer.soundSettings` and polls every 15 seconds. Sound effects are also gated by the local-storage preference `wisebond-sound-effects`.
- Opportunity sound is called when a current offer popup is shown, subject to customer and administrator sound settings.
- The investment mutation invokes debit-style feedback in its success callback and failure-style feedback in its error callback; the source still needs semantic verification against backend responses and UI wording.
- The transaction-process view tracks seen event IDs and invokes debit/credit sound when new `DEBIT`/`CREDIT` events arrive, which is a useful deduplication baseline. It intentionally marks the initial fetched events as already seen, so opening the view does not replay historical sounds.
- Admin sound settings are persisted through `trpc.adminOperations.updateSettings`. The current source does not yet demonstrate a complete event-specific catalogue for deposit arrival, withdrawal requested/processed, trade settlement, mining reward, swap, or support events. Do not add celebratory feedback for an unconfirmed request.

These are source-level observations, not end-to-end proof of event timing or financial semantics.

## 7. Initial priority queue

1. Obtain baseline type-check, test, and production-build results without touching production data.
2. Build a complete inventory of customer/admin destinations and map each to the actual component/API and access policy.
3. Identify existing CSS breakpoints, shared components and the true source of the current theme/branding behaviour.
4. Trace existing sound settings to the backend settings schema and real event call sites.
5. Confirm database-backed financial and notification event semantics before designing any new UI feedback.
6. Resolve discrepancies in route/deployment documentation.
7. Capture repeatable screenshots/manual observations at the target viewport widths before visual changes.
8. Only after the baseline is understood, proceed to Stage 2 (shared design system and responsive foundation), preserving working behaviour.

## 8. Audit checkpoint

- [x] Read the 30-stage roadmap and confirm Stage 1 is first.
- [x] Inspect repository structure and declared stack/scripts.
- [x] Inspect main app entry, styles, navigation, theme context, sound settings, notification view, server entry/router and installer documentation.
- [x] Record initial findings and priorities in this report.
- [x] Retrieve CI evidence for type-check, application tests, installer/recovery tests and production build (workflow run 39121401277: success).
- [ ] Complete route-to-component/API/access-policy mapping for all customer/admin destinations; initial menu registry counts recorded above.
- [ ] Complete measured responsive/browser baseline.
- [ ] Complete theme/provider usage mapping and verify sound events against authoritative backend event semantics; initial source call sites recorded above.
- [ ] Update this report with evidence and mark Stage 1 complete only when exit criteria are satisfied.

**Next action:** Complete route-target and access-policy tracing, inspect ThemeContext/provider usage across app entry points, reconcile `route-manifest.md`, and continue responsive/browser baseline checks. Do not begin a broad UI rewrite yet.
