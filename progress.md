

### Stage 1 status — blocked on real-browser environment (2026-11-02)

- User confirmed: no staging environment is available. Therefore the authenticated customer-portal/browser acceptance test and inspection of a live eligible customer's persisted popup lifecycle cannot be performed safely. Stage 1 is **BLOCKED / NOT ACCEPTED** despite the source-level repair and passing automated checks; Stage 2 and later stages have not been started, per the requested stage order.
- Exact `main` head `39a1ca55c2843208a27ad6cf2219a004e991e4c3` was verified on origin. GitHub Actions at that SHA completed successfully for Verify application; Build and test production source; Trading opportunity worker concurrency/recovery integration; Trading settlement reconciliation integration; Trading tier qualification integration; Trading administrator wallet idempotency integration; Trading company rotation durable allocation integration; Installer validation; and Mining regression checks.
- Remaining Stage 1 gate: create/provide an isolated staging deployment with an eligible test customer, a valid admin-published open informational opportunity, and automatic financial execution OFF, then run and record real-browser verification of delivery, controls, duplicate-tab behavior, expiry and status persistence. User has confirmed that such staging does not currently exist.
- This status entry is being committed to `main`; its commit SHA will be recorded in a follow-up entry so the handoff remains resumable.
