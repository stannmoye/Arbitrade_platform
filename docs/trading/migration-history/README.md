# Archived Trading migration lineages

This directory preserves the SQL bodies that appeared in conflicting, still-open Trading PR branches before integration. These files are historical evidence only and are never executed by migration runners. Their exact SHA-256 digests, source PR head SHAs, tracker tags and timestamps are recorded in [`installer/legacy-main-migration-histories.json`](../../../installer/legacy-main-migration-histories.json), which the existing-database preflight validates before allowing automatic migrations.

The active forward-only chain is the nine migrations `0086_trading_popup_policy_snapshots` through `0094_trading_policy_duration_bounds_nullable`. The repository's pre-existing main-branch `0086_trading_popup_policy_snapshots.sql` was preserved; PR-specific collisions were archived rather than overwritten. The Drizzle journal retains its first 55 established entries and appends the reconciled chain at unique indices with timestamps strictly greater than the prior journal maximum.

Migration 0094 corrects the historical 0086 `NOT NULL` duration defaults so unconfigured tier policies can persist the canonical SQL `NULL` sentinel. It preserves existing bound values and remains forward-only.

Archived tails:

- `pr230/`: PR #230's expanded `0086_trading_popup_policy_snapshots.sql` variant.
- `pr233/`: PR #233's range, company-rotation and popup-snapshot migrations; the same files are shared by PR #238, which additionally has the wallet-funding-plan snapshot migration.
- `pr235/`: PR #235's execution-lease and policy-schema-reconciliation migrations.

Do not edit or execute these archives. A database tracker is accepted only if it matches the exact common prefix and one known archived tail, followed by a valid canonical forward-only extension. Unknown, reordered, duplicated or altered histories remain blocked for administrator review.
