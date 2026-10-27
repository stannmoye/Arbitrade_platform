# Trading Portal Implementation Status

**Status:** focused customer/admin portal work in progress. The canonical behaviour remains defined by [`TRADING_SYSTEM_SPECIFICATION.md`](TRADING_SYSTEM_SPECIFICATION.md); this note records the state of the portal implementation and does not change that specification.

## Implemented in this portal pass

The administrator's **Trade Settings** group now has distinct destinations for Overview, Packages & Eligibility, Opportunity Operations, Delivery Activity, Trade Timing & Display, Trade Notifications, Ledger/Fees/Settlement, Allocation Pause, and Audit Log. Links that previously reused the same destination no longer all appear active together. Controls available outside the Trade Settings group were removed from the package and provider-registry pages where they duplicated Trading controls.

The new overview reads existing database-backed offer, delivery-lifecycle, pending-settlement, settlement-integrity, and allocation-pause queries. It labels unavailable values as unavailable rather than zero, shows the reconciliation scan limit, and links to the corresponding source pages. The Trade timing page saves only its Trading settings; the general Settings page no longer exposes the Trade tab. Pause/resume now requires a review step that explains its effect before the existing audited server mutation is submitted.

A missing customer package activation timestamp now has an explicit pending label instead of causing a render error. No customer balances, trades, settings, or database records were changed as part of this portal work.

## Confirmed customer-side safety mismatch

The current customer opportunity read path is not read-only. The `customer.opportunities` handler calls `listCustomerOpportunities`; that implementation can call `autoTradeOpenOpportunities`. The customer portal polls this endpoint, and package activation also calls `listCustomerOpportunities` after activation. This conflicts with the Trading guide's requirement that page viewing, polling, refresh, sign-in, or package activation by themselves must not start allocations.

A safe customer Trading redesign therefore depends on separating a read-only customer feed from the worker-owned opportunity/allocation cycle and removing any synchronous trade-cycle call from package activation. Those are server-side behaviour changes, outside the user's current portal-only authorization. They have not been changed or tested against a live database. Until that scope is authorized, the customer Trading interface has not been redesigned to mask this behaviour.

## Required portal capabilities still pending

The following guide-required functions are not yet represented by dedicated, fully functional admin portal controls. They are intentionally not presented as working submenus. Existing related fields or records are partial coverage only.

| Capability | Current coverage | Still required |
| --- | --- | --- |
| Combined package quotas and customer limits | Package-level policy fields exist | Combined entitlements, account-level caps, and customer-specific controls |
| Opportunity schedule | Package policy contains scheduling windows and intervals | Time-zone policy, full generation windows/cadence, company filters, and effective schedule history |
| Trade duration and closing rules | Offers may carry a duration value | Authoritative opening/close policy, effective-time rules, and versioned treatment of existing trades |
| Capital allocation and wallet rules | Ledger and pending settlement records are reviewable | Dedicated eligible-wallet, reservation, spendable-balance, and return-routing controls |
| Fees and earnings limits | Fee and package reward-policy fields exist | Combined daily net earnings ceiling, reset time zone, and complete calculation/rounding policy controls |
| Retries and carry-forward | Package retry limits/delay fields exist | Failure classification, carry-forward caps, make-good policy, and operational retry review |
| Company catalogue and rotation | Company reference/rotation services exist in the application | Permission-protected catalogue search/import/verification and customer-facing company rotation controls |
| Customer display policy | Settlement/popup timing values exist | Complete visible-field, minimize/maximize, fixed dock, and dismissal policy controls |
| Trade notifications | General customer notifications exist | Trade-specific toast placement/duration and confirmed-credit/debit presentation policy |
| Active trades and pending work | Pending settlement records are reviewable | A complete active, pending, and retrying operations queue with safe actions |
| System health | New-allocation pause is available | Worker/integration health and recovery visibility |
| Audit and policy versions | Persisted administrator audit log exists | Old/new values, policy-version history, reason, and sensitive-change approval visibility |

## Verification boundary

This pass is portal-only. It does not change worker logic, database schema/data, real customer balances, production configuration, or deployment state. Passing frontend checks does not establish that the automated trade lifecycle is complete or production-ready. Current verification results are reported separately with the actual branch and pull-request status.
