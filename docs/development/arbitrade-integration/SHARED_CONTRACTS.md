# Shared Contracts

**Coordination baseline:** 2026-11-04  
**Primary references:** `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `docs/trading/IMPLEMENTATION_COORDINATION.md`.

## Company identity

- The existing catalogue is the source of company identity. Use stable IDs matching `logo-brand-####`; preserve the associated name, logo and supplied metadata.
- All 1,811 catalogue entries remain preserved. Brand-only entries are supported without ticker, exchange, live quote or market-data requirements.
- For customer-facing opportunity identity, use only the current admin-verified, enabled, non-archived pool. Disabled and archived states override verification. Apply package country filters to that eligible pool.
- Empty or malformed approval state fails closed. Never fall back to an unverified company.
- Catalogue membership and admin display approval do not establish securities listing, execution eligibility, a price, or realized profit.

## Package terms

- The selected active server-owned package subscription determines the applicable package policy.
- Capital minimum/maximum, payout rate minimum/maximum, trade-duration minimum/maximum, display duration, pending-delivery limit and company country/repeat policy come from persisted package/global policy.
- Payout rate and duration are selected inclusively within validated saved bounds and stored once in the package snapshot. Retries/restarts reuse the stored selection.
- A saved approved company template is optional display-term enrichment for the already-selected company. It cannot shrink the company pool, gate generation, or override package-specific payout/duration bounds.
- Catalogue-native opportunities use a non-market sentinel (currently `BRAND`) and informational venue labels. Do not present these as a real ticker or venue.

## Package opportunity policy — Window 2

- `packages` remains authoritative for package identity, qualifying threshold, duration, daily entitlement contribution, terms version, effective dates and package enabled state.
- `opportunity_package_policies` remains the authoritative package-specific opportunity policy store. Do not create a parallel table or copy global delivery masters into package rows.
- The policy editor accepts a package name plus a partial patch from the allowlisted package-owned fields. Omitted values preserve the locked persisted row; defaults are applied only when creating a genuinely new package policy row.
- Global masters (`enabled`, `automaticDelivery`, `companyRotationEnabled`, `burstEnabled`, `automaticTradingEnabled`) are not package patch fields. Global delivery/eligibility remains controlled by the existing Package Configuration owner. `automaticTradingEnabled` is forcibly false.
- Package policy saves are transactional, lock the target policy row, reject duplicate/unknown package names and unknown fields, increment `policyVersion`, and record previous/next values in the existing audit stream.
- Package rename must move its matching policy row in the same package update transaction; missing or conflicting policy rows fail with an actionable error.
- The Window 2 resolver refuses a current or supplied policy whose package name does not match the target package. A partial patch cannot overwrite omitted saved values or another package's row.
- New-package defaults are explicit and documented in `server/modules/package-opportunity-policy.ts`. Inert global-master placeholders default OFF; informational delivery is still gated by global controls and valid package terms. Financial execution defaults OFF and remains hard-disabled.

## Idempotency and snapshots

- Generation key is unique per generated customer/package/quota assignment; database uniqueness is authoritative.
- Company rotation cursor and opportunity assignment must advance/commit atomically. A replay must not advance the cursor a second time.
- Assignment and offer snapshots retain package ID/subscription, package policy version, selected terms, company Logo ID and identity metadata, generation batch, and optional template ID/version.
- Template provenance is nullable for catalogue-native assignments. Existing historical template references remain intact.
- Customer reads are authenticated and customer-scoped. Do not expose another customer's assignment or the full admin catalogue through customer routes.

## Delivery boundary

- Generation persists the opportunity; the existing delivery lifecycle owns popup delivery state, idempotency, pending capacity, dispatch claims, retries and recovery.
- Delivery state and presentation actions do not create financial effects.
- Do not duplicate delivery queues, delivery idempotency keys or lifecycle workers.

## Financial boundary

No opportunity-generation, publishing or delivery operation may initiate real-money execution, customer fund allocation, result determination, automatic settlement, or wallet/ledger mutation. Do not weaken authorization, audit, or existing financial guards.


## Package configuration field contract — Window 2

The package editor has two distinct persisted records. Values below describe schema/create defaults; they do not backfill or overwrite valid existing rows.

### Package terms (packages)

| Setting | Type | New-package default | Validation and persistence |
| --- | --- | --- | --- |
| **id** | integer | Database-generated | Stable package identity; never regenerated for an existing package. |
| **name** | string (1–80) | Required by admin | Trimmed, unique; renames update the matching policy row in the same transaction. |
| **minimumQualifyingBalanceUsdMinor** | positive integer | 10,000 | USD minor units; 1–2,147,483,647; saved with optimistic termsVersion. |
| **durationMonths** | integer | 1 | 1–1,200 calendar months. |
| **opportunitiesPerDay** | integer | 6 | 1–10,000; this is the tier entitlement contribution, not the operational delivery cap. |
| **maxPopupsPerDay** | integer | 0 | 0–10,000; zero delegates to the configured admin delivery cap. |
| **maxActiveInvestments** | integer | 0 | 0–10,000; zero means no package-specific cap. |
| **enabled** | boolean | true | Package lifecycle/eligibility switch; disable/enable changes are audited and versioned. |
| **startsAt, expiresAt** | nullable timestamps | null | If both exist, expiry must be later than start. |

### Package opportunity policy (opportunity_package_policies)

The new-package defaults below are centralized in DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY. Integer percentage values are basis points (100 bps = 1%). The policy editor submits partial patches; omitted fields retain the current locked database value. Defaults are used only when a new package is created. A read never creates or repairs a missing row.

| Setting | Type | New-policy default | Validation |
| --- | --- | --- | --- |
| **badgeLabel** | nullable string | null | Trimmed; maximum 40 characters. |
| **badgeStyle** | enum | neutral | neutral, blue, purple, gold, green. |
| **minimumPayoutRateBps / maximumPayoutRateBps** | nullable integers | 200 / 300 | Both set or both null; 0–5,000; minimum ≤ maximum. Enabled informational delivery requires both and minimum ≥ 1. |
| **minimumTradeDurationSeconds / maximumTradeDurationSeconds** | nullable integers | 300 / 900 | Both set or both null; 10–86,400 seconds; minimum ≤ maximum. Enabled informational delivery requires both. |
| **maxPopupsPerDay** | integer | 10 | 1–1,000; package-specific hard operational ceiling. |
| **maxVisibleOffers** | integer | 3 | 1–10,000. |
| **minimumTradeUnits / maximumTradeUnits** | integers | 1,000 / 100,000 | Positive safe integers; minimum ≤ maximum. |
| **minHourlyTarget / normalHourlyTarget** | integers | 0 / 0 | 0–100; minimum ≤ normal; normal × 24 cannot exceed a non-zero daily popup ceiling. |
| **marketInfluenceBps** | integer | 0 | 0–10,000. |
| **maxBurstSize** | integer | 3 | 0–100; the separate burst enable switch is not package-patchable. |
| **dailyPopupTarget** | integer | 0 | 0–10,000; a positive target requires at least one pending-delivery slot. |
| **schedulingPeriod** | enum | rolling_24h | rolling_24h or calendar_day. |
| **minIntervalSeconds / maxIntervalSeconds** | integers | 45 / 3,600 | Each 0–604,800; minimum ≤ maximum. |
| **popupDisplayTargetSeconds** | integer | 120 | 1–86,400. |
| **completionDisplaySeconds** | integer | 8 | 1–3,600. |
| **postCompletionIntervalSeconds** | integer | 30 | 0–604,800. |
| **maxPendingDeliveries** | integer | 3 | 0–1,000; must be positive when daily popup target is positive. |
| **maxTradeAttemptsPerDay** | integer | 0 | 0–10,000; technical financial-attempt control remains inactive while execution is hard-disabled. |
| **tradeRetryDelaySeconds** | integer | 30 | 5–3,600. |
| **maxSuccessfulTradesPerDay** | integer | 0 | 0–10,000; cannot exceed a positive maximum-attempt value. |
| **maxConcurrentActiveTrades** | integer | 1 | 1–1,000; no automatic execution is enabled by this setting. |
| **minSettlementDelaySeconds / maxSettlementDelaySeconds** | integers | 900 / 900 | Each 900–604,800; minimum ≤ maximum. These are not an automatic settlement trigger. |
| **minimumRewardBps** | integer | 0 | 0–10,000. |
| **maxDailyRewardMinor / maxRewardPerTradeMinor** | integers | 0 / 0 | 0–2,147,483,647; a positive per-trade cap cannot exceed a positive daily cap. |
| **companyRotationCountryNames** | nullable text | null | Maximum 2,000 input characters; normalized country names. |
| **companyRotationRepeatPolicy** | enum | avoid_until_exhausted | avoid_until_exhausted or allow_repeats. |
| **closePolicy** | enum | after_completion | after_completion or after_final_display; final-display policy requires positive completion display seconds. |

### Global masters and persistence metadata (not package patch fields)

- enabled, automaticDelivery, companyRotationEnabled, burstEnabled, and automaticTradingEnabled are deliberately absent from the package patch allowlist. Their global-control ownership must remain separate.
- New policy rows contain OFF compatibility placeholders for global master switches. A package being enabled does not by itself enable global delivery.
- automaticTradingEnabled is forcibly persisted as false. The financial execution guard remains hard-disabled.
- policyVersion, updatedBy, updatedAt, and database id are server-owned. Each successful policy save increments policyVersion, stores actor/time, and writes previous/next policy values to the existing audit stream in the same transaction.
- Existing valid package terms and policy values are preserved. Invalid patches are rejected with a field/package-specific error. A missing policy row is not silently defaulted by a read; it is surfaced as a configuration error and must be explicitly reconciled.
