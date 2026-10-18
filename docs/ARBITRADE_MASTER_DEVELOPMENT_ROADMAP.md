# Arbitrade Master Development Roadmap

**Repository:** `stannmoye/Arbitrade_platform`  
**Working branch:** `integration/auth-installer-vps-safety`  
**Roadmap version:** 1.0  
**Purpose:** The durable source of truth for the customer experience, themes, notifications, sounds, responsive layouts, administrator portal, quality assurance, and deployment-verification work.

> **Working rule:** Complete and verify one stage at a time. Update this document as work progresses so the team can always identify what is complete, what is in progress, what failed, and what comes next. Do not claim a task or test is complete unless it has actually been implemented or run.

## Current project checkpoint

- **Roadmap:** Recorded in this document.
- **Current stage:** Stage 1 — Complete Application Audit and Development Baseline.
- **Stage 1 status:** Not started.
- **Next action:** Inspect the actual repository and record the existing pages, components, backend events, tests, responsive behaviour, and deployment constraints before making major interface changes.
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

## The 16-stage implementation roadmap

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

Deliverables: audit report, page inventory, dependency/workflow map, baseline checks and prioritized findings.

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

### Stage 15 — Comprehensive Testing and Regression Verification
**Objective:** Verify the integrated application.

Tasks:
- Run configured type checks, linting, automated tests and production build.
- Test customer and administrator workflows.
- Test all five themes, theme persistence and administrator policy.
- Test notification history, event mapping, sound assignment, preferences and deduplication.
- Test financial status and ledger behaviour.
- Test authentication, permissions and upload validation.
- Test loading, empty, failure and uncertain-outcome states.
- Test responsive layouts at representative widths: 320, 360, 390, 430, 480, 768, 1024, 1280, 1440 and 1920 pixels, including orientation where relevant.
- Record failures, fix critical regressions and document remaining limitations.

Deliverable: evidence-based regression report and release-candidate assessment.

Exit criteria: critical regressions are resolved and test evidence is recorded.

### Stage 16 — Sandbox, cPanel and Fresh VPS Production Verification
**Objective:** Validate each supported deployment path independently.

Tasks:
- Verify clean sandbox installation and startup.
- Verify database setup, migrations and permissions.
- Verify production build assets, environment configuration and session persistence.
- Verify customer and admin authentication and core workflows.
- Verify theme and sound configuration persistence.
- Test cPanel's supported Node.js/runtime, application startup, database privileges, paths, scheduled jobs and process behaviour as applicable.
- Test fresh VPS service startup/restart, reverse proxy, HTTPS, permissions, background processing and logs as applicable.
- Test recovery and backup/restore procedures.
- Package only the validated release artifacts.
- Document exact deployment steps and environment-specific limitations.

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
