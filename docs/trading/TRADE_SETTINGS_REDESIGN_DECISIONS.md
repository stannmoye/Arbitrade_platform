# Trade Settings Redesign — Phase 0 Decision Record

**Status:** Phase 0 decisions approved; no application behavior changed.
**PR:** [#274](https://github.com/stannmoye/Arbitrade_platform/pull/274).
**Source base:** `main` at `59c425414b981bc2fd8720119f2d4b650b97ab15`.
**Scope:** Trade Settings Administration Blueprint, attached to this task.

## Current source already provides

- One top-level **Trade Settings** group and a read-only **Trade Settings Guide**.
- A persistent administrator Trading controls panel as the single editor for the existing per-tier policy switches.
- Separate per-tier quota, offer/capital, schedule, display, catalogue and operational views.
- Administrator-published and validated opportunity records; the worker does not synthesize offers from market refreshes.
- Authorization, audit/versioning, dirty-draft protection, transactional saves and fresh database read-back for existing settings.
- Automatic financial execution hard-disabled in server code and migration history.

The redesign must not recreate the Guide, duplicate existing owners, claim the prior save bug remains unfixed, or weaken the financial safety boundary.

## Target to review

- Keep one Trade Settings navigation group and one editable owner for each setting/action.
- Introduce the blueprint owner concepts: **Package Configuration**, **Package Settings**, **Company Catalogue**, **Publish & Manage Opportunities**, **Trading Overview**, **Trading History**, **Manual Payouts**, **Capital & Wallet Funding**, **Database Entries**, **Retry & Carry-Forward**, **Global Trade Timing & Settlement**, **Worker Health & Recovery**, **Audit & Policy History**, and a read-only **Trade Settings Guide**.
- Move shared delivery and safety controls to one global owner only after their data model and runtime consumers are approved.
- Place fee/earnings controls with package terms; remove the standalone Fees & Earnings Limits destination only after all fields have a mapped owner.
- Preserve non-synthetic informational opportunity delivery and automatic financial execution OFF.

## Decisions required before runtime code

| Area | Existing canonical rule | Blueprint target | Safe interim position |
|---|---|---|---|
| Delivery switches | Five policy/delivery/company/timing/burst switches are per-tier with one persistent-panel editor. | Package Configuration owns global controls. | Do not move or migrate values until the global model, compatibility reader, and per-tier pause mapping are approved. |
| Previous-settlement guard | Per selected tier and currently UI-locked ON. | Global ON/OFF with authorization and audit reason. | Keep ON; treat OFF as a safety-policy change, never as a cosmetic rename. |
| Platform fee | Fixed 15% of realized positive gross profit; no fee on failed, zero-profit, or loss outcomes. | Package min/max fee percentages with round-up. | Do not change settlement arithmetic until rate-selection semantics are chosen. |
| Menu consolidation | Existing canonical documents enumerate distinct operational destinations. | Several destinations are grouped or renamed. | Map every existing page/action before removing or moving any route. |
| Settings schema | Persisted per-tier policies and global timing settings already exist. | Some settings become global and fee terms become package-owned. | Any scope move requires a forward-only migration, explicit compatibility handling, runtime updates, and exact-SHA tests. |

## Proposed safety-first migration posture

1. Preserve package lifecycle state, customer entitlement snapshots, opportunity records, trades, settlements, wallets and ledger entries.
2. Preserve any legacy package-specific OFF, missing or invalid safety state as a paused package; a global master must not silently reactivate it.
3. Initialize a future global delivery master to OFF if any in-scope legacy policy is OFF, missing or invalid. Record conflicts and old values in durable audit/diagnostic evidence and require authorized review before enabling it.
4. Initialize global **Require Previous Settlement** to ON. Future OFF changes require authorization, reason, audit evidence and server enforcement for future allocations only.
5. Remove package-level runtime copies only after read-back and consumer tests prove the canonical global value is used.

Migration 1 is approved as the forward-only, fail-closed target. It is not yet applied to a database; implementation requires a migration, compatibility reader, conflict report, and tests.

## Approved decisions

The approved fee policy is **B**: configure package min/max fee bounds in integer basis points and select one inclusive rate once when the opportunity is created. Persist the selected rate and policy version with the opportunity; retries and restarts must never reroll it. Apply the fee only to realized positive gross profit. “Round up” means ceiling the fee amount at the currency minor-unit boundary. Principal, gross result, fee, net result and total credit remain separate; no fee applies to principal, expected returns, a loss, or an unverified result.

The blueprint does not define how a fee is selected from min/max bounds. The approved selection rule is:

- **A — Keep fixed policy:** retain the current versioned 15% rule and do not add editable min/max bounds in this PR.
- **B — Select at opportunity creation:** approved. Choose an inclusive integer-basis-point rate from the package bounds once, persist/version it, never reroll on retries, and charge only realized positive gross profit.
- **C — Explicit package rate:** save a concrete rate constrained by min/max and use that exact snapshot.

For B or C, explicitly define whether round-up means ceiling at the currency minor-unit boundary. Principal, gross result, fee, net result and total credit remain separate; no fee may apply to principal, expected returns, losses or unverified results.

## Phase 0 exit gate

The fee and migration decisions are now accepted and recorded in the canonical trading specification and admin manual. This branch still does not change application code, schema, migrations, database state, customer records, hosted deployment, worker behavior, fees, settlement or financial execution.

The next safe implementation checkpoint is the typed settings-owner registry/navigation refinement with uniqueness tests, preserving the existing read-only Guide. The approved global migration may not be applied until its forward-only SQL, compatibility reader, conflict report and disposable-database tests are reviewed.
