# Trading Package, Company Pop-up and Admin Editing Manual

**Status:** Canonical companion to `docs/TRADING_SYSTEM_SPECIFICATION.md`.  
**Scope:** Trade/Trading only. This document defines the intended administrator controls, what each control means, the customer pop-up contract, company rotation, and worker durability. It is a requirements manual, not proof that every listed control is already implemented.

## 1. Non-negotiable rules

1. The admin portal is the source of truth for package policy and customer pop-up behaviour. Customer UI must consume saved server configuration; it must not hardcode amounts, percentages, package names, durations, company lists, quotas, or financial results.
2. Customers never browse, choose, purchase, subscribe to, or activate packages. An authorized admin configures packages; the server assigns eligibility from qualifying manual admin wallet credits only, and package quotas accumulate according to the canonical Trading specification.
3. The company catalogue is the existing 1,811-record local image/name reference pool, keyed by stable Logo ID and mapped to local assets. Keep each company name, logo, country metadata and reference ID together. Do not recreate company names/logos in frontend constants or substitute a small hardcoded array.
4. Company rotation chooses the next eligible catalogue record according to saved rotation state and package policy. Avoid repeats for a customer/package until the eligible pool has been traversed when enough eligible records exist. Persist rotation state so a restart does not reset everyone to the first company. Concurrent worker instances must not allocate the same rotation slot to the same customer/opportunity.
5. Catalogue membership, a company logo, country folder, supplied ticker or rotating card does not prove that a company is publicly listed, that a market trade occurred, or that a profit was earned. The current catalogue is reference data; the current ticker candidates are not verified trade-eligible instruments. Do not use rotation itself as execution evidence.
6. Do not invent or randomly fabricate trade capital, profit, fee, timestamps, executions, or settlement. A configured percentage range is a policy bound, not permission to generate random realized returns. Show an expected/configured range as an estimate only; realized values and credits require an authoritative persisted result and ledger settlement. If the product intends a fixed-return contract rather than an evidence-backed trade result, that is a separate product/legal decision and must be explicitly specified before implementing it as real-money accounting.
7. All settings that affect an existing trade must follow a documented version/effective-time rule. Snapshot the relevant configuration on each opportunity/trade. Editing a package must not silently rewrite terms, countdowns, fees, or financial history of an already opened trade.

## 2. Admin portal: package list and package editor

Each package row should show its badge, name, enabled/disabled status, qualifying USD threshold, duration, daily quota contribution, capital rule, configured profit percentage range, and active customer count where available. Admins must be able to search, filter, sort, preview, edit, enable/disable, and inspect audit history. Customer accounts must never receive a package-browse or activation screen.

### Package editor controls

| Control / button | Meaning and expected effect |
| --- | --- |
| **Edit package** | Opens the selected package's complete editable settings. Loads persisted values, not UI defaults. |
| **Package name** | Changes the administrator-defined display name. Existing customer entitlements keep their package/version snapshot; future qualification follows the approved effective-time rule. |
| **Package badge** | Sets badge label and approved icon/style (for example, “Starter”, “Plus”, or “Premium”). Use an allowlist for icon/color choices; do not accept arbitrary executable markup. The badge is visual and never changes eligibility or financial policy. |
| **Qualifying threshold (USD)** | The cumulative USD-equivalent qualifying manual-admin-credit amount required for automatic eligibility. Only the admin portal's qualifying Credit Customer flow counts. |
| **Package duration** | Sets the duration of a newly assigned entitlement (days/months as supported by the schema). The server calculates expiry; the browser does not. |
| **Daily pop-up/opportunity quota** | Sets this package's daily contribution. Active eligible package quotas add cumulatively, subject to global/customer caps and the combined daily earnings ceiling. Never hardcode one quota for all customers. |
| **Minimum capital per opportunity** | Sets the minimum eligible capital required for the opportunity. The worker checks the authoritative wallet balance before allocation. If insufficient, show an “Insufficient balance — not allocated” card with required capital, eligible available balance and shortfall; do not debit or pretend a trade occurred. |
| **Capital amount / capital range** | If a package supports a fixed amount or bounded range, sets the permitted amount or lower/upper bounds. Validate minimum ≤ maximum and enforce wallet, package, customer and system limits server-side. Do not let the browser choose an amount outside the policy. |
| **Profit percentage minimum** | Lower bound of the package's configured profit policy, entered as a percentage (for example, 2%). |
| **Profit percentage maximum** | Upper bound of the package's configured profit policy (for example, 5%). Require a valid non-negative range and minimum ≤ maximum. These fields do not authorize random outcomes: the range may be displayed as a configured/estimated range before settlement, while realized profit must come from the approved, auditable result calculation. |
| **Platform fee percentage** | Displays/configures the fee policy for eligible future trades where fee editing is authorized. Default specification is 15% of realized positive gross profit only. Save a policy version and apply it only according to the effective-time rule; no fee on failed, zero-profit or loss outcomes under the default policy. |
| **Pop-up display duration (seconds)** | Controls how long the expanded card remains expanded before it can be minimized/condensed. It must not close or erase a live/pending trade. The minimized bottom dock remains accessible until the authoritative terminal-state dismissal rules are met. |
| **Opportunity schedule / interval** | Sets the permitted server-side delivery windows or cadence. The worker, not the browser, decides when an opportunity is due. Validate timezone and interval boundaries. |
| **Maximum visible cards / concurrency** | Caps presentation density per customer without dropping durable work. Additional due items remain queued/available according to policy and quota. |
| **Company rotation rules** | Chooses the catalogue pool/filter and repeat-avoidance behaviour. Rotation uses stable Logo IDs and persisted state; it never changes trade execution, capital or settlement. |
| **Country / category filters** | Optional filters on catalogue metadata. Unknown/unverified country must remain explicitly unverified; do not infer flags or silently exclude records without documenting the active filter. |
| **Daily earnings ceiling** | Caps cumulative daily earnings under the saved policy. The server checks the combined ceiling transactionally before allocation/settlement as appropriate; a client display is not enforcement. |
| **Retry / carry-forward policy** | Sets bounded retry and next-cycle carry-forward behaviour for eligible failed/pending work. Must preserve idempotency and must not duplicate an allocation or settlement. |
| **Enabled / pause** | Enables a package for future automatic eligibility or pauses new allocations. Pausing must not delete queued work or block required settlement/reconciliation. |
| **Preview customer card** | Renders a preview from the selected saved settings and catalogue records. It must label sample/preview data and must not create a real opportunity, allocation, wallet entry or trade. |
| **Save changes / publish** | Validates and persists settings server-side, writes actor/time/reason plus previous/new values to the audit history, increments the policy version, and publishes changes under the effective-time rule. A success toast alone is not proof; reload must return the persisted values. |
| **Audit history** | Shows who changed each field, when, why, previous/new values, policy version and effective time. It is read-only for historic records. |

Controls may be grouped into tabs such as **Package & Badge**, **Capital & Profit Policy**, **Pop-up Display**, **Company Rotation**, **Schedule & Quotas**, **Limits & Recovery**, and **Audit History**. Grouping must not hide any required field or imply that an unimplemented control already works.

## 3. Customer pop-up: required content

The same server-saved package settings govern the customer's actual display. The card must be bound to a stable opportunity/trade ID and a stable company Logo ID.

### Expanded pop-up

Show fields when applicable and available:

- Package badge and package display name (read-only, from the customer's automatically assigned entitlement/configuration snapshot).
- Company logo, company name, stable Logo ID, country name and flag from verified catalogue metadata; show “Country unverified” when appropriate.
- Supplied symbol/code and exchange/status classification only as reference data, without implying listing verification.
- Opportunity/trade reference and current authoritative status.
- Required capital, allocated capital (only after a real allocation commits), source wallet/currency, available balance and shortfall when insufficient.
- Configured profit percentage range as a clearly labelled estimate/policy range before a result exists. After a supported result exists, show the actual realized profit percentage and amount. Never display a randomly selected point in the range as earned profit.
- Gross profit, platform fee percentage and amount, net profit, principal returned and total credited amount as distinct fields. Do not show uncommitted or estimated amounts as wallet credits.
- Server-recorded start/opening time, expected close time, countdown and actual terminal/settlement time when available.
- Status such as Scheduled, Available, Insufficient balance, Allocated, Pending, Retrying, Awaiting settlement, Settled, Failed or Carried forward, consistent with the actual persisted lifecycle.
- A concise reason/status note for missed opportunities or pending settlement.

If a field is not yet known, show “Pending” or “Unavailable”; never fill it with a hardcoded default. The countdown is a view of the server's timestamp, not proof of execution or settlement.

### Minimize, maximize and dismissal

- **Minimize** collapses the expanded card into a fixed bottom-of-viewport dock.
- **Maximize** reopens it without resetting countdowns or lifecycle state.
- The expanded display timeout only changes presentation. It cannot discard the opportunity, cancel a trade, or settle an account.
- Do not dismiss at countdown zero until the server reports an appropriate terminal status. Pending, retrying and awaiting-settlement items remain accessible.
- Multiple cards must remain separately keyed; one card must not overwrite another.

## 4. Company rotation rules

- Source records from the existing local catalogue index and country-grouped metadata; resolve images through indexed relative paths, not names assembled into paths.
- Use the stable Logo ID as the primary catalogue key. Do not fuzzy-match or renumber duplicate names.
- Filter out a record only for a documented eligibility/filter rule; keep the current catalogue's unverified country and ticker statuses visible.
- Persist rotation cursor/history per relevant customer/package or other explicitly chosen rotation scope. Advance the cursor transactionally with opportunity creation so crashes/retries do not reset or double-advance it.
- Prefer not to repeat a company for the same customer/package until the filtered pool is exhausted; then start a new cycle with a recorded cycle/version. If the pool is too small, disclose the repeat behavior in the admin preview.
- Admin can inspect the active catalogue count, applied filters, last selected Logo ID, next candidate and rotation state. A **Preview next company** action is read-only and must not advance production rotation state.
- Never use a company name/logo as a substitute for independently verified trade evidence, price, instrument identifier, execution or settlement.

## 5. Persistent server worker and restart behaviour

The server owns scheduling, package entitlement, quota checks, company selection, capital validation, trade lifecycle, retries, settlement reconciliation and card state. Customer login/browser uptime is irrelevant.

- Use the existing managed worker runtime and durable database-backed jobs/state. Do not introduce a new process per customer or a tight polling loop.
- Persist due time, status, attempt count, lease owner/expiry, policy version, stable opportunity/trade ID, company Logo ID and rotation cursor/state needed to resume.
- On startup/restart, recover due jobs and expired leases, then resume normal bounded processing. Do not duplicate allocations, rotate twice for one idempotency key, or lose scheduled work because state existed only in process memory.
- Claim jobs with database locks/leases and fencing; use idempotency keys for creation, allocation and settlement. Use bounded batches, indexed lookups, overlap protection, backoff, terminal dead-letter visibility and audited recovery.
- Graceful shutdown stops new ticks, drains active cycles within a bound, and releases/lets leases expire safely. Startup health should distinguish not-started, healthy, stale, degraded and unavailable; heartbeat/last-success values must be persisted.
- Configuration changes are versioned and audited. Each scheduled item records the settings version that created it. Define whether edits apply only to future items or to open items before implementation; default to preserving the snapshot on already-open trades.
- A restart test must prove a due item is resumed after process restart with one opportunity, one rotation advance, no duplicate allocation and no duplicate settlement. Multi-worker tests must prove only one worker owns a claimed item at a time.

## 6. Admin operational status and acceptance tests

Admin-only **Trade Settings → Company Rotation & Pop-ups** should show current policy version, package settings, worker status, last successful cycle, due/queued counts, stale leases, retry/dead-letter counts, catalogue pool size and rotation health. Health data must be truthful; missing health data is “Unavailable”, not “Healthy”.

Acceptance must cover:
- Every field persists, reloads and changes customer display/runtime behavior only at its documented effective time.
- Package name, duration, badge, quota, capital minimum/range, profit percentage range, display duration, filters, schedule and limits are not hardcoded in customer code.
- Different assigned packages produce the configured differences and cumulative quota behavior.
- The correct company logo/name/country/Logo ID remain associated across rotation and card lifecycle.
- Rotation avoids repeats as configured and resumes correctly after restart and concurrent worker claims.
- Insufficient capital produces an informational missed card and no debit/allocation.
- Pop-up timeout/minimize/maximize/scroll/countdown cannot change financial state.
- No synthetic/random profit, execution, quote or settlement is generated. Estimates stay estimates until supported by actual settlement evidence.
- Worker restarts, stale leases, transient failures, duplicate delivery and retry/dead-letter recovery are tested against disposable databases.
- All admin edits have role checks, validation, audit history and policy versions.
- No production deployment or database migration is implied by passing source CI.

## 7. Canonical references

- Main product contract: `docs/TRADING_SYSTEM_SPECIFICATION.md`
- Mandatory coding-agent instructions: `AGENTS.md`
- Admin navigation and menu guide: `docs/admin-portal-menu-guide.md`
- Worker health and recovery: `docs/trading-worker-health-and-recovery.md`
- Worker shutdown contract: `docs/server-worker-shutdown.md`

If this manual and the canonical specification conflict, stop and reconcile both before implementation. Update both in the same change when these requirements change.
