# Arbitrade Master Development Roadmap

**Repository:** `stannmoye/Arbitrade_platform`  
**Working branch:** `integration/auth-installer-vps-safety`  
**Roadmap version:** 2.0  
**Purpose:** The durable source of truth for the customer experience, themes, notifications, sounds, responsive layouts, administrator portal, quality assurance, and deployment-verification work.

> **Working rule:** Complete and verify one stage at a time. Update this document as work progresses so the team can always identify what is complete, what is in progress, what failed, and what comes next. Do not claim a task or test is complete unless it has actually been implemented or run.

## Current project checkpoint

- **Roadmap:** Recorded in this document.
- **Current stage:** Stage 1 — Complete Application Audit and Development Baseline.
- **Stage 1 status:** In progress — initial audit is committed and GitHub Actions baseline run 39121401277 passed type-check, app/installer/recovery tests, build/bundle checks, no-database server smoke test, fresh MariaDB and MySQL 8 installer checks, and universal ZIP assembly. Route/API/access mapping, theme/event verification and measured browser checks remain outstanding.
- **Stage 1 audit report:** `docs/ARBITRADE_STAGE_1_AUDIT.md`.
- **Latest Stage 1 action:** Source-traced all 25 distinct admin navigation targets to section render conditions; mapped customer core destinations and 12 resource destinations to explicit branches/registries. Confirmed the standalone `ThemeContext` is not used by the active entry/App files. Recorded the 320 px minimum width, mobile CSS breakpoints and reduced-motion rules, while keeping measured browser/viewport checks open.
- **CI result:** GitHub Actions Installer validation run [39121401277](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39121401277) completed successfully. TypeScript, application tests, installer/migration safety tests, migration recovery regression tests, production build, bundle/runtime-config budgets, no-database production-server smoke test, disposable fresh MariaDB, disposable MySQL 8 recovery guards, and universal deployment ZIP assembly/validation all passed.
- **Important limitation:** CI success does not constitute a cPanel install, fresh-VPS install, or manual browser/responsive acceptance test. The ZIP must still be tested in each supported deployment environment.
- **Next action:** Finish route-to-component/API/access-policy tracing, theme/provider mapping, sound-event semantics and route-manifest reconciliation; then perform measured responsive/browser checks before considering Stage 1 complete.
- **Release status:** No implementation or production readiness is implied by the existence of this roadmap.
- **Default theme decision:** Preserve the current/original Arbitrade theme as Theme 1 and keep it as the initial default.
- **Theme count:** Five total themes: the original theme plus four new themes.
- **Deployment principle:** Sandbox success does not prove cPanel or fresh-VPS compatibility. Each supported deployment path must be tested independently.

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
1. Read this roadmap first.
2. Read the latest repository state and recent commits; do not assume the last conversation reflects the current code.
3. Check the **Current project checkpoint** and the status of each stage.
4. Continue from the first stage that is not complete, unless a documented blocker or dependency requires otherwise.
5. Verify prior claims against actual files and test evidence.
6. Update this document with stage status, completed work, tests, failures, commit references and next actions.
7. Do not silently skip stages or mark unverified work complete.
