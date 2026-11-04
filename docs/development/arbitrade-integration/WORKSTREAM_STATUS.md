# Workstream Status

**Last inspected:** 2026-11-04  
**Repository main:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Workstream 1 branch:** `feat/automatic-template-opportunities`  
**Workstream 1 latest branch tip inspected:** `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`  
**Pull request:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278) — open, draft, not merged.

## Window 1 — Automatic Opportunity Generation

**Implementation state:** Implemented on PR #278; ready for Window 7 integration review.

Observed scope in the branch:
- Customer-specific generation from the existing approved company catalogue without a one-template-per-company prerequisite.
- Brand-only catalogue-native identity with no fabricated ticker or venue.
- Optional approved template enrichment for the selected company.
- Package-specific persisted capital, payout-rate and duration bounds.
- Durable customer/package generation lock, unique generation key, assignment and package/company snapshots.
- Existing company rotation integration and delivery lifecycle handoff.
- Admin generation control, batch/assignment monitoring and audit/version checks.
- Migrations 0103, 0104 and 0105.

### Exact-head GitHub Actions evidence

At code head `aa27d664475eaf40dd4ff3d3414b267e569484e9`, the repository returned 10 pull-request workflow runs, all `completed/success`:

1. Trading settlement reconciliation database integration
2. Trading tier qualification database integration
3. Trading administrator wallet idempotency integration
4. Trading company rotation durable allocation database integration
5. Trading opportunity worker concurrency and recovery integration
6. Verify Arbitrade trading recovery changes
7. Mining regression checks
8. Verify application
9. Installer validation
10. Build and test production source

This is exact-head CI evidence for that code SHA. The coordination-document commit that follows it has not yet been validated by CI at the time of writing.

## Not established by this status

- No authenticated customer/admin browser acceptance against Blitz or another deployed environment is claimed.
- No production database migration or deployment is claimed.
- No real-money execution, automatic customer fund allocation, or unattended financial settlement is enabled by this workstream.
- A green workflow result is not proof that the hosted customer portal is currently showing pop-ups.

## Window 4 — Opportunity Delivery & Customer Portal

**Implementation state:** Existing delivery lifecycle and customer popup UI are reused; lease-gated first-render compatibility is present on Window 1 PR #278 and is covered by Window 4 regression tests in `feat/stage4-opportunity-delivery-contract`.

Observed existing owners/paths:
- `server/opportunityLifecycle.ts`: customer-scoped dispatch claim, lease fencing, retry and acknowledgement.
- `server/modules/opportunity-delivery-lifecycle.ts` and `server/modules/opportunity-delivery-retry-policy.ts`: bounded delivery state machine and single retry-policy parser.
- `server/db.ts`: eligibility, durable popup admission, customer read, and lease-token propagation.
- `server/routers.ts`: protected customer read and acknowledgement procedures.
- `client/src/customer-popup-eligibility.ts` and `client/src/App.tsx`: customer display eligibility and persistent popup UI.
- `scripts/trading-popup-delivery.integration.ts`: disposable-database delivery, idempotency and acknowledgement coverage.

**Critical handoff contract:** `in_progress` is accepted for first render only when a non-empty server-issued lease token accompanies the event. The browser must acknowledge `received` and `rendered` with that same token. Window 4 adds regression assertions; it does not duplicate Window 1’s helper correction or introduce a new worker/table/API.

**Database/API changes:** No new schema, migration or endpoint. Existing `customer.opportunities`, `customer.popupDeliveryStatus` and popup lifecycle routes remain authoritative.

**Delivery diagnostics added:** Admission now returns structured skip reasons for pending-capacity rejection and distinguishes that expected rejection from a persistence failure. The existing generated-assignment `failureReason` field records delivery-prefixed reasons for global delivery pause, schedule cooldown, daily quota exhaustion, visible-capacity exhaustion, burst limit, pending limit, assignment-state rejection, invalid/mismatched package snapshots, unavailable currency or package policy, invalid published terms, package entitlement/quota rejection, package terms outside policy, invalid popup display duration, delivery capacity exhaustion, and persistence failures; successful delivery clears the prior delivery reason. No new column or migration is required. The customer-read path now validates missing persistence IDs before filtering expected pending-capacity rejections, fixing a check that previously filtered the missing rows before testing them. The disposable-database integration script now asserts the pending-capacity reason and verifies that a second popup is not created.

**Customer portal error visibility:** The existing 3-second customer opportunity poll remains unchanged. The customer opportunity page now distinguishes a failed initial feed load from a legitimate empty feed, and the popup surface exposes a temporary feed-refresh error while polling continues. No API response shape or delivery eligibility rule changed. This UI change is committed at `8a27c6f19bf268cd07311997165332baa8331b25`; browser verification remains pending.

**Validation status:** The existing-state retry regression tests and new database integration assertions are committed but have not been executed. Exact-head CI, local test execution, disposable MySQL/MariaDB execution and authenticated browser acceptance remain pending; none are claimed. Blitz authenticated acceptance remains outstanding.

**Latest Window 4 commits:** `57b4919593dfab243d1b11cdb29e9f0aa9111770`, `fc7dcae22fa5f7028c29e3b7c7b7395ae28c7bb8`, `a489434ba9ea7c9de22134ec995af7dd7daf8149`, `b3ac0c0ebd3f32ff81bb0cb00531936f3b1a05af`, `1c856641328ffa09d22fd22c65867ebff36d6932`, `0c43f3b830d9031485f019309458542126713185`, `354124942fa5d18f7b3635fa57f3aa48077caf91`, `52271560d94ba508d7f8583d8ed60e2b6a470ff9`, `6c37caa5222f876e9752075532515cb8bd53de6d`, `e082e833f5849155bbcf690e7e485554f4347a67`.

**Dependency:** PR #278 must be integrated before this dependent PR can be merged into `main`.

## Windows 2, 3, 5 and 6

Status is pending each assigned owner’s own branch, commit, PR, changed-file list and exact-head test evidence. Do not mark a window complete from its assignment alone.
