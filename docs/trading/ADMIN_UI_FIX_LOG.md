# Admin Trading UI Fix Log

## 2026-11-01 — Single Trade Settings menu and quota-save integrity

- Replaced five separate Trading navigation groups with one top-level **Trade Settings** group and one descriptive submenu per destination.
- Routed opportunity publishing to its own Publish & Manage Opportunities page. Company Catalogue now shows reference records only; Company Rotation Rules owns its approved-pool filters/repeat policy, without rendering a duplicate company-rotation editor.
- Made the persistent Trading controls panel the single owner of per-tier policy, pop-up delivery, company rotation, randomized timing and burst delivery ON/OFF switches. Removed duplicate switches from the detailed policy editor.
- Renamed tier quota to **Daily opportunity entitlement** and delivery policy limit to **Hard daily pop-up ceiling**. The UI explains that the hard ceiling and optional target can reduce but cannot increase the tier entitlement. A 600/day entitlement requires a hard ceiling of at least 600 and optional target 0. Existing customer entitlement snapshots remain unchanged; tier edits apply to future assignments.
- Tier edits now protect dirty drafts from 30-second background polling, show a Saving state, refetch the saved tier, and verify the returned quota and terms version before showing success. Errors or unconfirmed read-back are announced and keep the draft visible.
- Delivery-policy saves now compare changed fields and policy-version advancement against a fresh server read before reporting success.
- Updated navigation, policy editor, contract tests, admin menu guide, in-portal HTML guide, canonical Trading specification, configuration manual and progress log.
- No migration or change to wallet/ledger, trade, customer-entitlement, financial execution or settlement records. No deployment performed; exact-head CI remains pending.


**Date:** 2026-10-30
**Scope:** Administrator Trading menu, submenus, tier forms, and Trading operations pages.

## Fixes completed

### 1. Shared menu items now open distinct focused views
Several submenu buttons used different names but opened the same unscoped page. This made the screen heading unclear and caused multiple buttons to look active at the same time.

Each shared destination now carries a focus value, such as `tiers`, `quotas`, `delivery`, `rotation`, `capital`, `fees`, or `reconciliation`. The portal stores the selected page and focus separately, and active styling compares both values. Only the item the administrator selected is marked active.

### 2. Trading menu names now use simple action words
The old labels used terms such as “capital allocation,” “carry-forward,” and “reconciliation” without explaining them. They now use names such as **Customer tiers**, **Daily trade allowance**, **When offers appear**, **Money used for trades**, **Returns and fees**, **Try failed trades again**, **Check finished trades**, and **Pause new trades**.

The Trading group description now says what the group is for. The selected menu item also shows its short explanation directly in the menu instead of relying only on a hover tooltip. The explanations state the practical effect and important safety boundary where relevant.

### 3. Removed duplicate tier-level limits from the tier form
The tier catalogue displayed both a per-tier daily popup cap and a per-tier active-investment cap even though delivery policy and global trade-safety controls are managed elsewhere. These duplicate inputs could make an administrator believe two different limit systems were being configured.

The inputs were removed from the create and edit forms. New or saved tiers send neutral legacy values (`0`) to preserve the existing API/database compatibility: `0` means use the central delivery policy for popup volume and no tier-specific active-investment cap. The authoritative delivery policy remains in the Trading policy editor.

### 4. Improved readability and spacing
The admin Trading navigation now has larger touch targets, visible item descriptions, and wrapped helper text. Policy cards, field groups, and operations panels have more breathing room. Operations tables may wrap text instead of forcing every value into a single line, which is easier to read on smaller screens.

### 5. Regression coverage updated
The Trading navigation contract test now checks:

- Shared screens have distinct focus identifiers.
- Active state uses both page and focus.
- Plain-language labels and visible explanations exist.
- Duplicate tier popup and active-investment inputs are absent.
- Legacy neutral values are still sent to the compatible server contract.

## Validation

- `pnpm check` passed.
- `pnpm exec vitest run server/trading-admin-navigation.contract.test.ts` passed: **15 tests**.
- `pnpm build` passed.
- `git diff --check` passed.

These changes are UI and navigation improvements only. They do not change Mining code, customer-facing Trading eligibility rules, wallet ledger rules, settlement evidence rules, or the sandbox database migration chain.

## 2026-10-30 — Trading submenu simplification pass

The Trading menu was reorganized into five child groups so each item answers one simple question:

1. **Set up trades** — Trading home, customer tiers, daily allowance, and how trades finish.
2. **Show offers** — when offers appear, customer pop-up timing, and company names shown.
3. **Finish trades** — returns and fees, retrying failed trades, and checking finished trades.
4. **Watch problems** — open/waiting work, pausing new trades, and worker health.
5. **History** — who changed Trading settings.

Removed from Trading because the same functionality already belongs elsewhere:

- **Money used for trades** was a duplicate of Finance → Wallet & Ledger.
- **Trade messages** was a duplicate of Communications → Announcements & Notifications.

The navigation renderer now expands a group only when both its destination and focus match the current screen. This prevents Finance from appearing open when an administrator is viewing a focused Trading ledger screen, and prevents shared destinations from looking duplicated.


## 2026-10-30 — Trade content clipping regression

- Removed clipping overflow from the expandable Trade navigation group so submenu items, hover translations and keyboard-focus outlines are not cut off by the decorative container.
- Removed clipping from administrator Trade page headers and administrator package cards so their children and focus indicators remain visible. Customer portal styles are unchanged.
- Kept clipping only on the embedded guide frame, where the iframe is intentionally masked to the rounded frame.
- Added administrator-only stylesheet contract coverage and desktop browser acceptance assertions for the expanded Trade submenu's full layout bounds.
- No routes, menu destinations, customer eligibility, package policy, wallet, trade or settlement behaviour changed.
- Exact-head CI and authenticated browser acceptance are required before merge.
\n\n## 2026-10-30 — Administrator navigation visual system\n\n- Extended the navigation redesign to all 13 canonical administrator menu groups, each with a distinct bright accent identity; nested submenu controls inherit their parent group's accent.\n- Added semantic per-group classes without changing labels, destinations, focus routing, permission checks or menu state behaviour.\n- Increased menu-group separation, heading height, item spacing and submenu padding for clearer hierarchy and touch-friendly use.\n- Reworked expanded submenu sizing so it uses its natural content height instead of a constrained zero-fraction grid row with hidden overflow. The navigation rail remains independently scrollable when the full menu exceeds the viewport.\n- Added responsive styling, keyboard-focus treatment and reduced-motion support.\n- Added CSS contract and authenticated browser checks for all 13 unique menu accents and complete Trade submenu bounds.\n