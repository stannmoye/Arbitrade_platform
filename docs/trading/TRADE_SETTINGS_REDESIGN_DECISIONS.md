# Trade Settings Redesign — Phase 0 Decision Record

**Status:** Phase 0 decisions approved. PR #274 subsequently implements the global owner split on its feature branch; this remains undeployed.
**PR:** [#274](https://github.com/stannmoye/Arbitrade_platform/pull/274).
**Source base:** `main` at `59c425414b981bc2fd8720119f2d4b650b97ab15`.
**Scope:** Trade Settings Administration Blueprint, attached to this task.

## Baseline when blueprint review began

- One top-level **Trade Settings** group and a read-only **Trade Settings Guide**.
- A persistent administrator Trading controls panel as the single editor for the existing per-tier policy switches.
- Separate per-tier quota, offer/capital, schedule, display, catalogue and operational views.
- Administrator-published and validated opportunity records; the worker does not synthesize offers from market refreshes.
- Authorization, audit/versioning, dirty-draft protection, transactional saves and fresh database read-back for existing settings.
- Automatic financial execution hard-disabled in server code and migration history.

This is the historical starting point for the redesign, not a description of the current feature-branch behavior. The redesign must not recreate the Guide, duplicate existing owners, claim the prior save bug remains unfixed, or weaken the financial safety boundary.

## Approved design direction

- Keep one Trade Settings navigation group and one editable owner for each setting/action.
- Introduce the blueprint owner concepts: **Package Configuration**, **Package Settings**, **Company Catalogue**, **Publish & Manage Opportunities**, **Trading Overview**, **Trading History**, **Manual Payouts**, **Capital & Wallet Funding**, **Database Entries**, **Retry & Carry-Forward**, **Global Trade Timing & Settlement**, **Worker Health & Recovery**, **Audit & Policy History**, and a read-only **Trade Settings Guide**.
- Move shared delivery and safety controls to one audited global owner; the data model, migration conflict report and runtime consumers are now implemented on the feature branch.
- Place fee/earnings controls with package terms; remove the standalone Fees & Earnings Limits destination only after all fields have a mapped owner.
- Preserve non-synthetic informational opportunity delivery and automatic financial execution OFF.

## Approved implementation decisions

| Area | Legacy state | Approved target | Implementation boundary |
|---|---|---|---|
| Global package/delivery switches | Delivery, company, timing, burst and tier switches historically lived on package policies. | Package Configuration is their sole global owner; per-package mutation inputs reject those legacy copies. | Migration 0099 seeds each master fail-closed from the corresponding legacy value and records conflicts for review. |
| Previous-settlement guard | Per selected tier and UI-locked ON. | One per-customer global master, ON by default; OFF requires a detailed reason and audit event. | Enforced for future allocations only; never changes saved settlement work. |
| System-wide settlement pause | Existing Global Trade Timing & Settlement setting blocks market-driven offers while trades are outstanding. | Retain as a distinct system-wide publication/automatic-allocation pause. | Do not conflate it with the per-customer Require Previous Settlement master. |
| Platform fee | Fixed 15% of realized positive gross profit; no fee on failed, zero-profit, or loss outcomes. | Package min/max fee percentages with round-up. | One inclusive fee rate and policy version are snapshotted at opportunity creation. |
| Menu consolidation | Existing canonical documents enumerate distinct operational destinations. | Several destinations are grouped or renamed. | Map every existing page/action before removing or moving any route. |
| Settings schema | Persisted per-tier policies and global timing settings already exist. | Global masters and package terms have separate owners. | Any scope move requires a forward-only migration, explicit compatibility handling, runtime updates, and exact-SHA tests. |

## Migration and runtime safeguards

1. Preserve package lifecycle state, customer entitlement snapshots, opportunity records, trades, settlements, wallets and ledger entries.
2. Migration 0099 initializes each global master OFF if any corresponding legacy policy is OFF or malformed, retains a durable list/count of affected package names, and never changes existing customer or trade snapshots.
3. When that conflict flag is active, re-enabling any OFF global master requires a detailed reason; the review acknowledgement and changed values are committed together in the audited settings transaction.
4. Initialize global **Require Previous Settlement** to ON. Future OFF changes require authorization, reason, audit evidence and server enforcement for future allocations only.
5. Package-specific terms and lifecycle status remain Package Settings. Legacy per-tier copies of global masters are neither editable nor accepted by per-tier mutation APIs; runtime consumers read the canonical global values.

Migration 0099 is present on the feature branch and is exercised by disposable MySQL/MariaDB integration workflows. It has not been deployed to a production database; merge, deployment approval and post-deployment verification remain separate steps.

## Approved decisions

The approved fee policy is **B**: configure package min/max fee bounds in integer basis points and select one inclusive rate once when the opportunity is created. Persist the selected rate and policy version with the opportunity; retries and restarts must never reroll it. Apply the fee only to realized positive gross profit. “Round up” means ceiling the fee amount at the currency minor-unit boundary. Principal, gross result, fee, net result and total credit remain separate; no fee applies to principal, expected returns, a loss, or an unverified result.

The blueprint does not define how a fee is selected from min/max bounds. The approved selection rule is:

- **A — Keep fixed policy:** retain the current versioned 15% rule and do not add editable min/max bounds in this PR.
- **B — Select at opportunity creation:** approved. Choose an inclusive integer-basis-point rate from the package bounds once, persist/version it, never reroll on retries, and charge only realized positive gross profit.
- **C — Explicit package rate:** save a concrete rate constrained by min/max and use that exact snapshot.

For B or C, explicitly define whether round-up means ceiling at the currency minor-unit boundary. Principal, gross result, fee, net result and total credit remain separate; no fee may apply to principal, expected returns, losses or unverified results.

## Phase 0 exit gate and deployment status

The fee and migration decisions are accepted and recorded in the canonical trading specification and admin manual. Subsequent implementation checkpoints on PR #274 add application, schema and migration changes; this branch is not itself a deployment and no production database or hosted service has been changed by this work session.

The remaining acceptance work is route-scope and pagination review, then a read-only Trade Settings Guide plus browser/accessibility verification. Apply the migration only through the approved release process after exact-head tests and review.
