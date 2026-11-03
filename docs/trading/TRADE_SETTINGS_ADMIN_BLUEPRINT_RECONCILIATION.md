# Trade Settings Admin Blueprint Route Reconciliation

**Status:** User-approved route mapping, 2026-11-03. This document supplements the user-provided PDF; the PDF itself is an attachment outside the repository and has not been modified.

## Decision and authority

The user chose to preserve the repository's canonical ownership boundaries rather than move or duplicate controls to match conflicting placements in the PDF. The canonical behavior and route owners remain those in [`TRADING_SYSTEM_SPECIFICATION.md`](../TRADING_SYSTEM_SPECIFICATION.md), [`TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`](../TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md), the admin navigation registry and the Trade Settings ownership registry. The PDF is reconciled to the following map for implementation and review; it does not create a second editor or financial-action owner.

## Route mapping

| Blueprint concept | Single canonical owner | Reconciliation |
| --- | --- | --- |
| Trade and result history | Trade Settings → **Trading History** | Bounded read-only scans of persisted trade lifecycle and confirmed-result evidence. It does not confirm outcomes, reconcile ledger postings or mutate trades. |
| Settlement review, evidence and reconciliation | Trade Settings → **Settlement & Reconciliation** | Owns authorized evidence-based outcome confirmation and trade/ledger reconciliation. A confirmation is not itself a wallet credit. |
| Delayed confirmed-credit posting | Existing authorized server-side posting worker | Runs after an administrator-confirmed, evidence-backed result. It remains a separate durable, idempotent ledger operation; no administrator-history page becomes a posting shortcut. |
| Wallet activity / Database Entries | Finance → **Wallet & Ledger / Database Entries** | Remains the sole read-only wallet-activity view. The Trade Settings Guide may link to this Finance destination but must not add a duplicate Trade Settings page, write action or settlement owner. |
| Package-specific fee versions | Trade Settings → **Tiers & Eligibility** | The package-owned, append-only fee policy editor is embedded in the tier editor. **Fees & Earnings Limits** is read-only information about the legacy global fee record and configured earnings ceilings, not a second editor. |
| Payout requests | Trade Settings → **Manual Payouts** | Sole owner of the internal payout-request review and status lifecycle. A status change does not transfer money through an external provider. |
| Capital and wallet funding queue | Trade Settings → **Capital & Wallet Funding Rules** | The destination is explicitly read-only/unavailable until a supported funding queue exists. No top-up, funding acceptance or posting action is implied. |
| Tier terms and operational settings | The existing named Trade Settings routes | Keep tier entitlements, delivery ceilings, offer rules, schedule, display, company rotation, global controls and shared retries under their registered owners. Links and Guide references are navigation only, not duplicate editors. |

## Non-goals and remaining gates

The previous-settlement prerequisite is now an audited global ON/OFF control, defaulting ON, in Package Configuration. OFF bypasses only that prerequisite for future allocation checks; it does not change existing trades or settlement/wallet records, and the independent block-until-settled opportunity-delivery pause remains separate. Fee calculation/versioning, funding, payouts, delivery retries, and automatic financial execution are otherwise unchanged. Staging/production acceptance, deployment and release approval remain separate from source merge and CI; the existence of this document does not certify a live service.

## Implementation references

- `client/src/admin-navigation.ts` is the admin destination registry; Finance owns the `wallet-ledger` destination.
- `client/src/trade-settings-ownership.ts` is the single owner registry for editable Trading controls.
- `client/src/components/TradeSettingsAdminGuide.tsx` links to registered Trade Settings owners and provides a separate navigation-only Finance shortcut.
- `docs/admin-portal-menu-guide.md` and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md` describe the same single-owner route boundaries.
