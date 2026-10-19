# Arbitrade Master Development Roadmap

**Repository:** `stannmoye/Arbitrade_platform`  
**Active Stage 2 branch:** `feat/stage-2-design-system-foundation`  
**PR target branch:** `integration/auth-installer-vps-safety`  
**Roadmap version:** 2.1  
**Purpose:** The durable source of truth for the customer experience, themes, notifications, sounds, responsive layouts, administrator portal, quality assurance, and deployment-verification work.

> **Working rule:** Complete and verify one stage at a time. Update this document as work progresses so the team can always identify what is complete, what is in progress, what failed, and what comes next. Do not claim a task or test is complete unless it has actually been implemented or run.


## Mandatory execution cadence and substantial-work contract (Roadmap v2.1)

These rules apply to every stage and override any workflow habit that causes repeated tiny changes or unnecessary user prompts.

**Cadence baseline adopted 2026-10-19:** Active work remains Stage 2 on `feat/stage-2-design-system-foundation`, PR #71. **Stage 2 continuation count: Prompt 1/30** under this newly adopted contract. This counter measures user interruptions from this baseline forward; it does not erase prior development history or imply Stage 2 is complete. The existing roadmap's Stage 1 audit findings remain recorded and any unverified exit criteria must still be reconciled without restarting completed work.

### Hard prompt budget
- **Maximum: 30 continuation prompts per stage.** A continuation prompt means every time the assistant stops coding and asks the user to type "continue", "proceed", or an equivalent message to resume. Count these user interruptions, not internal tool calls, commits, parallel workstreams, or automated CI jobs.
- Track the stage's continuation count explicitly in the current checkpoint and every progress report as **Prompt X/30**. Start at 0/30 when this cadence contract is adopted for the current stage; do not reset the counter merely because the conversation changes.
- Never intentionally consume a prompt on a trivial isolated edit, status-only response, or work item that could reasonably be bundled with the active batch.
- Do not ask the user to continue while there is useful, authorized work that can be done in the current session. Work through the planned batch, verify it, commit/update the roadmap where supported, and only then report the checkpoint.
- If a hard external blocker truly requires user input or unavailable access, explain the precise blocker, complete all independent work first, and record the reason. Do not disguise avoidable stopping as a blocker.
- If the stage approaches Prompt 24/30, consolidate remaining work into a prioritized completion plan. Prompts 27–30 are reserved for completing critical remaining deliverables, resolving integration/CI failures, and recording evidence; do not spend them on scope expansion.

### Minimum work per continuation prompt
- **Spend at least six minutes of active, substantive development effort per continuation prompt**, when tools and access permit. This is a minimum effort expectation, not permission to pad work, wait idly, or claim elapsed time that was not spent.
- Before coding, inspect the live branch, current diff, stage acceptance criteria, recent CI results, and relevant existing components/tests. Continue from the actual checkpoint; never restart or duplicate completed work.
- Build one coordinated batch from multiple related tasks. Prefer parallel independent workstreams (for example implementation, regression tests, accessibility/responsive review, documentation/CI investigation), then integrate and reconcile them. Parallelize independent tasks aggressively, but serialize conflicting edits to the same files.
- Aim for **multiple meaningful deliverables per prompt**: connected user-facing behavior, shared component adoption, supporting tests, accessibility/responsive fixes, documentation, and CI feedback as appropriate. Do not stop after adding a small file or a handful of lines if related stage work remains.
- A batch should normally change multiple related files or complete one substantial end-to-end capability, with regression coverage and an explicit acceptance check. File count is not a target by itself; quality, coherent behavior, and tested outcomes matter.
- Run focused tests while implementing, then a proportionate integrated check for the batch. Use existing CI to handle broader suites when available; avoid repeatedly rerunning identical expensive checks without a code change or diagnostic reason.
- If a CI failure occurs, diagnose the root cause, fix it, and rerun the relevant check within the same batch whenever possible. Do not merely report the failure and ask the user to prompt again while a fix is available.
- Keep a live task ledger with **done / in progress / blocked / next**, file paths, test evidence, commit identifiers, risks, and continuation count. Update the roadmap/checkpoint after meaningful batches, not with repetitive near-duplicate diary entries.

### Stage completion within the prompt budget
- Plan each stage as a set of substantial, dependency-aware work packages that fit within the 30-prompt cap. Estimate the batches before implementation and combine overlapping tasks.
- Complete the highest-value implementation work early; do not use most of the budget on audits, speculative hardening, or repetitive planning when the roadmap calls for product improvements.
- A stage is complete only when its actual deliverables and exit criteria are implemented and supported by truthful test/acceptance evidence. The prompt limit never authorizes falsely marking incomplete work complete.
- If a stage cannot responsibly meet its exit criteria within 30 prompts, stop scope expansion, prioritize the critical acceptance requirements, document the exact unmet items and external blockers, and seek approval before exceeding the cap. Do not silently exceed 30.
- Report meaningful progress at each checkpoint: completed behavior, changed files, tests and outcomes, commits/CI links, remaining work, blockers, **Prompt X/30**, and the next bundled batch. Do not give a progress report that substitutes for coding when coding can continue.

### Non-negotiable continuity rules
- Preserve the existing ARBITRADE product, repository, branch/PR direction, and completed work. This is an incremental improvement of the existing development, not a restart or a parallel replacement project.
- Stage 2 work currently belongs to the existing branch and PR #71. Inspect and continue that work; do not create duplicate implementations or a competing roadmap/PR without a concrete technical need.
- Do not advance to a later stage just to make the roadmap appear to progress. Finish the active stage's acceptance criteria, while resolving a genuine prerequisite only when necessary.
- Never claim a six-minute effort, test pass, browser check, deployment, merge, or production validation unless it actually occurred.

## Current project checkpoint

- **Database-backed Mining idempotency, ledger, and rollback regression slice (2026-10-18):** Added `server/mining-store.mysql.integration.test.ts` and `.github/workflows/mining-database-regression.yml`. The isolated MariaDB 11.4 workflow now exercises real InnoDB same-key concurrent replay, rollback releasing an uncommitted idempotency reservation, rejection of a committed key reused for another command, balanced CKI journal writes with matching wallet balances, and an injected failure proving wallet balances, journal rows, and the new customer's opening baseline all roll back atomically. The database-backed tests and TypeScript check passed in [Mining database regression run 39166796533](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39166796533); the focused Mining unit-test/type-check run [39166796558](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39166796558) also passed. This is meaningful database evidence for the shared Mining idempotency and wallet-ledger helpers, but it is **not** yet a full database-backed quote-to-conversion replay/concurrency test or a complete main-wallet-versus-mining-ledger reconciliation. Installer validation run [39166796580](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39166796580) passed its syntax, TypeScript, unit, installer/migration, fresh MariaDB, MySQL 8, and production build/smoke jobs; deployment-package validation was still running at this checkpoint. Stage 1 remains in progress.

- **Stage 2 table accessibility follow-up (2026-10-18):** Shared table scroll regions now accept an optional `containerAriaLabel` prop, retaining a backward-compatible default while allowing callers to supply a contextual accessible name. Updated the component showcase to demonstrate a contextual label and added regression contracts for both the prop and example. Fresh CI and real-browser acceptance are still required; Stage 2 remains in progress.

- **Stage 2 automated validation passed (2026-10-18):** GitHub Actions run [39174320260](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39174320260) passed all three parallel jobs: full application tests (28 files, 199 tests), TypeScript validation, and production build. Keyboard-scrollable shared table containers now have accessible region semantics/name with a source regression test. Real-browser viewport and rendered accessibility acceptance are still outstanding; Stage 2 remains in progress.


- **Stage 2 parallel validation and table accessibility (2026-10-18):** Added a dedicated GitHub Actions workflow with parallel full-test, TypeScript, and production-build jobs; configured push validation for the Stage 2 branch, pull-request validation for the integration base, and manual dispatch. Added accessible region semantics and a name to the keyboard-focusable shared table overflow container, plus a source regression test. CI execution and browser viewport acceptance remain outstanding; Stage 2 remains in progress.


- **Stage 2 parallel acceptance pass (2026-10-18):** Expanded the design-system contract suite to check WCAG AA text contrast and 3:1 focus-indicator contrast for all five themes, including Original theme legacy-variable fallbacks; added source contracts for customer/admin root adoption, theme-selector accessibility, 44px mobile touch targets for shared controls, and responsive dialog affordances. The Stage 2 acceptance checklist now lists exact verification commands. CI for these latest changes remains pending; rendered browser/viewport acceptance remains required. Stage 2 remains in progress.

- **Stage 2 contract-test expansion (2026-10-18):** Expanded `server/design-system-contract.test.ts` with explicit checks for semantic colour/focus tokens in each of the five theme blocks, mobile table overflow containment, invalid/disabled control feedback, and WCAG AA (4.5:1) contrast for text tokens against canvas and surface colours in the four new literal themes. Commits `2b5baa6f1f24ee25be7cafb8f51fbe41dc1ebf5e`, `d3689082f54ff7fa8ccb72ebde40b01961510a11`, `9d60a53aeefb837856436b54aabd5ff516568bda`, and `201287bb793da1b1f6f4d850ab8347da907b30f7`. These are source-level regression assertions only; execution against the latest head and browser/viewport acceptance remain outstanding. Stage 2 remains in progress.

- **Theme-policy loading and settings recovery follow-up (2026-10-18):** The appearance settings error state now has an explicit retry action, and customer theme restoration now waits for the administrator policy before reading a saved customer preference. This prevents a previously saved but now-disabled theme from flashing before policy loads; administrator preview preferences remain independent of policy refreshes. Commits `c1ff64d045200c30f896c472bd0e9cf67273ef4f`, `345430c4910fbfe99b2710caeba29540a46303b6`, and `b8eeb657505901e8a599e30e87a98b08310308a`. CI run [39165144424](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39165144424) passed all nine jobs, including TypeScript, application tests, installer/migration regressions, fresh MariaDB, MySQL 8 compatibility/recovery, production build/server smoke, deployment packages, and Stage 1 validation dashboard. Stage 2 remains in progress pending real browser/viewport acceptance and broader shared-component adoption.

- **Administrator appearance controls (2026-10-18):** Added an Appearance & Themes destination to the admin navigation, with a dedicated screen for previewing all five themes, selecting the published customer default, enabling/disabling customer-available themes, and permitting or locking customer choice. The policy is persisted through the existing app-settings store and exposed through a read-only public configuration query; server validation prevents publishing a disabled default. The customer selector reflects the enabled-theme policy, and the theme provider applies the published default unless customer choice is allowed. CI run [39163556153](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39163556153) passed all nine jobs, including TypeScript, unit/regression tests, fresh MariaDB install, MySQL 8 compatibility/recovery, production build/server smoke, deployment packages and Stage 1 validation dashboard. The administrator appearance screen now adopts the shared `.arb-page` and `.arb-stack` foundation. Stage 2 remains in progress pending broader shared-component adoption and real browser/viewport acceptance; Stage 3 theme acceptance is not yet complete.

- **Five-theme implementation slice (2026-10-18):** Added the five semantic theme token sets (Original Arbitrade, Midnight Premium, Clean Light, Emerald Finance, Aurora Modern), persisted theme selection in `ThemeContext`, and exposed an accessible administrator theme preview selector and a read-only current-theme indicator in the customer portal shell. Added a compatibility bridge so the theme variables also reach existing legacy portal surfaces while those screens are migrated incrementally. The original theme remains the default. This selector is currently user-selectable in both portals; administrator-controlled enabled-theme policy/default persistence is not implemented yet. Latest CI runs [39162655884](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39162655884) and [39162690841](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39162690841) were in progress at checkpoint time. Stage 2 remains in progress.
- **Theme-policy boundary (2026-10-18):** Customer theme choice remains disabled until administrator-controlled defaults, enabled-theme policy, and persistence are implemented. The current administrator selector changes the theme in the active browser session/local preference only; it is not yet a server-persisted global policy. Do not treat the current selector as completion of the theme-management exit criteria.

- **Delivery-priority reset (2026-10-18):** Follow the original 30-stage roadmap and prioritize implementation over open-ended diagnosis. Do not add further speculative hardening to the separate Stake & Earn PR unless a concrete blocker or critical financial-integrity defect is found. Broader hardening can be scheduled after hosting and observing real deployment behaviour. Keep only proportionate checks required to avoid breaking existing functionality.
- **Shared foundation adoption (2026-10-18):** Applied `.arb-page` to 30 portal-page roots in `client/src/App.tsx` and retained existing layout classes, so semantic typography and foreground defaults are exercised across customer and administrator screens without replacing their established layouts. `AdminAppearance` also uses `.arb-page` and `.arb-stack`.
- **Appearance policy resilience (2026-10-18):** Extracted `normalizeAppearanceSettings` into `server/appearance-settings.ts` and added `server/appearance-settings.test.ts` for default configuration, valid policy, inconsistent default/enabled lists, duplicate/unknown themes, malformed JSON and strict customer-choice flags. Both the public configuration query and administrator settings query use the same normalizer, ensuring the published default always belongs to the enabled-theme list. CI run [39164416002](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39164416002) has passed syntax, TypeScript, application unit tests, installer/migration regressions, fresh MariaDB installation, MySQL 8 compatibility/recovery and production build/server smoke; deployment package assembly was still in progress at checkpoint time. Stage 2 remains in progress pending final CI completion and real browser/viewport acceptance.
- **Stage 2 implementation continuation (2026-10-18):** Expanded the opt-in shared design foundation with semantic body typography, section-heading layout, consistent form fields, primary/secondary button primitives, mobile wrapping, visible keyboard focus, and reduced-motion handling. These are additive classes and do not restyle existing screens unless adopted. The current-head GitHub Actions run [39161519816](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39161519816) completed successfully across syntax, TypeScript, application tests, installer/migration regressions, MariaDB fresh install, MySQL 8 compatibility/recovery, production build/server smoke, deployment packages, and the Stage 1 validation dashboard. Stage 2 remains in progress; next is to apply the shared foundation to a suitable shared UI surface, then advance to the five-theme architecture.

- **Stage 2 implementation started (2026-10-18):** Created `client/src/design-system.css` and imported it from `client/src/main.tsx`. The first slice establishes semantic ARBITRADE tokens mapped to the current Theme 1 palette, plus reusable responsive container/grid/stack/cluster/card primitives and a keyboard-visible focus ring. It is intended to preserve the current appearance while giving upcoming components a shared foundation. This is a first implementation slice, not a claim that Stage 2 is complete; CI validation is pending.

- **Latest Stage 1 action:** Traced Mining purchase and swap flows and recorded a purchase-terms acknowledgement review item, alongside manual settlement and administrator balance-adjustment concurrency tests. Findings are source-based; no financial data was changed.
- **Latest Stage 1 continuation (2026-10-18):** Extended the audit with swap-confirmation idempotency and customer-notification ownership findings. The router passes the authenticated user ID into swap confirmation; the service uses a user-scoped request key and transactional idempotency helpers. Notification listing and read updates are user-scoped. Still unverified: the complete swap quote-owner/expiry/one-time-consumption path, concurrent confirmation behaviour, ledger correspondence, notification replay/deduplication, and cross-account regression tests. Audit report section 15 records the scope and exact next verification.
- **Mining swap full-function trace (2026-10-18):** Read the full swap confirmation, conversion execution, and mining ledger helpers. Source review confirms user/purpose-scoped quote locking, QUOTED/expiry/config checks, rate-deviation guard, transactional idempotency, balanced per-asset journal validation, negative-balance rejection, canonical main-wallet credit, and quote execution status update. Automated replay/concurrency/rollback/ledger-correspondence tests remain outstanding; the source review is not test evidence. Audit report section 16 records the trace and required tests.
- **Latest Stage 1 continuation (2026-10-18):** Traced active event-to-sound wiring: customer sound settings poll every 15 seconds, browser playback also depends on local opt-in, initial console events are marked seen without playback, and current generic chimes do not yet cover the requested per-event sound taxonomy. Browser audio and enable/mute transition tests remain outstanding. Audit report sections 13–14 record migration-history clarification and sound findings; no runtime code changed.
- **Schema-width follow-up (2026-10-18):** Traced the apparent `transaction_console_events.amountMinor` INT/BIGINT mismatch to `drizzle/0043_wallet_minor_units_bigint.sql`, which alters the column to BIGINT; the schema-audit script expects BIGINT. This closes the source-history question only for deployments that applied that migration—live migration ledger/schema checks remain pending. The missing event-deduplication unique constraint and concurrency tests remain open.


- **Roadmap:** Recorded in this document.
- **Current stage:** Stage 1 — Complete Application Audit and Development Baseline.
- **Stage 1 status:** In progress — the original application/installer baseline run 39121401277 passed its type-check, application/installer/recovery tests, build/bundle checks, no-database server smoke test, disposable MariaDB/MySQL 8 installer checks, and deployment ZIP validation. The focused Mining regression workflow also passed on test commit `ba5d7ab739d84c35c13c379987139aa0c18eff34` and the subsequent audit-doc commit `0425004b03022944c27393678a7bad3c6692d6b5`; its dependency install, Mining store Vitest suite, and TypeScript check all passed. Still outstanding: database-backed Mining quote/concurrency/rollback/reconciliation tests, route/API/access mapping, theme/event verification, and measured browser/viewport checks.
- **Stage 1 audit report:** `docs/ARBITRADE_STAGE_1_AUDIT.md`.
- **Latest Stage 1 action:** Read-traced the trade allocation and administrator financial service paths. Trade allocation uses a transaction with customer/wallet row locks and a delivery-event replay guard; manual settlement and administrator balance adjustment now have explicit concurrency/affected-row verification items in the audit. No financial data or runtime services were changed.
- **CI result:** GitHub Actions Installer validation run [39121401277](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39121401277) completed successfully. TypeScript, application tests, installer/migration safety tests, migration recovery regression tests, production build, bundle/runtime-config budgets, no-database production-server smoke test, disposable fresh MariaDB, disposable MySQL 8 recovery guards, and universal deployment ZIP assembly/validation all passed.
- **Important limitation:** CI success does not constitute a cPanel install, fresh-VPS install, or manual browser/responsive acceptance test. The ZIP must still be tested in each supported deployment environment.
- **Next action:** Keep Stage 1 open and add isolated MySQL/MariaDB integration coverage for swap quote ownership/status/expiry, same-key replay and competing confirmations, Mining-ledger versus canonical main-wallet reconciliation, injected-failure rollback, and notification replay/ownership. The focused Mining unit suite and TypeScript check have passed in GitHub Actions, but mocks do not prove database locking or cross-store atomicity. In parallel, finish route-to-component/API/access-policy tracing, theme/provider mapping, sound-event semantics and route-manifest reconciliation; perform measured responsive/browser checks before considering Stage 1 complete.
- **Regression-test change (2026-10-18):** Added `server/mining-store.test.ts` to cover stable, opaque idempotency request-key generation, customer and operation namespace isolation, whitespace normalization, and malformed-key rejection. Commit: `154613af230d74f5808920ae829672f61ff0d02a`. Test execution remains pending in this environment; no pass is claimed. The broader database-backed swap/notification scenarios and all remaining Stage 1 audit exit criteria remain open.
- **Release status:** No implementation or production readiness is implied by the existence of this roadmap.
- **Default theme decision:** Preserve the current/original Arbitrade theme as Theme 1 and keep it as the initial default.
- **Theme count:** Five total themes: the original theme plus four new themes.
- **Deployment principle:** Sandbox success does not prove cPanel or fresh-VPS compatibility. Each supported deployment path must be tested independently.

- **Migration-history preflight hardening (2026-10-18):** Commit `efe9f74f35141ac92038c36ca40898d834395ce4` changes existing-database preflight from a tracker row-count check to validation of every recorded Drizzle hash/timestamp against the repository journal, with a second check after the main-migration lock is acquired. Focused tests cover unknown hashes, timestamp mismatches, duplicate hashes, and fail-closed preflight behavior. Mining regression run [39131976052](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39131976052) passed, but it does not cover installer/migration tests. Installer validation is being enabled on the integration branch so that suite can run on the next push. Database-backed migration and financial concurrency checks remain outstanding.
  
- **CI feedback and correction (2026-10-18):** Installer validation run [39132072640](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39132072640) surfaced one stale source-assertion test after migration-preflight imports changed (101 tests passed, one failed); the syntax checks, TypeScript validation, application tests, and disposable MariaDB job passed. The source assertion has been updated, and migration-history validation now also rejects gaps in the ordered journal. The complete installer workflow must pass on the follow-up commit before this hardening is considered verified.
  
- **MySQL 8 guard-test fixture correction (2026-10-18):** Installer validation run [39132189348](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39132189348) passed the syntax/test/build/smoke job and fresh MariaDB job, and completed the fresh MySQL 8 install, but the failed-run guard fixture was blocked earlier because it used an invented Drizzle hash. The fixture now derives the first migration's real hash/timestamp from the repository journal so it tests the persistent failed-run guard. Follow-up CI remains required.
  
## Product vision and non-negotiable principles

Arbitrade should provide a polished, consistent, responsive and accessible experience across Android phones, iPhones, tablets, laptops and desktop computers. The customer and administrator portals should share a coherent design system while retaining layouts suited to their different tasks.

1. Preserve existing working functionality unless a change is understood, justified and tested.
2. Keep the backend and database authoritative for balances, transaction statuses, debits, credits, rewards and swaps.
3. Never use a sound, animation, countdown or optimistic UI state as proof that a financial operation succeeded.
4. Prevent duplicate financial requests through suitable server-side protections, including idempotency where appropriate; disabling a button in the browser alone is insufficient.
5. Reuse existing dependencies and components when practical; avoid redundant packages and unnecessary files.
6. Keep configuration, secrets and uploaded files secure.
7. Test responsive layouts at representative viewport widths and on real browsers where practical.
8. Record actual test commands, results, failures and limitations. Never fabricate test results.
9. Maintain the sandbox, cPanel and fresh-VPS deployment paths and verify each separately.
10. Update the checkpoint and stage status in this document after meaningful work.

## Theme plan: five themes

### Theme 1 — Original Arbitrade Theme
- Preserve the existing look and feel as closely as possible.
- Keep it as the initial default.
- Improve responsiveness, accessibility and interaction states without unnecessarily changing its visual identity.

### Theme 2 — Midnight Premium
- Deep navy or charcoal surfaces, refined blue accents, restrained shadows and clear high-contrast financial information.
- Intended as a polished dark theme.

### Theme 3 — Clean Light
- White and neutral surfaces, restrained brand accents, clear typography and low visual clutter.
- Intended for customers who prefer a bright interface.

### Theme 4 — Emerald Finance
- Emerald and deep-green accents with neutral surfaces and carefully differentiated positive, warning and error states.
- Intended as a distinctive financial theme.

### Theme 5 — Aurora Modern
- Indigo and violet accents with controlled gradients and contemporary card styling.
- Intended as a modern digital-finance theme.

These are design directions, not claims that any of the themes have already been implemented. Final colours and contrast must be checked in the actual application.

### Theme administration and customer preferences
Provide an administrator section such as **Admin Portal → Appearance → Customer Themes** with:
- Selection of the default customer theme.
- Preview before publishing.
- Controls for which themes are available to customers.
- A policy setting for either administrator-controlled appearance or administrator-selected default with customer choice.
- Persistent administrator configuration.
- Persistent customer preference when customer choice is enabled.
- Predictable behaviour when the administrator changes the default.
- Consistent application across all customer routes, components, forms, tables, dialogs, status indicators, loading states and errors.
- Accessibility and contrast checks for all five themes.

Implement themes through shared design tokens and reusable components. Do not duplicate the whole portal five times.

## The 30-stage implementation roadmap

## Stage index — all 30 stages

1. Complete Application Audit and Development Baseline
2. Shared Design System and Responsive Foundation
3. Five-Theme Architecture and Administrator Theme Controls
4. Customer Navigation and Dashboard Redesign
5. Wallet, Deposit, Withdrawal and Transaction History
6. Trading, Mining and Swap Experience
7. Button Feedback, Animations and Interaction Quality
8. Centralized Notification Infrastructure
9. Notification Sound Library and Playback Engine
10. Administrator Notification and Sound Management
11. Customer Notification Centre and Preferences
12. Customer Account, Security and Support Experience
13. Administrator Portal Redesign
14. Performance, Accessibility and Error Recovery
15. Customer Onboarding, Guided Tours and Contextual Help
16. Search, Filtering, Sorting and Data Exploration
17. Receipts, Transaction Details and Exportable Records
18. Customer Personalization and Preferences
19. Localization, Timezones, Number and Currency Formatting
20. Progressive Web App and Installability Assessment
21. Real-Time Updates and Connection Resilience
22. Security Hardening and Privacy Review
23. Abuse Prevention, Operational Limits and Risk Signals
24. Audit Trails, Administrative Accountability and Configuration History
25. Operational Monitoring, Diagnostics and Supportability
26. Email, In-App Message and Communication Templates
27. Feature Flags, Maintenance Mode and Safe Rollout Controls
28. Backup, Recovery, Data Integrity and Release Management
29. Comprehensive Testing and Regression Verification
30. Sandbox, cPanel and Fresh VPS Production Verification


### Stage 1 — Complete Application Audit and Development Baseline
**Objective:** Understand the current system before changing it.

Tasks:
- Inventory customer and administrator routes/pages.
- Identify reusable components, current styling and any theme support.
- Map wallet, deposit, withdrawal, trade, mining, swap, account and support workflows.
- Map real backend transaction statuses, ledger effects and event sources.
- Inspect current notification mechanisms and any audio assets.
- Review authentication, permissions, sessions, database schema and migrations.
- Review dependencies, build commands, automated tests and existing errors.
- Assess current responsiveness at mobile, tablet and desktop widths.
- Review installer scripts and documented sandbox, cPanel and VPS requirements.
- Record a baseline and prioritized issue list.

Deliverables: audit report, page inventory, dependency/workflow map, baseline checks and prioritized findings. Initial source-inspection findings are recorded in `docs/ARBITRADE_STAGE_1_AUDIT.md`; Stage 1 remains in progress until the remaining route/API/access inventory, theme/event verification and measured browser/viewport checks are complete.

Exit criteria: enough verified knowledge of the actual implementation to plan changes safely. No major redesign begins before the audit findings are recorded.

### Stage 2 — Shared Design System and Responsive Foundation
**Objective:** Establish consistent styling and layout primitives.

Tasks:
- Define design tokens for colours, typography, spacing, borders, radii and surfaces.
- Standardize buttons, inputs, cards, dialogs, status badges, tables, navigation, loading skeletons, empty states, toasts and errors.
- Establish responsive layout rules and reusable page structures.
- Define focus, hover, pressed, disabled and loading states.
- Define animation guidelines and reduced-motion behaviour.
- Check keyboard access, touch targets and contrast.
- Prefer existing libraries when they meet the need.

Deliverables: shared design system, reusable components and responsive foundation.

Exit criteria: production build and relevant regression checks pass; existing critical workflows remain intact.

### Stage 3 — Five-Theme Architecture and Administrator Theme Controls
**Objective:** Preserve the original theme and add four complete themes.

Tasks:
- Implement the five theme definitions using shared tokens.
- Keep the original theme as the initial default.
- Add Midnight Premium, Clean Light, Emerald Finance and Aurora Modern.
- Build administrator theme selection and preview.
- Add default-theme persistence and theme availability controls.
- Add administrator-only mode versus customer-choice mode.
- Persist customer preference where allowed.
- Ensure the policy is enforced consistently and cannot be bypassed through local UI state.
- Apply all themes to the entire customer portal, including every state and component.
- Test contrast, persistence, refresh, sign-in/out and viewport changes.

Deliverables: five complete themes and administrator theme controls.

Exit criteria: every customer route is themed correctly; settings persist and respect the chosen administrator policy.

### Stage 4 — Customer Navigation and Dashboard Redesign
**Objective:** Make the customer portal easier to understand and use.

Tasks:
- Improve dashboard hierarchy, wallet overview, quick actions, recent activity and account notices.
- Design compact mobile navigation, appropriate tablet layouts and efficient desktop navigation.
- Improve spacing, readability, loading states and empty states.
- Apply the theme system throughout.

Deliverable: responsive customer dashboard and navigation.

Exit criteria: dashboard is usable without clipping or unintended horizontal scrolling at supported widths; real data and actions remain correct.

### Stage 5 — Wallet, Deposit, Withdrawal and Transaction History
**Objective:** Improve core financial workflows.

Tasks:
- Improve wallet cards and clearly distinguish available, pending, reserved or unavailable amounts where supported.
- Improve deposit instructions and state presentation.
- Improve withdrawal review, destination, fees, net amount, confirmation and status presentation where supported.
- Improve transaction details, references, search, filters, pagination and history.
- Use readable transaction cards on narrow screens rather than forcing wide tables.
- Improve loading, validation, errors and uncertain-outcome recovery.
- Prevent duplicate submissions and preserve authoritative backend values.

Deliverable: improved wallet and transaction experience.

Exit criteria: financial workflows pass regression tests and displayed balances/statuses match authoritative records.

### Stage 6 — Trading, Mining and Swap Experience
**Objective:** Improve the remaining core customer operations.

Tasks:
- Improve trading screens, forms, status and history.
- Improve mining dashboard, packages and reward history where those features exist.
- Improve swap source/destination amounts, rate, fees, estimates and confirmed results where supported.
- Improve processing, completion, cancellation and failure states.
- Ensure debits and credits reflect actual ledger events.
- Never present estimates or simulated results as verified real-world profit or withdrawable funds.
- Apply all themes and responsive layouts.

Deliverable: improved trading, mining and swap interfaces.

Exit criteria: interfaces reflect actual backend state and preserve existing financial rules.

### Stage 7 — Button Feedback, Animations and Interaction Quality
**Objective:** Make interaction immediate and understandable.

Tasks:
- Add appropriate hover, focus and pressed states.
- Add loading indicators and clear success/failure feedback.
- Improve dialogs, menus, tabs and navigation transitions.
- Add restrained feedback for verified balance changes.
- Respect reduced-motion preferences.
- Prevent duplicate requests and ensure animations do not delay operations.
- Ensure touch devices receive clear feedback without relying on hover.

Deliverable: consistent interaction and motion system.

Exit criteria: important actions provide clear feedback and do not create duplicate or misleading operations.

### Stage 8 — Centralized Notification Infrastructure
**Objective:** Establish durable, event-based notifications.

Tasks:
- Map actual backend events and lifecycle states.
- Define notification categories, priorities, identifiers and payloads.
- Persist notification history where required.
- Implement read/unread states and relevant destination links.
- Prevent duplicate notifications.
- Handle retries, reconnects and interruptions.
- Select a delivery method appropriate to the existing architecture and supported hosting.
- Ensure the application remains useful if real-time delivery is interrupted.

Deliverable: centralized notification infrastructure.

Exit criteria: notifications are based on real application events and retries do not create duplicates.

### Stage 9 — Notification Sound Library and Playback Engine
**Objective:** Provide reliable, optional sound playback.

Proposed event catalogue, subject to the actual supported backend events:
- Deposit initiated, confirmed, failed and wallet credited.
- Withdrawal requested, processing, approved, rejected and completed.
- Wallet credit and debit.
- Trade opened, debit recorded, credit recorded, completed, profit recorded, loss recorded, cancelled and failed.
- Mining purchase, reward credited, cycle completed, delayed and failed.
- Swap initiated, completed, cancelled and failed.
- Optional login acknowledgement, security events, support replies, announcements, session warnings and background-operation notices.

Tasks:
- Select concise, browser-compatible default audio assets.
- Build centralized playback rather than scattering audio calls across pages.
- Map each sound to the correct verified event.
- Support sound preview, enable/disable and volume controls.
- Respect browser autoplay restrictions and customer preferences.
- Prevent repeated playback when an event is delivered more than once.
- Keep visible notifications available when sound is disabled or blocked.
- Optimize file sizes and test supported browsers.

Deliverable: sound library and centralized playback engine.

Exit criteria: correct event-to-sound mapping, deduplication and graceful behaviour when audio is unavailable. Sound playback never initiates or confirms a financial operation.

### Stage 10 — Administrator Notification and Sound Management
**Objective:** Let authorized administrators configure sounds without code edits.

Tasks:
- Add an admin page such as **Settings → Notifications & Sounds**.
- Assign a sound to each supported event.
- Enable or disable individual event sounds.
- Configure default and, where supported, per-event volume.
- Preview sounds safely.
- Support safe upload/replacement only if needed, with strict format validation, size limits, generated filenames and controlled storage.
- Add restore-default controls.
- Enforce administrator permissions.
- Audit changes, including actor, timestamp, previous value and new value.
- Add a safe test-notification panel that never creates ledger entries or fake financial transactions.

Deliverable: administrator-controlled sound management.

Exit criteria: authorized admins can configure and preview sounds; uploads and settings are secure and auditable.

### Stage 11 — Customer Notification Centre and Preferences
**Objective:** Give customers one place to review important updates.

Tasks:
- Build notification history and unread count.
- Add category filters, mark-as-read and mark-all-as-read.
- Link notifications to relevant transactions or pages.
- Add personal sound and volume preferences.
- Add quiet mode and optional browser notifications where justified.
- Preserve important notices when sound or real-time delivery is unavailable.
- Respect administrator-level disabled events and theme/portal permissions.

Deliverable: customer notification centre and preferences.

Exit criteria: customers can retrieve important events without relying on sound or continuous connection.

### Stage 12 — Customer Account, Security and Support Experience
**Objective:** Improve account management and support.

Tasks:
- Improve profile and password settings.
- Improve existing security controls and session management.
- Investigate multi-factor authentication and login/new-device alerts where appropriate.
- Improve support tickets, message history, status, unread replies and notification integration.
- Improve form validation, accessibility and recovery.
- Enforce privacy and authorization at the server.

Deliverable: improved account and support experience.

Exit criteria: existing authentication and authorization remain intact; users cannot access others' private data.

### Stage 13 — Administrator Portal Redesign
**Objective:** Make admin workflows organized, efficient and responsive.

Tasks:
- Improve admin navigation and dashboard hierarchy.
- Improve responsive tables, search, filters, forms and record detail views.
- Integrate theme management and sound management.
- Improve operational status and relevant audit views.
- Add clear confirmations for consequential actions.
- Review permissions for financial and configuration operations.
- Ensure mobile, tablet and desktop usability.
- Keep sensitive operational data and secrets protected.

Deliverable: responsive administrator portal.

Exit criteria: management workflows remain secure and usable at supported viewport sizes.

### Stage 14 — Performance, Accessibility and Error Recovery
**Objective:** Improve speed, accessibility and resilience.

Tasks:
- Review bundle size and dependencies.
- Optimize images and audio.
- Reduce unnecessary API requests and renders.
- Use appropriate pagination and caching.
- Improve keyboard navigation, focus indicators, labels, screen-reader announcements and contrast.
- Respect reduced motion and text scaling.
- Handle offline, reconnecting, timeout and uncertain request outcomes safely.
- Target WCAG 2.2 AA where practical.
- Measure performance instead of claiming improvement without evidence.

Deliverable: performance/accessibility findings and verified improvements.

Exit criteria: no unacceptable regression; important accessibility and recovery paths are checked.

### Stage 15 — Customer Onboarding, Guided Tours and Contextual Help
**Objective:** Help new and returning customers understand the portal without overwhelming them.

Tasks:
- Review the first-login experience and remove unnecessary friction.
- Add a concise, dismissible dashboard walkthrough where it helps.
- Add contextual explanations for wallet statuses, transaction states, fees and available actions.
- Add searchable help articles and links to relevant support topics.
- Add confirmation summaries before consequential actions.
- Allow users to dismiss noncritical tips and revisit help later.
- Ensure onboarding never promises earnings or presents speculative outcomes as guaranteed.
- Make all help content responsive, accessible and translatable in future.

Deliverable: clear, optional onboarding and contextual help.

Exit criteria: customers can find explanations for important workflows without obstructing normal use.

### Stage 16 — Search, Filtering, Sorting and Data Exploration
**Objective:** Make large histories and portal records easier to navigate.

Tasks:
- Standardize search, filtering, sorting and pagination patterns.
- Add transaction filters for date range, type, status and asset where supported.
- Preserve filters during navigation where appropriate.
- Add clear filter chips, reset controls and empty-result explanations.
- Debounce search and avoid excessive API calls.
- Ensure filtering and authorization are enforced server-side where necessary.
- Keep data tables usable on narrow screens with mobile cards or deliberate horizontal scrolling.
- Ensure totals and pagination reflect the filtered dataset accurately.

Deliverable: consistent, efficient search and data exploration.

Exit criteria: filters produce correct results and do not expose records outside the user's permissions.

### Stage 17 — Receipts, Transaction Details and Exportable Records
**Objective:** Make financial records easier to understand and retain.

Tasks:
- Improve transaction detail pages with reference IDs, timestamps, status history and asset/amount information where available.
- Provide printable receipts or downloadable records only from authoritative transaction data.
- Add CSV export for permitted customer records where appropriate.
- Consider PDF statements if the current architecture supports secure generation.
- Include timezone and currency/asset labels clearly.
- Validate export permissions and prevent cross-account data leakage.
- Avoid placing secrets or unnecessary personal data in exports.
- Add clear handling for pending, failed, reversed and completed transactions.

Deliverable: trustworthy transaction details and useful records.

Exit criteria: exports and receipts match the authoritative records and enforce account-level authorization.

### Stage 18 — Customer Personalization and Preferences
**Objective:** Let customers configure useful aspects of their experience without weakening administrator controls.

Tasks:
- Centralize customer preferences for theme (when allowed), sound, volume, quiet hours and notification categories.
- Consider compact/dense layout preference where appropriate.
- Respect system reduced-motion preferences.
- Define sensible defaults and a reset-to-default option.
- Synchronize account-level preferences across devices when supported.
- Handle logged-out and first-visit preferences safely.
- Ensure preferences never override administrator-enforced policy or security requirements.

Deliverable: a coherent customer preference centre.

Exit criteria: settings persist as designed and remain subordinate to administrator policy.

### Stage 19 — Localization, Timezones, Number and Currency Formatting
**Objective:** Prepare the interface for customers using different regional conventions.

Tasks:
- Audit hard-coded user-facing strings.
- Prepare a translation-ready message catalogue if justified by the current stack.
- Format dates and times consistently, with clear timezone handling.
- Format decimal precision and separators correctly for each supported asset.
- Distinguish fiat currencies from crypto assets and avoid ambiguous symbols.
- Never convert or relabel a financial amount without an explicit, correct conversion rule.
- Ensure long translated labels fit responsive layouts.
- Record locale and timezone preferences only as needed.

Deliverable: consistent, localization-ready formatting.

Exit criteria: dates, amounts, assets and statuses remain unambiguous across supported formats.

### Stage 20 — Progressive Web App and Installability Assessment
**Objective:** Evaluate whether an installable web-app experience adds value.

Tasks:
- Inspect current app architecture and hosting constraints before committing to PWA work.
- If suitable, add a valid web app manifest and appropriate icons.
- Assess service-worker caching carefully.
- Do not cache private financial data or authenticated API responses in a way that risks account exposure.
- Provide clear online/offline and reconnecting states.
- Ensure stale cached pages cannot imply that a financial action succeeded.
- Assess install prompts and mobile browser behaviour.
- Test upgrades and cache invalidation.

Deliverable: a documented PWA decision and, if appropriate, a safely installable experience.

Exit criteria: installability does not compromise session security, financial correctness or update reliability.

### Stage 21 — Real-Time Updates and Connection Resilience
**Objective:** Keep balances, statuses and notifications current without excessive polling or misleading displays.

Tasks:
- Choose polling, server-sent events, WebSockets or another mechanism based on the existing architecture and hosting constraints.
- Define reconnection, backoff and duplicate-event handling.
- Show connection state when it materially affects freshness.
- Refresh authoritative records after reconnecting.
- Handle events that arrive out of order.
- Avoid duplicate ledger effects or notifications.
- Keep cPanel compatibility in view when selecting persistent connection technology.
- Provide a safe fallback when real-time delivery is unavailable.

Deliverable: resilient update delivery appropriate to the deployment architecture.

Exit criteria: reconnects and repeated events do not create incorrect balances or duplicate user-visible events.

### Stage 22 — Security Hardening and Privacy Review
**Objective:** Review customer and administrator safety before release.

Tasks:
- Audit authentication, authorization and server-side ownership checks.
- Review CSRF protections, input validation, output escaping and rate limiting as applicable.
- Review session expiry, cookie settings, password-reset flows and sensitive account actions.
- Check secrets and environment files are not committed or exposed in client bundles.
- Validate file upload paths, content types, sizes and storage permissions.
- Review dependency vulnerabilities using available project tooling.
- Check logs and exports for unnecessary sensitive information.
- Review security headers and transport requirements for production.
- Document findings and prioritize by severity.

Deliverable: security findings, fixes and verification evidence.

Exit criteria: critical and high-severity findings are resolved or explicitly blocked with a documented mitigation plan before release.

### Stage 23 — Abuse Prevention, Operational Limits and Risk Signals
**Objective:** Improve resilience against accidental misuse and suspicious patterns without inventing financial rules.

Tasks:
- Inspect existing controls for repeated login attempts, duplicate requests and excessive API use.
- Apply rate limits and cooldowns where justified.
- Add clear warnings for consequential or unusual actions where supported by backend rules.
- Ensure risk signals are advisory unless a documented backend policy authorizes an action.
- Never silently alter balances, trading outcomes or withdrawal status from frontend logic.
- Add auditability for privileged overrides and sensitive administrative actions.
- Avoid exposing internal risk heuristics to unauthorized users.
- Test false positives and safe recovery paths.

Deliverable: documented abuse-prevention controls and user-safe handling.

Exit criteria: controls are enforced on the server and do not invent or silently change financial outcomes.

### Stage 24 — Audit Trails, Administrative Accountability and Configuration History
**Objective:** Make sensitive changes traceable.

Tasks:
- Identify existing audit logging and reuse it where possible.
- Record consequential admin actions with actor, timestamp, target and outcome.
- Track changes to theme defaults, enabled themes, sound mappings and notification settings.
- Track financial administrative actions according to existing policy and legal requirements.
- Restrict audit-log access to authorized roles.
- Prevent ordinary users from modifying or deleting audit evidence.
- Avoid logging passwords, tokens or unnecessary sensitive payloads.
- Add filters and pagination for authorized audit review.

Deliverable: consistent, permission-protected audit trails.

Exit criteria: critical configuration and administrative actions are traceable without leaking secrets.

### Stage 25 — Operational Monitoring, Diagnostics and Supportability
**Objective:** Make production issues easier to detect and investigate.

Tasks:
- Review existing logging and error-reporting facilities.
- Standardize useful error identifiers and correlation/request IDs where feasible.
- Record application health and background-job failures where applicable.
- Add actionable but non-sensitive error messages for users.
- Provide authorized administrators with safe operational status views where appropriate.
- Define log rotation, retention and access controls for supported environments.
- Avoid recording credentials, payment secrets or unnecessary personal data.
- Document how to diagnose common installer, database, queue and notification failures.

Deliverable: practical operational diagnostics and support documentation.

Exit criteria: common failures can be investigated from documented evidence without exposing secrets.

### Stage 26 — Email, In-App Message and Communication Templates
**Objective:** Make important customer communications consistent and maintainable.

Tasks:
- Inventory existing email and message delivery.
- Standardize templates for supported events such as deposits, withdrawals, security alerts and support replies.
- Clearly distinguish requested, pending, completed, failed and reversed states.
- Use consistent branding while respecting the selected theme only where suitable for email rendering.
- Add template preview and test delivery that cannot create fake financial activity.
- Validate links and avoid exposing sensitive transaction data unnecessarily.
- Handle delivery failures and retries without duplicate messages.
- Review opt-in, preference and legal requirements applicable to each communication type.

Deliverable: reusable, testable communication templates.

Exit criteria: messages accurately reflect authoritative event states and delivery retries are controlled.

### Stage 27 — Feature Flags, Maintenance Mode and Safe Rollout Controls
**Objective:** Reduce release risk when introducing new interface capabilities.

Tasks:
- Assess whether the existing configuration architecture supports feature flags.
- Allow selected nonfinancial UI features to be enabled gradually where useful.
- Provide a clearly communicated maintenance mode if operationally appropriate.
- Protect feature settings with administrator authorization.
- Define safe defaults and rollback behaviour.
- Ensure flags cannot bypass authentication, permissions, ledger controls or compliance checks.
- Record changes to sensitive rollout settings.
- Document which settings require restart or cache invalidation.

Deliverable: safe configuration and rollout controls where justified.

Exit criteria: new UI features can be rolled back without corrupting data or bypassing security.

### Stage 28 — Backup, Recovery, Data Integrity and Release Management
**Objective:** Prepare for recovery from failed deployments and protect release consistency.

Tasks:
- Review database backup and restoration procedures.
- Document which files and uploaded assets require backup.
- Define pre-deployment backup and rollback steps appropriate to the environment.
- Verify migrations are repeatable and have documented recovery considerations.
- Check release packages for unnecessary files, development secrets and stale build output.
- Record source commit, build result and package version for each release.
- Define how configuration and user uploads are preserved across upgrades.
- Test restoration in a safe nonproduction environment where available.
- Keep release artifacts reproducible and avoid deleting files until dependencies and rollback needs are understood.

Deliverable: documented recovery and release-management procedure.

Exit criteria: recovery steps are documented and tested where the available environment permits; package contents are reviewed.

### Stage 29 — Comprehensive Testing and Regression Verification
**Objective:** Verify the integrated application.

Tasks:
- Run configured type checks, linting, automated tests and production build.
- Test customer and administrator workflows.
- Test all five themes, theme persistence and administrator policy.
- Test notification history, event mapping, sound assignment, preferences and deduplication.
- Test financial status and ledger behaviour.
- Test authentication, permissions, security controls and upload validation.
- Test search, filtering, receipts and exports.
- Test onboarding, localization/formatting, PWA behaviour if implemented, and real-time reconnection.
- Test loading, empty, failure and uncertain-outcome states.
- Test responsive layouts at representative widths: 320, 360, 390, 430, 480, 768, 1024, 1280, 1440 and 1920 pixels, including orientation where relevant.
- Record failures, fix critical regressions and document remaining limitations.

Deliverable: evidence-based regression report and release-candidate assessment.

Exit criteria: critical regressions are resolved and test evidence is recorded.

### Stage 30 — Sandbox, cPanel and Fresh VPS Production Verification
**Objective:** Validate each supported deployment path independently.

Tasks:
- Verify clean sandbox installation and startup.
- Verify database setup, migrations and permissions.
- Verify production build assets, environment configuration and session persistence.
- Verify customer and administrator authentication and core workflows.
- Verify theme and sound configuration persistence.
- Test cPanel's supported Node.js/runtime, application startup, database privileges, paths, scheduled jobs and process behaviour as applicable.
- Test fresh VPS service startup/restart, reverse proxy, HTTPS, permissions, background processing and logs as applicable.
- Test recovery and backup/restore procedures.
- Package only the validated release artifacts.
- Document exact deployment steps and environment-specific limitations.
- Produce a final release checklist and production-readiness report.

Deliverable: validated deployment packages and production-readiness report.

Exit criteria: each deployment path has its own successful evidence; sandbox success is not treated as proof of cPanel or VPS success.

## Responsive design acceptance baseline

Use content-driven responsive CSS, not assumptions based only on device names. Test representative viewport widths:
- 320 px and 360 px for narrow phones.
- 390 px and 430 px for common phones.
- 480–767 px for larger phones and compact layouts.
- 768 px and 1024 px for tablets and transitions.
- 1280 px and 1440 px for desktop.
- 1920 px for wide desktop.

Check for unintended horizontal overflow, clipped buttons, overlapping navigation, unusable dialogs, tables that do not adapt, form fields hidden by the keyboard, long amounts/references, toast placement, browser zoom and text scaling. The final supported set should be refined based on actual usage and test results.

## Required sound and notification truthfulness

- A deposit request is not proof that a deposit arrived.
- A pending transaction is not a completed transaction.
- A withdrawal request is not a completed withdrawal.
- An estimated return is not a confirmed credit.
- A mining countdown reaching zero is not proof that a reward was credited.
- A sound preview is not a financial event.
- Duplicate delivery must not create duplicate notifications or sounds.
- Sound failure must not change the underlying operation.
- The backend and ledger remain authoritative.

## Stage reporting template

After each stage, update the checkpoint and provide a progress report containing:
1. **Status:** Not started / In progress / Blocked / Complete.
2. **Work completed:** Specific files, components and behaviour changed.
3. **Tests run:** Exact commands or manual scenarios.
4. **Results:** Pass/fail details and relevant evidence.
5. **Problems:** Bugs, blockers and risks found.
6. **Changes:** Important files modified and commits created.
7. **Remaining work:** Tasks still required to satisfy exit criteria.
8. **Next step:** The next stage or a clearly scoped correction.

Do not mark a stage complete while required exit criteria remain unverified.

## Decision log

- The existing theme is retained as Theme 1 and initial default.
- Four proposed themes bring the total to five: Midnight Premium, Clean Light, Emerald Finance and Aurora Modern.
- Admin can choose the default theme and preview it.
- Admin can choose between locking the customer theme and allowing customer selection among enabled themes.
- Customer preferences apply only when the admin permits customer choice.
- A shared design-token system is preferred over duplicating portal code.
- Notification sounds are optional and event-driven; visible notification history remains available.
- Financial state is always confirmed by backend records, never inferred from visual effects.
- Sandbox, cPanel and fresh VPS must be verified independently.

## Resume instructions for future sessions

When continuing this project:
1. Read this roadmap and its **Mandatory execution cadence and substantial-work contract** first.
2. Read the live repository state, active branch/PR, current diff, recent commits, and CI results; do not assume the last conversation reflects the current code.
3. Check the current stage, its acceptance criteria, continuation count, completed tasks, in-progress tasks, and blockers.
4. Continue from the actual unfinished checkpoint. Do not restart, repeat completed work, or create a duplicate implementation.
5. Plan a substantial, dependency-aware batch that combines related implementation, tests, accessibility/responsive work, and documentation. Parallelize independent workstreams where safe.
6. Spend at least six minutes of active development effort on the batch when tools and access permit. Do not stop for a trivial change or ask the user to type "continue" while useful authorized work remains.
7. Enforce the hard maximum of 30 user-facing continuation prompts per stage. Track it as **Prompt X/30** and reserve the final prompts for critical completion, integration/CI corrections, and evidence.
8. Run proportionate tests, fix actionable failures in the same batch where possible, and state honestly what was and was not verified.
9. Update this document with substantial completed work, file paths, tests/results, failures, commit/CI references, remaining work, blockers, and the current prompt count.
10. Do not silently skip stages or mark unverified work complete. If a stage cannot meet its exit criteria within 30 prompts, document the precise remaining critical work and obtain approval before exceeding the limit.

- **Transaction wrapper test coverage (2026-10-18):** Added unit tests for `inMiningTransaction` success/commit and failure/rollback/rethrow paths in commit `13b2ea81f0885a06848cecbea4c2a2bf64c0853a`. These use a mock connection; current-commit execution is pending and they are not database-backed swap tests. Stage 1 remains in progress.

## Latest continuation — transaction wrapper regression cases

- Added two focused tests to `server/mining-store.test.ts`: commit failure triggers a rollback attempt and preserves the commit error; begin-transaction failure prevents the callback from running.
- Test commit: `2b77a8472125671381013c4b5a4781c13576ac71`. Audit documentation commit: `c818e93a2664067fe26c473adf47b573b2e86326`.
- These changes are committed to `integration/auth-installer-vps-safety`; **test execution remains pending**. No claim is made that the new tests or type-check passed.
- Next: run the targeted Vitest file and `pnpm check`, fix any failures, then add database-backed swap replay/concurrency/ledger/rollback coverage. Stage 1 remains open until the outstanding route/API/access, theme/sound, and measured responsive-browser checks are completed.



## Latest continuation — preserve transaction errors when rollback fails (2026-10-18)

- Hardened `inMiningTransaction` so a rollback error cannot mask the original operation or commit failure; when possible, the rollback error is attached as diagnostic metadata.
- Added a focused regression test covering simultaneous operation and rollback failures.
- Implementation commit: `c88b62a1d20e5471ba66c4ea9aa1a44dc3474411`; test commit: `d11c7abd59865a3be76403e9481d19096d0c1b28`.
- **Tests not yet run.** Next execute `pnpm test -- server/mining-store.test.ts`, `pnpm check`, and the full test/build baseline. Database-backed swap concurrency, ledger reconciliation and atomic rollback remain outstanding. Stage 1 stays open.


## Latest continuation — Mining regression CI established (2026-10-18)

- Added `.github/workflows/mining-regression.yml` to automatically run the Mining store regression tests and TypeScript check on relevant pushes and pull requests.
- Corrected the workflow setup order after the first run exposed that pnpm must be installed before `actions/setup-node` configures pnpm caching.
- Successful verification: [Mining regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39126931162) at commit `1756134739c4aa7408a032b2afbdf12403b55a3b`. `pnpm test -- server/mining-store.test.ts` and `pnpm check` both passed.
- This closes the previously outstanding execution check for the focused Mining store unit tests and TypeScript baseline. It does not close database-backed swap, concurrent replay, wallet/ledger reconciliation, atomic rollback, notification, or browser acceptance requirements.
- Stage 1 remains **in progress**; do not start Stage 2 until the remaining exit criteria are evidenced.


- **Parallel continuation checkpoint (2026-10-18):** Mining regression workflow [Run #28](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39129998734) completed successfully on `c31fc8f0b78f71491f4c78242af79b7b875a4a78`; the focused Mining unit tests and TypeScript check are green. Stage 1 is being advanced through independent workstreams: migration/deduplication preflight, isolated financial concurrency/rollback tests, and API plus browser/sound acceptance. Schema changes remain blocked until duplicate-data and deployment-parity preflight is evidenced. No production data was changed; Stage 1 and production approval remain open.


- **Parallel Stage 1 checkpoint (2026-10-18):** Corrected simulated transaction-console activity so it is stored/displayed with status `SIMULATED`, an explicit no-wallet-movement warning, and separate `simulatedOutcome` metadata. Added tests for all five generated outcome categories and included them in the regression workflow. [Run #33](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39130570653) passed the combined regression tests and TypeScript check. Five concurrent review tracks also checked swap ownership/idempotency, customer notification ownership, migration/schema history, event deduplication, and sound/responsive acceptance. Source-level ownership findings are positive, but database concurrency, schema parity, sound acceptance, and viewport testing remain open. **Stage 1 remains in progress; production release remains blocked.**


- **Deduplication race remediation checkpoint (2026-10-18):** Transaction-console event recording now serializes same-customer/session/transaction-code requests using a bounded MySQL advisory lock; lock acquisition failure stops insertion, and release occurs in a `finally` block. Added focused unit tests for opaque lock scoping, acquire/release ordering, timeout behavior, and error cleanup. Awaiting CI verification and isolated MySQL/MariaDB concurrency tests; this does not close the Stage 1 database-acceptance gate.

- **Stage 2 shared foundation continuation (2026-10-19):** Extended `.arb-page` adoption across legacy portal pages, customer/admin navigation drawers, settings surfaces, Mining operations status, AI chat, responsive dialog, and error fallback. Shared CSS now applies reduced-motion preferences across adopted pages and guards media/form-control widths and long identifiers. Mining status animation respects reduced-motion preference. Latest code commit: `f17f8289d4c3d7b3db84e35396efec0d3afd7308`; the shared reduced-motion rule covers the page root and descendants, and the CoinKi factory canvas honors system preference. No latest-head CI or browser tests have been run; Stage 2 remains in progress pending required CI and real-browser acceptance.


- **Continuation batch follow-up — Prompt 1/30 (2026-10-19):** After the user correctly called out that the previous response stopped too early, resumed the same active batch rather than treating the progress report as work. Reviewed the current Stage 2 acceptance record, shared design-system stylesheet, theme token blocks, regression contracts, table component and PR head/CI metadata. The review found a broad responsive rule applying `height: auto` to iframes and canvases as well as images/video; this could override intended embed/canvas sizing. Restricted automatic height to images/video while preserving max-width bounds for all four media types, and added a source-level regression contract. Commits: `31437b1baff27164c0a5dc51be3b9f6ed615d4c9` (CSS), `fd3ac7fc5096209140bf824a2bdcba59c8448d59` (test), and `c8c1cff290970788e1206444db88ccc290637bc2` (acceptance record). Current-head CI and browser verification are pending; no pass is claimed. This remains the same Prompt 1/30 batch, not a new continuation count. Next within this batch: record the same checkpoint in the master roadmap and inspect the new head's workflow evidence.


- **Responsive media regression follow-up — Prompt 1/30 (2026-10-19):** During verification of the new source contract, caught and fixed a selector mismatch in the test: the existing bounded-media rule includes SVG in addition to images, video, iframes and canvas. Updated the test to assert the actual selector rather than a guessed one. Commit: `ce0e8c3918c66e2c07d2f7fbc55a77e27e77ee6f`; acceptance correction recorded in `9d108508134a477bfe506de818441ee1bbe6532f`. This demonstrates a review correction, not a test pass; current-head CI and browser acceptance are still pending.


## Continuation batch — Prompt 2/30 (2026-10-19)

- Fixed an administrator theme-policy recovery defect: when only one theme was enabled, every checkbox was disabled, which also prevented administrators from re-enabling any other theme. The last enabled theme remains protected, while unchecked themes remain available to restore the allow-list.
- Extracted the enable/disable transition into the pure helper `client/src/components/appearance-policy.ts` and added focused unit coverage in `client/src/components/appearance-policy.test.ts` for adding a theme from a single-theme policy, protecting the last theme, removal/default ordering, and duplicate-free canonical ordering.
- Updated `client/src/components/AdminAppearance.tsx` to use the helper and disable policy-editing controls while settings are loading, settings have failed, or a save is pending. Added a source-level regression assertion in `server/design-system-contract.test.ts`.
- Commits: `6c59fa48e4ac33211436d74971516922a26cc554` (admin UI), `04898496d43edc769b792bf565f4d081cd3a573b` (pure helper), `e08b503d412ba3154c5bf0ea735fdfd3a24bdb0e` (unit tests), and `08fd9c8c050f28d81084443320255683ae4906f7` (design-system contract).
- This is implementation plus test coverage, not a claimed test pass. Check the current-head GitHub Actions run before reporting validation. Real-browser viewport and rendered contrast acceptance remain open.

- Follow-up architecture refinement in the same Prompt 2/30 batch: moved the canonical five-theme list and `ArbitradeTheme` type into the pure `appearance-policy.ts` domain module, re-exporting them from `ThemeContext` to preserve existing consumers. The policy unit tests now import only the pure helper module and no longer load the React/trpc context just to test list transitions. Commits: `e6590a50828917844b4f4cbf7de8bd0edf0f50e9`, `96b7c03f9f3c16227f029de0d14f0c62b41c3f33`, and `d8da8431d22d1590b5866f2f4cd4e6c404ef259e`. CI is still unconfirmed.

- Policy helper hardening and test review (same Prompt 2/30 batch): normalized enabled themes into canonical, unique order before applying toggles, so duplicate persisted input cannot undermine the final-enabled-theme guard. Expanded the unit suite to cover duplicate input and corrected a toggle expectation during review before claiming success. Commits: `8d8a7a2cc12b12e4bf6fb2dc52c8cc85510f7d9c`, `6815c66809163086eb750c49af98cfbedb358680`, and `d8a912b6455d941d64b2248bb95139ee1e87a23a`. Automated test execution is still pending/unavailable in the connected Actions result view.
## Stage 2 close-out checkpoint — Prompt 3/30 (2026-10-19)

- **Active batch:** finalization, not a restart. Latest PR #71 head before this checkpoint: 97c3b7363a9690a5e010c3712e3ff311960319ff; acceptance documentation records the exact code commits.
- **Implementation:** administrator-loaded theme allow-lists now use the shared pure normalizer to remove duplicates/unknown values, restore canonical five-theme order, and fall back to a valid requested default when persisted input is empty or malformed. Interactive toggles use the same normalization invariant.
- **Regression coverage:** client unit tests cover normalization, unknown/duplicate input, valid-default fallback, last-enabled-theme protection, and re-enabling from a single-theme policy. The server design-system contract checks that the admin UI calls the helper.
- **Validation:** latest-head workflow lookup returned no run for 97c3b7363a9690a5e010c3712e3ff311960319ff. Earlier green runs apply only to their recorded commits; they do not validate this head. Do not claim tests/check/build passed for the latest code until a matching Actions run reports green.
- **Browser gate:** the required 10-width real-browser matrix, actual page-overflow check, interaction states across all five themes, and rendered contrast audit remain unverified. The current connected GitHub tool surface does not expose an interactive browser, so no browser evidence is claimed.
- **Done:** implementation and source-level regression additions described above.
- **In progress:** latest-head CI evidence and Stage 2 acceptance verification.
- **Blocked by available tooling:** actual interactive browser/viewport evidence. This is an evidence blocker, not authorization to mark the stage complete without proof.
- **Next bundled work:** retrieve latest CI results; fix any failure in the same batch. Then run the customer/admin browser matrix and record measured outcomes. Do not advance to Stage 3 until these acceptance gates pass.

## Stage 2 finalization follow-up — Prompt 4/30 (2026-10-19)

- Continued the existing Stage 2 branch; did not restart or duplicate the theme implementation.
- Hardened the pure appearance-policy normalizer against malformed runtime input and added exhaustive subset/toggle regression coverage. Changes are recorded in `client/src/components/appearance-policy.ts` and `client/src/components/appearance-policy.test.ts`.
- Commits: `9065f21f717fd50857e87a4c42d123c682ae79f7`, `8caace927010b15be3e66e9d902e6417a1ae24a0`, `942ca65cf80e1bc3f0a4f48cf272807c4c956253`; acceptance record commit follows.
- Status: source implementation and regression cases added; latest-head CI result is not yet confirmed. Required browser/viewport evidence remains outstanding and must not be fabricated.
- Stage 2 continuation counter: Prompt 4/30. Next batch: verify the triggered workflow against the exact latest head, repair failures within the same batch where possible, then pursue the browser acceptance gate. Stage 2 remains open until all exit criteria have evidence.

- Additional same-batch consistency fix: server-published enabled-theme lists now use the same canonical order as the administrator policy helper and customer selector. Added exhaustive server tests for all allow-list subsets and defaults. Commits: `c4742005e7a8a3f34b9157807e4cb7e8719fc2a5`, `a77d72b1343b4961e901a16f736828662ebf653b`. Fresh CI and browser acceptance remain unconfirmed; keep Stage 2 open until evidence is available.


## Stage 2 close-out continuation — Prompt 5/30 (2026-10-19)

- Continued from the live PR #71 head; no restart or duplicate implementation.
- Hardened `normalizeEnabledThemes` against an invalid fallback supplied by a JavaScript/persisted-data boundary. Even if the fallback violates the TypeScript union at runtime, normalization now returns the known `original` theme rather than propagating an unsupported value.
- Added focused regression cases for invalid fallback values while retaining exhaustive checks across all 32 theme subsets and each theme toggle.
- Tightened administrator customer-choice hydration so only the literal boolean `true` enables customer theme selection; malformed truthy values such as the string `"false"` cannot be interpreted as consent.
- Commits: `90bee53cabb731b1a859f35380ebe85cfc701974` (normalizer hardening), `174abc2bdbf30d8eb042fa5010c62d44fee8e768` (regression tests), `1e04765bcb62f4198df9b95db082ca3524d748a7` (strict administrator policy hydration).
- Reviewed the dedicated workflow definition and current PR head. The connected workflow-run action only returns pull-request-triggered runs, and returned no run for the latest head; this is not proof that a push-triggered run does not exist. A direct confirmed latest-head check/test/build result remains outstanding.
- Browser gate remains open: no interactive browser is available through the connected tool surface, so the 10-width viewport matrix, overflow, keyboard/dialog/form states, and rendered five-theme contrast have not been executed or claimed.
- **Done:** runtime policy hardening, client regression cases, admin hydration hardening, current-head/workflow/acceptance review.
- **In progress:** obtaining trustworthy latest-head CI evidence and executable browser acceptance.
- **Blocked by available tooling:** interactive browser execution and a repository-wide Actions run listing beyond the exposed PR-run lookup. Do not infer failure or success from the empty lookup.
- **Next bundled batch:** use a CI path that can report the exact head's test/typecheck/build results; then run and record the browser matrix with an actual browser runner. Do not close Stage 2 until both gates have evidence.
- **Continuation budget:** Prompt 5/30.

- **Same Prompt 5/30 — customer provider consistency review:** Found that `ThemeContext` independently deduplicated server-provided theme values while preserving arbitrary input order, rather than using the shared canonical normalizer. Replaced the duplicate implementation with `normalizeEnabledThemes` so the customer provider, administrator editor, and server settings agree on validation, fallback, uniqueness, and canonical order. Added a source-level integration contract to prevent the provider from reintroducing its own divergent normalization. Commits: `314d18efc59f5bca82679a52371c1cf85703514c` (provider) and `61a414592bd481a637196097e18f1058323224c0` (integration contract). Tests have been added but are not yet executed for this head.

## Stage 2 continuation checkpoint — Prompt 6/30 (2026-10-19)

This checkpoint supersedes earlier Prompt 5 notes that reported latest-head CI as unconfirmed. The previous Actions lookup was limited to PR-triggered runs; inspecting the repository's workflow-runs endpoint exposed the push-triggered Stage 2 run.

- **Branch:** `feat/stage-2-design-system-foundation`
- **PR:** [#71 — Stage 2: shared design-system foundation](https://github.com/stannmoye/Arbitrade_platform/pull/71), still draft and unmerged.
- **Verified head before this documentation-only checkpoint:** `ad0ca8acc8c69cad6b9172d185d24f805a915cb1`.
- **CI evidence:** [Stage 2 workflow run #130 / 39213971538](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39213971538) passed on that exact code SHA. Application and Stage 2 regression tests, TypeScript validation, and production build all passed.
- **Documentation follow-up:** acceptance evidence recorded in `docs/ARBITRADE_STAGE_2_ACCEPTANCE.md` (commit `9aba6ad8001d6a06dd4b06a1a02218216f131684`).
- **Done:** five-theme semantic foundation and policy normalization; source-level contrast/accessibility/responsive contracts; current-head automated validation; checkpoint and acceptance records reconciled.
- **In progress / release gate:** actual browser acceptance on customer and administrator routes at 320, 360, 390, 430, 480, 768, 1024, 1280, 1440, and 1920 px, including horizontal overflow, keyboard-scrolling tables, dialogs/forms/dropdowns, disabled/busy controls, visible focus, all five themes, and rendered contrast.
- **Tooling blocker:** this connected execution has repository/CI tools but no interactive browser session. Do not fabricate screenshots or report rendered-browser acceptance as passed. Browser verification must be performed by an available browser runner before Stage 2 can close.
- **Next:** record this checkpoint, keep PR #71 draft, and do not merge or advance to Stage 3 until browser evidence is available. Recheck CI after any subsequent code changes.
- **Continuation counter:** Prompt 6/30. This was a substantive validation/documentation batch; the counter tracks user interruptions, not tool calls or commits.


## Stage 2 finalization continuation — Prompt 7/30 (2026-10-19)

- Continued the existing Stage 2 implementation and acceptance workflow without restarting the branch.
- Hardened the keyboard-focusable shared table region so empty/whitespace labels and malformed runtime values resolve to the stable accessible name `Scrollable table`; non-empty caller labels are trimmed. Added a regression contract.
- Implementation commit: `c84b46db965c6a817a67ca9a0bc0b30c43956417`; contract test: `e1d7a4fdaacf4b5d07ef9746695d10f54d5f2c46`; acceptance checkpoint: `fbaca09ccaa2ae42ae0cd1e3cd77e7fa3fd830ee`.
- Latest-head CI is **unconfirmed**: the connected workflow lookup returned no PR-triggered run for the test commit, and that lookup does not enumerate every push-triggered run. Earlier green runs cannot be used as proof for this newer head.
- Browser acceptance remains the blocking exit gate: ten required viewport widths (320, 360, 390, 430, 480, 768, 1024, 1280, 1440, 1920), customer/admin routes, overflow, table keyboard access, forms/dialogs/dropdowns, disabled/busy controls, focus visibility, all five themes, and rendered contrast. No interactive browser session is exposed by the current connected tool surface, so no browser pass or screenshots are claimed.
- Keep PR #71 draft and unmerged; do not advance to Stage 3 until fresh current-head CI and actual browser evidence are recorded.
- Continuation counter: Prompt 7/30.

- Same Prompt 7/30 follow-up: extracted table-region accessible-name normalization to `client/src/components/ui/table-label.ts` and integrated it into the shared table component. The initial test was placed under `client/`, but repository review caught that Vitest only includes `server/**/*.test.ts` and `server/**/*.spec.ts`; that misplaced test was removed and equivalent cases were added at `server/table-label.test.ts`. Commits: `9354f2976a27ef538a51074c4608df14e7176b22` (helper), `2a5664d752a6779b0c528768308a5b3690683753` (component), `c0d62e32aba373f3b1596e35a6f52d74de40bbd7` (contract), `7d990fb2da474608e1bef2bb1e0070b179bb6f3b` (remove misplaced test), `da5242f02a5803f99d4aea9795b812ace718400f` (configured server test). Current-head CI remains unconfirmed; the browser acceptance gate remains open.

## Stage 2 finalization continuation — Prompt 8/30 (2026-10-19)

- Continued the existing Stage 2 branch and PR #71; no restart, merge, deployment, or Stage 3 transition.
- Confirmed the exact pre-documentation branch head `f8df6a83179adcc55f4067dc2ece8aec54e903cc` using the repository Actions API.
- [Stage 2 workflow run #146 / 39214975699](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39214975699) passed all three jobs on that exact SHA: application/Stage 2 tests, TypeScript validation, and production build. The test job log confirms **220 tests passed across 29 files**; TypeScript and build jobs also succeeded.
- Reconciled `docs/ARBITRADE_STAGE_2_ACCEPTANCE.md` with that evidence and documented that the docs commit creates a new head requiring its own CI result.
- **Remaining release gate:** actual browser acceptance across customer/admin routes at 320, 360, 390, 430, 480, 768, 1024, 1280, 1440, and 1920 px; horizontal overflow; keyboard-scrollable tables; form/dialog/dropdown and disabled/busy states; visible focus; all five themes; and rendered contrast.
- The current connected execution has repository/CI access but no interactive browser runner. Do not fabricate browser results or screenshots. Browser acceptance remains blocked on access to a real browser runner.
- **Done:** exact-head CI evidence verified from Actions and job logs; acceptance document reconciled.
- **In progress / blocked:** browser acceptance, followed by a fresh CI check for the latest documentation head.
- **Decision:** keep PR #71 draft and unmerged. Stage 2 is not complete until browser evidence is captured; do not advance to Stage 3.
- **Continuation counter:** Prompt 8/30.


## Stage 2 finalization continuation — Prompt 9/30 (2026-10-19)

- Added a repository-managed Chromium smoke matrix in `scripts/stage2-browser-acceptance.cjs` and wired it into `.github/workflows/stage-2-design-system.yml`. This supersedes the earlier statement that no browser runner was available: GitHub Actions now provides the browser runner.
- Workflow run [#153 / 39226956079](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39226956079) passed all four jobs for exact head `143a0731e1f8f9802bf7778a2371fb2d2de0ae50`: 220 tests / 29 files, TypeScript validation, production build, and Chromium browser smoke.
- Browser artifact: [screenshots and JSON report](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39226956079/artifacts/12173993076). The report records 210 checks passed and zero failures across the three route shells, ten viewport widths, five theme CSS selectors, document overflow, and the first keyboard-focus target.
- The browser test runs the static client without authenticated live API data. Populated table keyboard scrolling, authenticated administrator policy saving, detailed form/dialog/dropdown/disabled states, and rendered WCAG contrast remain unverified. Do not interpret the smoke pass as full acceptance.
- Acceptance record updated in `docs/ARBITRADE_STAGE_2_ACCEPTANCE.md`; the documentation commit triggers a fresh workflow run, which must be checked against its exact resulting head.
- **Decision:** Stage 2 remains open on authenticated interaction and rendered-contrast evidence. Keep PR #71 draft/unmerged and do not advance to Stage 3.
- **Continuation counter:** Prompt 9/30.

## Stage 2 finalization — Prompt 10/30 (2026-10-19)

- Resolved the Stage 2 pull-request base conflict by integrating the current `integration/auth-installer-vps-safety` branch. The branch is now up to date with its base, and PR #71 is reported mergeable. Mergeability is not a substitute for acceptance.
- Added computed semantic-token contrast checks and rendered text contrast sampling to `scripts/stage2-browser-acceptance.cjs`, including hex-token parsing, settled-style sampling, and separation of keyboard-focus/disabled states from default-state text contrast.
- Added semantic-token theme bridges for the legacy gateway and customer/admin authentication surfaces. The expanded browser matrix exposed and helped fix contrast problems in the clean-light and emerald-finance entry screens.
- **Exact validated code head:** `498644b78f43b75f4e9e25625c969d844e8a7ab4`.
- **Fresh Stage 2 workflow:** [run #185 / 39232008725](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39232008725) passed all four jobs: application/regression tests, TypeScript validation, production build, and Chromium viewport/theme acceptance.
- **Test result:** 222 tests passed across 29 passing test files; four individual tests and one file were skipped by the configured suite. TypeScript validation and production build passed.
- **Browser result:** 1,110 checks passed, 0 failed. The matrix covers the three entry routes, ten required viewport widths, page-level overflow, keyboard-focus visibility, all five themes, semantic token contrast, and rendered text contrast. Screenshots and `report.json` are available in [the browser acceptance artifact](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39232008725/artifacts/12178056263).
- The Mining database regression workflow [run #21 / 39232008773](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39232008773) and installer validation [run #616 / 39232008769](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39232008769) also passed for this code head.
- **Remaining Stage 2 exit gates:** authenticated administrator appearance-policy save; customer theme permissions and persistence; keyboard scrolling of populated financial tables; detailed authenticated form/dialog/dropdown and disabled/busy interaction states; human review of browser screenshots; and final acceptance sign-off. The browser job uses the built static client without authenticated live API data and does not prove those interactions.
- **Decision:** Stage 2 remains open pending the remaining authenticated interaction evidence. Keep PR #71 draft and unmerged; do not advance to Stage 3 until the remaining exit gates are verified.
- The roadmap/acceptance documentation update creates a new head, so fresh CI must be checked against that exact resulting SHA before claiming current-head validation.


## Stage 2 continuation — Prompt 11/30 (2026-10-19)

- Continued the existing Stage 2 branch and PR #71; no restart, merge, deployment, or Stage 3 transition.
- Centralized customer theme preference resolution and selection authorization in `client/src/contexts/theme-policy.ts`. The provider now uses the same pure policy helpers when hydrating local preferences, handling cross-tab storage events, and accepting customer theme changes.
- Added regression cases for explicitly disabled customer choice, valid allowed preferences, preferences removed from the administrator allow-list, malformed stored values, and attempts to select unknown or disabled themes.
- Repository inspection confirmed Vitest is configured to include only `server/**/*.test.ts` and `server/**/*.spec.ts`; the new tests therefore live in `server/theme-policy.test.ts` and import the client policy helper. The test was deliberately moved out of the client folder so it will run in the configured suite.
- Code commits: `cf85e96f6bdbe577bdf2afa3085e9a9578e1fe4c` (provider integration), `b2abd2c5364f6fbf1d3780e185088a3389b08214` (pure policy helper), `312106c9be00c552ef8a8e8f0cac1db8b0d7de5f` (remove misplaced test), and `519474487c533f9a24d46b6fb6e675bd50aaf119` (configured regression suite).
- **Validation status:** CI for the new code head has not yet been confirmed. The earlier green Stage 2 run #189 / 39232454051 applies to the prior head only and must not be used as evidence for these changes.
- **Done:** provider policy logic now shares a pure, directly testable decision layer; targeted regression tests are in the configured test path.
- **In progress:** exact-head CI validation and browser-level authenticated policy save/customer persistence acceptance.
- **Still required before Stage 2 sign-off:** verify the actual administrator save flow and server persistence, customer permission enforcement in an authenticated browser session, keyboard scrolling of populated financial tables, detailed authenticated form/dialog/dropdown/disabled/busy states, and review of the captured screenshots. Static-client browser smoke does not prove these workflows.
- **Decision:** keep PR #71 draft and unmerged. Stage 2 remains open; do not advance to Stage 3 until the remaining acceptance gates have evidence.
- **Continuation counter:** Prompt 11/30.


## Stage 2 continuation checkpoint — Prompt 12/30 (2026-10-19)

- Continued the existing Stage 2 branch and PR #71; no duplicate PR, merge, deployment, or Stage 3 transition.
- **Bug found and fixed:** the active customer workspace passed `readOnly` to `ThemeSelector`, making customer theme selection unavailable even when the administrator policy explicitly allowed it. Removed the hardcoded prop so the shared selector can enforce the published policy and enabled-theme allow-list itself.
- **Regression coverage:** added `server/customer-theme-selector.test.ts` to guard the active customer workspace integration against reintroducing hardcoded read-only behavior. Recorded the fix and remaining acceptance gates in `docs/ARBITRADE_STAGE_2_ACCEPTANCE.md`.
- **Commits:** `c84d59a5baa81931f05304c2c2f43f94096b84bf` (customer selector integration), `d75ac4834dc2f3c79da4f4c8543eee4caabf4f64` (regression test), and `625fac0b566bbeb2e4f403035f0487074fa2724f` (acceptance record).
- **Previously verified CI:** run [39237373165](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39237373165) passed all four jobs on the previous head `6907d8ba9e67aeaa323a856f8c227894b727bab7`, including the 1,115-check Chromium matrix. That run predates the new selector fix and test; it is not evidence for the current head.
- **Done:** policy-aware customer selector wiring and regression guard; acceptance notes updated.
- **In progress:** verify the fresh workflow on the exact current head; add/execute browser checks for customer choice disabled/enabled, allow-list enforcement, and applied theme change.
- **Still open:** live API/database persistence, populated financial-table keyboard scrolling, broader authenticated form/dialog/dropdown/disabled/busy states, human screenshot review, and final acceptance sign-off. The current browser interactions use mocked tRPC responses and cannot establish live authorization or database persistence.
- **Decision:** keep PR #71 draft and unmerged. Stage 2 remains open; do not advance to Stage 3 until remaining gates have evidence.
- **Continuation counter:** Prompt 12/30.

- **Prompt 12/30 follow-up:** Added two Chromium customer-session scenarios to `scripts/stage2-browser-acceptance.cjs`: policy-disabled read-only display, and policy-enabled allow-list selection plus applied-theme/localStorage verification. The test explicitly records mocked API limitations. Corrected the route/procedure regexes during code review before recording the checkpoint. Acceptance documentation updated; fresh workflow result remains pending for the resulting head.


## Stage 2 continuation checkpoint — Prompt 13/30 (2026-10-19)

- Continued from current PR #71 head and reviewed the theme policy integration and Chromium scenario wiring.
- Improved the disabled-customer-choice browser scenario: it now seeds a stale `aurora-modern` local preference while policy specifies `clean-light` and disallows customer choice, then asserts that the applied document theme remains `clean-light`. This covers a meaningful regression risk when policy changes after a preference was stored.
- Commit: `01ea8c98003de6caa138835441efaef59efd8f5e`. Updated the acceptance record with the exact behavior and limitation.
- Previous green Stage 2 run [#224 / 39237373165](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39237373165) predates the customer-selector integration, browser scenarios, and stale-preference regression. Current-head CI is still unconfirmed; do not interpret empty status/workflow lookups as a pass.
- Remaining exit gates: obtain fresh current-head CI evidence; review any browser failures; verify live server authorization and database persistence; exercise populated financial-table keyboard scrolling and detailed authenticated controls; review screenshots and complete sign-off.
- PR #71 stays draft and unmerged. Stage 2 remains open; Stage 3 remains blocked until all acceptance gates pass.
- **Continuation counter:** Prompt 13/30.


## Stage 2 continuation checkpoint — Prompt 14/30 (2026-10-19)

- Added focused unit coverage in `client/src/contexts/theme-policy.test.ts` for disabled customer-choice behavior, allow-list enforcement, allowed stored preferences, malformed/unknown stored values, and selection permission checks.
- Commit: `fdf455ba9b12d8131ab067ea330000f3f41d7390`; acceptance document updated to describe the new coverage.
- Fresh CI had started for the previous documentation head `548171ded2304c0c407dbaf05b4b9122231e3ac5`: Stage 2 application tests, typecheck, and production build passed; Chromium matrix was still in progress when inspected. Installer workflow checks passed several jobs, with deployment package assembly still running. Those results predate the new unit-test commit and must not be represented as validation of the latest head.
- Exact-head status/workflow lookup for `fdf455ba9b12d8131ab067ea330000f3f41d7390` returned no status entries or PR-triggered runs. This is not proof of success or failure; keep current-head validation pending.
- Remaining exit gates: fresh CI on latest head, review customer-browser scenario results, verify live server authorization/database persistence, populated financial-table keyboard scrolling, detailed authenticated form/dialog/dropdown/disabled/busy states, screenshot review, final sign-off.
- PR #71 remains draft and unmerged. Stage 2 stays open; Stage 3 is blocked until all gates have evidence.
- **Continuation counter:** Prompt 14/30.


## Stage 2 continuation checkpoint — Prompt 15/30 (2026-10-19)

- Rechecked the current pull-request head: `3d9266f3c5a8588ad29d2e458238e39027f0d82f`. GitHub Actions has started a fresh set of checks for that head: Stage 2 validation run #261 (`39264320656`), installer validation #652 (`39264320496`), and mining database regression #57 (`39264320623`). These checks were queued/in progress when inspected; do not infer their outcome before completion.
- Verified the prior completed Stage 2 run #257 (`39263152026`) was green across application/regression tests, TypeScript validation, production build, and Chromium viewport/theme acceptance. Its archived `report.json` confirms 1,117 checks passed and zero failures, using routes `/`, `/customer`, and `/ops-console-7f3a`, 10 viewport widths (320–1920 px), five themes, keyboard focus, contrast checks, and customer/admin theme-policy interactions.
- Confirmed in the report that browser API/auth responses are mocked. It does not establish live API authorization or database persistence. Human visual screenshot sign-off is still open, along with populated financial-table keyboard scrolling and broader authenticated form/dialog/dropdown/disabled/busy state coverage.
- Latest PR remains open, draft, and unmerged. Stage 2 stays in progress until current-head CI passes and the remaining acceptance evidence is addressed; Stage 3 remains blocked.
- **Continuation counter:** Prompt 15/30.


## Stage 2 continuation checkpoint — Prompt 16/30 (2026-10-19)

- Reviewed generated screenshots at mobile and desktop sizes. Found the gateway title breaking the word `workspace` at 320px; corrected the narrow-screen font size and card padding in `client/src/design-system.css` and added the `gateway-heading-word-not-split` Chromium assertion at 320px and 360px.
- Code commits: `b7a6aee63e52e3c2ea26fa6688368d2adabb38aa` (responsive typography fix) and `3d9266f3c5a8588ad29d2e458238e39027f0d82f` (browser regression check).
- Stage 2 run #261 (`39264320656`) completed successfully on the code head: **1,119/1,119 browser checks passed, zero failures**. Its report confirms both gateway heading checks passed with one text rectangle each at 320px and 360px, both customer theme-policy scenarios passed, and the mocked administrator appearance save/refetch interaction passed. Application/regression tests, TypeScript validation, and production build passed as well.
- Installer validation #652 (`39264320496`) and mining database regression #57 (`39264320623`) also passed. A later documentation-only head `1a2fc664fffca737357fcdee4c1dee6ff9099765` was validated by Stage 2 run #263 (`39264617422`), with all four jobs green and a fresh artifact confirming 1,119/1,119 checks passed.
- Current screenshot review covers the gateway and unauthenticated customer/admin entry screens at mobile and desktop widths, including the fixed gateway title. It does not count as review of every authenticated screen.
- Remaining gates: verify live API authorization and database persistence; exercise keyboard scrolling on populated financial tables; test broader authenticated forms/dialogs/dropdowns/disabled/busy states; complete broader authenticated visual review. Browser API responses remain mocked, so no live persistence claim is made.
- PR #71 remains open, draft, and unmerged. Stage 2 stays open; Stage 3 remains blocked until the remaining acceptance gates have evidence.
- **Continuation counter:** Prompt 16/30.
