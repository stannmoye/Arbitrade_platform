# Workstream Status

**Last inspected:** 2026-11-04  
**Main checkpoint:** 0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b  
**Window 1 company contract branch:** feat/workstream-1-company-catalogue-rotation-contract  
**Window 3 branch:** workstream/3-automatic-opportunity-engine  
**Window 3 PR:** [#286](https://github.com/stannmoye/Arbitrade_platform/pull/286), draft, stacked on PR #278  
**Window 3 exact head:** `d73d5eb05ea4e5467fb82bcc02e36c5c88b4f7d3`

## Window 1 — Company Catalogue & Automatic Company Rotation

Contract branch documents the existing catalogue and rotation interface. It preserves 1,811 brand records and supports empty-pool behavior. Window 3 consumes this contract.

## Window 2 — Package Policies & Configuration

**PR:** [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284)  
**Branch/head:** `feat/window-2-package-opportunity-policy-contract` / `3d794c64cd4f542d852ebf97dc18796014a5548b`

Window 2 centralizes the typed package-policy write contract in `server/modules/package-opportunity-policy.ts` (`PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS`, `DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY`, `resolveEffectivePackageOpportunityPolicy`). Window 3 consumes only persisted `opportunity_package_policies` rows and validates saved bounds with `hasConfiguredTradingOfferPolicy`; it must not apply new-package defaults at generation time or create a second resolver. Reconcile the shared `server/db.ts` edit with Window 3's generation changes.

## Window 3 — Automatic Opportunity Generation Engine

**Implementation:** Extends the existing PR #278 generation engine rather than creating a second generator.

Implemented in this branch:
- Allows generation when the current approved company-display pool is empty.
- Persists a company-neutral opportunity with NULL company identity rather than failing or inventing an unapproved company.
- Prevents delivery-time company reselection when a generated assignment has a finalized null company identity.
- Keeps optional company templates restricted to an already-selected approved company.
- Makes assignment company identity nullable with forward migration 0106.
- Adds unit and generation-contract regression coverage.
- Strictly validates company-neutral sentinel metadata; rejects extra fields, altered display identity, and non-null company references.
- Exposes aggregate `customerFailures` from the persisted generation-batch failure count for Window 6's degraded-worker classification.
- Enforces daily generation quota inside the locked generation transaction using the subscription's saved entitlement, package allowance, package/policy popup caps and daily target.
- Resolves the quota window from the selected package policy (calendar day or rolling 24 hours), counts both subscription and customer/package assignments, and snapshots the applied limits.
- Skips exhausted quota candidates before rotation selection; quota reads, rotation cursor, offer and assignment writes remain in one transaction.

**Stage 3 verification — exact head `d73d5eb05ea4e5467fb82bcc02e36c5c88b4f7d3`:**

<https://github.com/stannmoye/Arbitrade_platform/actions/runs/41784510459>

All three jobs passed on this exact SHA:
- MySQL 8.4 opportunity worker lifecycle integration.
- MariaDB 11.4 opportunity worker lifecycle integration.
- Generation source checks: TypeScript, focused generation/delivery contracts, full `pnpm test`, and production build.

The two database jobs applied the guarded migration chain (including migration 0106), exercised package fee/global control migrations, worker claims and lease recovery, duplicate-effect fencing, and the customer popup lifecycle. The popup integration now also exercises the company-neutral database path with an empty approved company pool: the offer and assignment persist NULL company identity, no company-specific template is attached, and the previously persisted rotation cursor remains unchanged.

Generation integration coverage includes concurrent worker cycles and customer-control provisioning, exactly one committed rotation position, per-subscription entitlement quotas, package-wide quotas across subscription copies, independent package policy selection, rollback after missing currency and injected offer-insert failures, successful retry, customer read/lease acknowledgement, stale-token rejection, idempotent repeated cycles, and zero wallet/ledger/trade mutations.

Other implementation contracts retained:
- Existing generation lock, idempotency key, batch lifecycle and stale-batch recovery.
- Persisted package-specific payout and duration bounds; invalid/missing saved bounds fail closed.
- Brand-only company metadata; no ticker, exchange, listing or market-quote claims.
- Window 4's existing delivery lease lifecycle; no second queue or delivery implementation.
- Window 6's aggregate `customerFailures` contract.
- Automatic financial execution remains disabled.

**Stage 3 status:** implementation and exact-head automated verification are complete and ready for Window 7's integration review. Stage 1 remains approved and closed. PR #286 remains open, draft and unmerged.

**Not claimed by this branch:** authenticated browser acceptance on the hosted Blitz deployment, production deployment, or final reconciliation/merge of stacked Window 1/2/4/5/6 work. Window 7 owns those integrated checks. The PR is intentionally stacked on PR #278 and must not be merged independently.

## Window 4 — Opportunity Delivery & Customer Portal

**PR:** [#280](https://github.com/stannmoye/Arbitrade_platform/pull/280)  
**Branch/head:** `feat/stage4-opportunity-delivery-contract` / `6981e176d49de86e1f18cba1736aca0ef621de51`  
**Base:** `integration/window1-base-6d6d09b` at `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`; this base is an ancestor of Window 1's current generation branch by two commits.

Owns the existing delivery lifecycle and customer portal. The handoff requires `deliveryLeaseToken` for first render of an `in_progress` event and uses the same token for `received`/`rendered` acknowledgements. A follow-on fix supports retry after a render failure reported after `received`. No migration, queue or new delivery worker is added. Window 3 keeps generated company identity immutable and does not add a delivery path.

## Window 5 — Admin Trade Settings & Database Persistence

**PR:** [#285](https://github.com/stannmoye/Arbitrade_platform/pull/285)  
**Branch/head:** `workstream/window-5-admin-trade-settings-persistence` / `65557fa20f1beca9d4dd2fa437e02502fa8bab44`

Owns the Trade administration settings interface and save UX. The current PR #285 changed client components and client contract tests only; it did not change server/db.ts, server/routers.ts or database migrations. Verify the UI's existing save/read-back endpoints against the final integrated backend. It does not own the generation transaction, generation batches, generation keys or customer opportunity persistence.

## Window 6 — Testing, Monitoring & Production Readiness

**PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279)  
**Branch/head:** `feat/stage-6-opportunity-worker-observability` / `975b3edea82ec877fad0652fb98a3312e70321e2`  
**Implementation CI checkpoint documented by Window 6:** `962ae780e62e44ded236454040302afe9c5241e4`.

Window 6 owns durable worker-health classification. Its contract expects `runAutoTradeCycle` to return an aggregate `customerFailures` count; Window 3 now exposes `customerFailures: failures` from its existing durable generation batch failure counter, without returning customer IDs or raw error text in the worker result. Window 6 adds `degradedWhen` classification to the existing `trading-opportunities` monitor and a disposable-database health integration. Reconcile shared `server/db.ts`, `server/_core/index.ts` and `server/_core/workerHealth.ts` changes; do not create another registry.

## Window 7 — Final Integration

Must reconcile Window 1/2 contracts with this branch and Window 4/6 changes, verify migration 0106 order, run exact-head checks and authenticated hosted acceptance. No merge or production deployment is claimed.
