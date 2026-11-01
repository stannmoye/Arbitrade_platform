# WiseBond Admin Portal Menu & Submenu Guide

## 1. Admin portal structure

The admin portal has two navigation layers:

1. **Main admin rail** — the primary administration workspace with 19 menus.
2. **Supplemental Operations drawer** — an overlay containing 8 operational tools for support, verification, risk, reporting, and review.

The admin portal is role-protected. Pages use the database-backed admin session, and the server applies admin-only access checks to protected operations.

> **Important trading-tier policy:** Trading tiers are administrator-managed configuration, not customer products. Customers must not browse, select, subscribe to, purchase, or activate tiers. A customer's eligible tiers are assigned automatically only from cumulative qualifying credits manually issued by an authorized administrator through **Credit Customer** in the admin portal. The administrator must explicitly select the qualifying-deposit classification; the committed customer ledger entry must be `admin_manual_deposit_credit`. The customer portal must not show the full catalogue or activation controls. It may show the highest active assigned tier and only the next enabled qualifying tier, including the qualifying USD-equivalent amount still needed, duration, and additional daily opportunity allowance; when no tier is active, show the first milestone and its benefits. Historical references to customer package browsing, selection, assignment or activation are superseded by this policy. Customer-facing threshold amounts are shown as a USD equivalent (the stored qualification basis), not hard-coded to a local currency symbol; qualifying credits from supported ledger-wallet types are valued at the time the administrator records the credit.

---

# 2. Main admin rail menus

## 2.1 Home

**Purpose:** The main administrative dashboard and operational summary.

**What it shows:**

- Total customer accounts
- Customers with active automatically assigned Trading tiers
- Opportunity delivery ceiling
- Current customer status and read-only Trading eligibility summary
- Database-controlled opportunity and security configuration

**How it functions:**

- Reads live customer, package, and settings data from the database.
- Provides shortcuts to security policy and operational settings.
- Acts as a high-level control-centre view rather than a detailed editing page.

---

## 2.2 Customers

**Purpose:** Manage customer accounts and account-level controls.

**Submenus and controls:**

### Add customer

Creates a new customer account with:

- Name
- Email address
- Initial password

Trading tiers are not assigned manually during account creation. Tier eligibility is determined automatically only from credits manually submitted through the admin portal's Credit Customer flow, explicitly classified as qualifying, and committed as `admin_manual_deposit_credit`. Signup credits and all other credit/deposit pathways are excluded.

### Edit customer

Updates the customer’s account details. Trading-tier eligibility is not manually assigned or edited on the customer record.

### Account status

Controls whether an account is:

- Active
- Suspended
- Restricted

### Trading controls

Enables or disables customer trading.

### Opportunity controls

Enables or disables delivery of opportunities to the customer.

### Withdrawal control

Enables or disables withdrawals for the selected customer.

### KYC requirement

Marks whether the customer must complete KYC before restricted activity is permitted.

### Two-factor authentication requirement

Marks whether two-factor authentication is required for the customer.

### Email verification

Marks the customer’s email as verified or unverified in the customer controls.

### Risk tier

Stores the customer risk classification used by account and opportunity policies.

### Daily trade limit

Stores the customer’s maximum daily trading allowance.

### Admin note

Stores an internal note associated with the customer account.

### Delete account

Permanently removes the customer and related customer records through a database transaction. This is a destructive action and should be used carefully.

---

## 2.3 Email Center

**Purpose:** Manage customer-facing email operations from the main admin workspace.

**Functions:**

- Review email-related customer communications
- Trigger customer email actions
- Send customer support or account messages
- Use the configured email queue and delivery workflow

This area works with the email-authentication, email-queue, notification, and account-management features.

For SMTP transport configuration and rich email composition, use **Email & SMTP Settings**.

---

## 2.4 KYC Control Center

**Purpose:** Manage the staged KYC process, customer progress, evidence-based decisions, policy parameters, and KYC audit integrity.

The KYC Control Center has five internal regions.

### Overview

Shows the KYC operating posture, including:

- Total customers in scope
- Fully verified customers
- Customers in review
- Customers in progress
- High-risk customers
- Core stage completion funnel
- Review load
- Provider readiness
- Audit-chain status
- Data exposure and retention posture

The dashboard refreshes periodically from the KYC database tables.

### Workflow & settings

Shows the sequential verification workflow:

1. Email verification
2. Phone verification
3. Address verification
4. Identity-document verification

Face and liveness verification is available as an optional extension and is not part of the four core launch stages.

**Configurable policy fields include:**

- Email token expiry
- Phone OTP expiry
- Raw-data retention period
- Extracted-data retention period
- Verification-result retention period
- Face-match pass threshold
- Face-match review threshold
- Manual-review SLA

Saving these values persists them to the KYC settings table and records the change in the audit chain.

### Customers

Provides a searchable, paginated KYC customer directory.

**Filters include:**

- Not started
- In progress
- In review
- Verified
- Retry required
- Rejected

The directory intentionally limits exposed information. It displays account and stage status without exposing raw identity images, document numbers, or full sensitive identity data.

### Review queue

Displays KYC stages requiring human review.

**Review actions:**

- Approve a stage
- Reject a stage
- Provide a mandatory reason

Decisions are role-protected, require evidence-oriented reasoning, update the KYC state, and append an audit entry.

### Audit trail

Shows the append-only KYC activity stream and validates the signed audit chain.

**Functions:**

- Check whether the hash chain is valid
- Show the number of verified records
- Review recent KYC events
- Recheck the chain on demand

Sensitive payload fields are excluded from the administrator display.

---

## 2.5 SMTP & Reports

**Purpose:** Configure the server-authoritative email transport and manage outbound email operations.

### Transport configuration

Provider choices include:

- **Local server mail** — uses the host’s local sendmail-compatible service
- **Local SMTP relay** — connects to an SMTP service on the same host or private network
- **SendGrid** — uses the SendGrid SMTP relay and an API key as the SMTP password
- **Amazon SES** — uses region-specific SES SMTP endpoints and SES-generated SMTP credentials
- **Other SMTP provider** — supports a standards-compliant SMTP endpoint

Provider presets populate safe starting values, but the administrator can edit the host, port, TLS, authentication method, username, and secret. AWS region selection updates the SES endpoint. The form also includes from name, from address, optional reply-to, and daily trading-close time in UTC.

SMTP passwords are encrypted in the database, never returned to the browser, and can be retained by leaving the password field blank. Switching providers explicitly clears the previous provider secret unless a new one is saved. The administrator should send a test email after saving and verify sender/domain authentication with the selected provider.

### Test email

Sends a test message through the configured transport so the administrator can verify delivery.

### Run daily reports now

Manually triggers the daily email reporting process instead of waiting for its scheduled execution.

### Recipient intelligence

Lists available customer and administrator recipients for manual communication.

### Manual email composer

Allows the administrator to:

- Select one or more recipients
- Enter a subject
- Compose rich text
- Add links, bold text, italic text, and lists
- Attach files
- Send the message through the configured email transport

SMTP credentials are kept server-side and are not exposed to the browser.

---

## 2.7 Credit Customer

**Trading tier threshold rule:** This admin-portal form is the only source that can create a qualifying Trading deposit attribution. For a customer credit, the administrator must explicitly select **Qualifying admin-portal credit for Trading tier threshold**. The server records `admin_manual_deposit_credit` and verified USD attribution/rate evidence only for this path. Credits from signup, customer/provider deposit flows, imports, generic adjustments or any other source never qualify. Admin self-wallet credits are always non-qualifying.

**Purpose:** Add funds to a selected customer wallet through the database ledger.

**Inputs:**

- Customer account
- Currency/wallet
- Amount
- Reason

**How it functions:**

- Validates the customer and enabled currency.
- Updates or creates the wallet balance.
- Writes a positive ledger entry.
- Creates a customer notification.
- Enqueues a wallet-adjustment email where email delivery is available.
- Records the administrative operation for review.

---

## 2.8 Debit Customer

**Purpose:** Remove funds from a selected customer wallet through the database ledger.

**Inputs:**

- Customer account
- Currency/wallet
- Amount
- Reason

**How it functions:**

- Confirms the account and enabled currency.
- Prevents a debit greater than the available balance.
- Writes a negative ledger entry.
- Updates the wallet balance.
- Creates a customer notification.
- Enqueues an email notification where configured.

---

## 2.9 Currencies

**Purpose:** Maintain the currency and asset registry used by wallets and credit/debit operations.

**Currency fields:**

- Currency code
- Currency name
- Display symbol
- Decimal precision
- Asset type: fiat, crypto, or token
- USD valuation rate
- Rate provider
- External/API code
- Enabled status

Saving a currency uses an upsert operation, so an existing code is updated rather than duplicated. Enabled currencies become available to wallet operations.

---

## 2.10 Signup Policy

**Purpose:** Control customer registration, jurisdiction rules, and onboarding safeguards.

### Automatic signup credit

Defines the initial recorded credit and currency for approved new accounts. Signup credits never count toward Trading tier thresholds.

### Default access rule

Defines the default signup behaviour:

- Automatic approval
- Manual review
- Block signup

### Country and territory matrix

Each jurisdiction can be assigned one of:

- Automatic approval
- Manual review
- Blocked signup

The matrix supports search by country name or country code.

### Signup and login feature gates

The portal exposes ten onboarding controls:

1. Email verification
2. Two-factor authentication at first login
3. New-device alerts
4. Strong password policy
5. Duplicate-account detection
6. Signup risk scoring
7. Referral attribution
8. Terms and risk consent
9. Age eligibility gate
10. Welcome notification

These controls define how new customers are screened and onboarded. Country-specific production decisions should be reviewed against applicable licensing, AML, sanctions, and consumer-protection requirements.

---

## 2.11 Trade Settings

**Purpose:** Provide one authoritative place for all administrator Trading configuration, opportunity publishing, monitoring, and history. The admin navigation contains one top-level **Trade Settings** group; the same Trading page is not repeated under separate setup, offers, results, monitoring, or history groups.

### Trade Settings submenu

| Submenu | What it controls |
|---|---|
| **Trading Overview** | Current delivery totals, pending work, open opportunities, settlement status and the global pause state. |
| **Tiers & Eligibility** | Tier name, qualifying USD threshold, entitlement duration, daily opportunity entitlement, effective dates and enabled state. Only qualifying admin-issued credits determine automatic eligibility. |
| **Per-tier Per-tier Daily Delivery Caps** | The hard daily pop-up ceiling, maximum visible offers, optional daily target cap and the delivery-counting window. These are operational limits: they can reduce the tier entitlement but cannot increase it. |
| **Per-tier Offer Rules & Capital Limits** | Required capital bounds and configured reward-rate/trade-duration eligibility bounds. ON/OFF switches are located only in the persistent Trading controls panel above the page content. |
| **Publish & Manage Opportunities** | Publish reviewed opportunity records, import validated CSV rows and inspect the open opportunity feed. This page does not edit tier or delivery policy. |
| **Per-tier Per-tier Delivery Schedule** | Per-tier spacing between eligible pop-ups, randomized timing bounds and post-completion delivery intervals. |
| **Global Trade Timing & Settlement** | Trade timing estimates and the global closing/settlement review settings. A scheduled time is not proof of execution or settlement. |
| **Per-tier Pop-up Display** | Expanded pop-up and completion-card display durations. Display settings do not cancel active records. |
| **Per-tier Company Rotation Rules** | Approved-company country filters and repeat-handling rules. The ON/OFF rotation switch remains in the persistent Trading controls panel. |
| **Company Catalogue** | Search and manage the separate company reference records, approval state and catalogue metadata. It does not contain a second copy of the rotation settings editor. |
| **Capital & Wallet Funding Rules** | Review the permitted capital requirements and wallet-funding policy used by Trading. This is not the customer Wallet & Ledger history page. |
| **Fees & Earnings Limits** | Configure the Trading fee policy and review configured earnings ceilings. |
| **Retries & Carry-Forward** | Configure bounded retry limits and review recovery behaviour. Carry-forward across daily windows is not currently enabled. |
| **Active & Pending Opportunities** | Review opportunity delivery and lifecycle records waiting for customer or system action. |
| **Settlement & Reconciliation** | Review confirmed trade outcomes and reconcile trade records against wallet and ledger entries. |
| **System Pause & Safety** | Pause or resume new allocations with an audit reason; pending work and required reconciliation must remain available. |
| **Worker Health & Recovery** | Inspect worker heartbeats, queue status, delayed work and audited recovery actions. |
| **Audit & Policy History** | Review who changed Trading settings, the reason, previous/new values and saved policy versions. |
| **Trade Settings Guide** | Read the in-portal guide without changing Trading data. |

### One owner for each setting

The persistent Trading controls panel is shown above administrator content on every page except the clean Home/overview page. It is the single owner of the per-tier **Tier policy**, **Pop-up delivery**, **Company rotation**, **Randomized timing**, and **Burst delivery** ON/OFF switches. The detailed Offer Rules, Per-tier Daily Delivery Caps and Company Rotation Rules pages do not repeat those switches.

The daily opportunity entitlement is stored on the tier as `opportunitiesPerDay`. The hard daily pop-up ceiling and optional daily target are separate operational caps. For example, to make a tier allowance of 600 opportunities/day available, the hard daily pop-up ceiling must be at least 600 and the optional daily target must be 0 (no additional target cap). The delivery caps never raise a tier's assigned entitlement.

Editing tier terms increments the terms version and affects future automatic tier assignments. Existing customer entitlements retain the terms snapshot saved when the tier was assigned; an admin edit does not silently rewrite existing customer entitlement history. Each save requires an audit reason and displays a database read-back confirmation. If read-back cannot confirm the saved version/quota, the page reports an error and keeps the draft visible.

Customers cannot browse the tier catalogue, select packages, purchase packages, activate subscriptions or change assigned entitlements. Eligibility is assigned automatically only from qualifying manual administrator credits through the admin portal; signup credits, provider/customer deposits, transfers, swaps, conversions and other non-qualifying credits remain excluded.

For the detailed field-by-field behaviour, effective-time rules, and recovery guidance, use [Trading Pop-up & Admin Configuration Manual](TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md) and [Trading System Specification](TRADING_SYSTEM_SPECIFICATION.md).

---

## 2.12 Security Policies

**Purpose:** Set global security and customer-access defaults.

**Policy gates:**

- KYC verification
- Withdrawals
- Two-factor authentication
- Facial verification

The administrator can enable or disable each default and save the policy registry to the database. These defaults are applied by customer provisioning and account-control workflows.

---

## 2.13 API Registry

**Purpose:** Monitor and govern external provider adapters.

**Provider categories shown:**

- Market data
- Payments
- Bank transfer
- Identity/KYC
- Execution
- Custody
- FX and crypto rates
- Notifications
- Blockchain/indexing

Each adapter displays its connection state, such as connected, not configured, or blocked. Provider secrets are not shown in the browser.

Provider activation is intentionally gated until credentials, permissions, sandbox testing, webhook verification, and operational approval are complete.

---

## 2.14 Branding & Identity

**Purpose:** Manage the platform identity used throughout the portals.

**Branding fields:**

- Platform name
- Brand tagline
- Browser title
- Accent colour
- Logo URL
- Favicon URL
- Social/share image URL

Saving branding writes the configuration to the central application settings registry and applies the updated identity to portal sessions.

---

## 2.15 Sound Settings

**Purpose:** Configure notification sounds used by opportunity and wallet operations.

**Controls include:**

- Opportunity sound
- Credit sound
- Debit sound
- Sound enabled/disabled
- Opportunity sound looping

The settings are stored in the application settings registry and are consumed by customer and admin notification flows.

---

## 2.16 Publish & Manage Opportunities (Trade Settings submenu)

**Purpose:** Publish and inspect reviewed opportunity records. This is one page inside the single **Trade Settings** navigation group, not a second location for tier editing or policy configuration.

### Delivery report

Shows persisted opportunity lifecycle totals, such as delivered, noticed, opened, zero-balance and settled events. These records describe observed workflow states; they must not be presented as proof of market execution or realized results.

### Delivery safety information

Displays the legacy/global countdown and signup-credit settings currently present in the opportunity workspace. Signup credits do not qualify customers for Trading tiers. Tier quotas, hard delivery caps, delivery schedules and policy switches are edited only in their dedicated Trade Settings submenu or the persistent controls panel.

### Publish an opportunity

Allows an authorized administrator to submit a reviewed opportunity with its symbol/reference, source/destination, currency, minimum amount, configured reward terms and duration. Values must be explicitly supplied and supported by auditable source information; the form must not invent market evidence, execution results or realized profit.

### Import opportunities

Imports validated CSV rows using the documented opportunity columns and server-side validation. Invalid rows must not be silently treated as published opportunities.

### Open opportunities

Displays saved open opportunity records for review. Publishing an opportunity does not prove execution or settlement and does not bypass customer eligibility, wallet, policy or lifecycle checks.

---

## 2.17 Settings

**Purpose:** Central application settings and operational timing controls.

The Settings screen contains internal tabs.

### Ticket tab

Controls:

- Maximum attachment size
- Allowed attachment MIME types and file extensions

### Email tab

Controls:

- Email provider mode
- From name
- From address
- Reply-to address

For complete SMTP transport and composer functions, use **SMTP & Reports**.

### Trade tab

Controls settlement and opportunity timing:

- Settlement delay
- Credit delay
- Cooldown period
- Next-popup formula delay
- Popup cooldown
- Popup display duration
- Pre-alert duration
- Timing jitter
- Maximum popups per hour
- Market refresh interval
- Block-until-settled behaviour

### Password/security tab

Provides the security-policy area for account and authentication defaults where enabled by the current portal build.

All saved settings are written to the shared application settings registry or trade-policy records.

---

## 2.18 Audit Log

**Purpose:** Display persisted administrative actions.

**Information shown:**

- Timestamp
- Action
- Actor
- Entity type
- Entity ID
- Reason, when supplied
- Persistence status

The page reads stored audit events and supports manual refresh. It is separate from the specialized KYC audit trail, which validates the KYC hash chain.

---

## 2.19 Advanced Controls

**Purpose:** Manage extended customer-power-tool governance and support operations.

### Alert governance

Controls customer watchlists, smart alerts, spread thresholds, and browser-notification availability.

### Allocation policy

Controls recurring allocation eligibility by automatically assigned tier, country rule, eligible spendable balance, and daily limits. Current wallet balance alone does not qualify a customer for a tier.

### Risk watchlist

Controls customer risk monitoring and risk-related review availability.

### Verification controls

Controls verification-related customer tools and workflow availability.

### Session oversight

Controls whether customer session and device oversight tools are available.

### Customer support desk

The Advanced page also includes the ticket desk, allowing administrators to review and respond to support cases.

High-impact production actions are intended to remain auditable, reversible, and subject to stronger approval controls.

---

# 3. Supplemental Operations drawer

The **ADMIN TOOLS** button opens an overlay drawer containing eight additional operational tools. The drawer can open automatically on first load, be opened manually, or be closed with Escape, the close button, or the backdrop.

## 3.1 Tickets

**Purpose:** Operate the two-way customer support queue.

**Functions:**

- View all customer tickets
- Filter by open, answered, resolved, or closed
- Select a ticket
- Read the full message thread
- Reply as an administrator
- Change the ticket status
- Preserve the ticket/customer relationship

Replies create a customer notification and update the persisted ticket conversation.

## 3.2 Opportunity Delivery

**Purpose:** Monitor opportunity popup delivery and lifecycle reach.

**Typical operational view:**

- Delivery counts
- Notice/open rates
- Dismissal and withdrawal states
- Trade and settlement progression
- Retention activity

This complements the Opportunity Engine, which is used for configuration and offer creation.

## 3.3 Verification Oversight

**Purpose:** Review account verification and email/KYC control signals.

This is the broader verification operations view. Detailed staged KYC configuration, review decisions, and audit-chain validation are handled in the KYC Control Center.

## 3.4 KYC Control Center

This drawer shortcut opens the same full KYC Control Center described in section 2.4.

Its internal regions are:

- Overview
- Workflow & settings
- Customers
- Review queue
- Audit trail

## 3.5 SMTP & Reports

This drawer shortcut opens the same email transport and reporting workspace described in section 2.5.

Its internal areas are:

- Transport configuration
- Test email
- Daily reports
- Recipient intelligence
- Manual email composer

## 3.6 Risk Watchlist

**Purpose:** Focus on customers and accounts requiring risk-team attention.

The watchlist is intended to combine risk tier, account state, verification status, and other account signals so administrators can investigate or restrict accounts before further activity.

## 3.7 Transaction Review

**Purpose:** Provide a read-only operational view of wallet ledger and transaction activity.

It is intended for reviewing credits, debits, trades, settlement states, and other financial-record events without directly editing ledger history.

## 3.8 Reports & Exports

**Purpose:** Download operational records and reporting datasets.

Expected report categories include:

- Customer/account records
- Opportunity delivery records
- Transaction and wallet activity
- KYC and verification records
- Administrative audit events

Exports are intended for operational review, compliance analysis, and record retention.

---

# 4. Shared behaviour across the admin portal

## Database-backed operations

The following areas use database-backed queries and mutations:

- Customer accounts and controls
- Wallet balances and ledger adjustments
- Currency registry
- Package policy registry
- Opportunity settings and offers
- Application settings
- Email configuration metadata
- KYC profiles, stages, reviews, settings, and audit records
- Tickets and ticket messages
- Administrative audit records

## Role protection

Admin procedures are protected by the administrator session and server-side admin checks. The client interface is not the security boundary; the server validates the role before executing protected procedures.

## Auditability

KYC decisions, policy changes, wallet adjustments, and other high-impact administration actions are designed to leave persisted records. KYC additionally maintains a signed append-only chain for integrity verification.

## Data minimization

The KYC administrator interface intentionally avoids displaying raw identity images, full document numbers, and unnecessary sensitive identity data in normal queue views.

## Provider readiness

External integrations such as SMTP, payments, custody, execution, identity providers, and bank transfer providers remain separate configuration concerns. The admin portal can show readiness and policy state without exposing provider secrets.

## Refresh behaviour

Several operational pages refresh automatically so that queues, customer states, KYC progress, email status, offers, and audit records remain current. Most pages also provide a manual refresh action.

---

# 5. Menu count summary

| Navigation layer | Count | Items |
|---|---:|---|
| Main admin rail | 19 | Home, Customers, Email Center, KYC Control Center, SMTP & Reports, Credit Customer, Debit Customer, Currencies, Signup Policy, Packages & Groups, Security Policies, API Registry, Branding & Identity, Sound Settings, Opportunity Engine, Settings, Audit Log, Advanced Controls |
| Supplemental Operations drawer | 8 | Tickets, Opportunity Delivery, Verification Oversight, KYC Control Center, SMTP & Reports, Risk Watchlist, Transaction Review, Reports & Exports |
| KYC internal regions | 5 | Overview, Workflow & Settings, Customers, Review Queue, Audit Trail |
| Settings internal tabs | 4 | Ticket, Email, Trade, Password/Security |



## 2.20 Privacy Management

**Purpose:** Govern the published Privacy Notice and review customer information-rights requests independently of general support tickets, account closure, and authentication/security controls.

### Notice editor and publication

- Edit the notice title, summary and structured customer-facing sections in a persisted draft.
- Save changes without changing the current published notice.
- Publish a reviewed draft as a new numbered version; the former published version is archived rather than overwritten.
- Review prior published versions, effective dates, and privacy-specific audit events.
- Use the theme-aware customer preview to review readability before publication. The editor itself does not certify that legal text is valid for every jurisdiction.

### Customer privacy request queue

- Filter requests by status and open a scoped request detail view.
- Review request category, customer-provided context, reference, timestamps, and event history.
- Move requests through the supported status workflow, send a customer-visible update, and record a separate internal review note.
- Customer-visible messages and internal review notes are stored separately; internal notes are not returned by the customer request endpoints.
- Request submission and review actions are recorded in a dedicated privacy audit stream.

Privacy requests do not themselves delete records, alter financial records, close accounts, or override statutory retention requirements. Any fulfilment requiring changes to retained personal or financial data needs an authorized, separately reviewed operational process. The privacy-specific SQL migration is applied by the existing portal migration runner in both fresh-install and existing-database installer flows.

## Trading tier qualification and wallet-credit conversion

When an authorized administrator credits a customer through **Credit Customer**, the administrator must choose whether the credit is a qualifying deposit or a non-qualifying credit. For a qualifying credit, the server fetches a current API exchange rate for the selected wallet currency (Frankfurter/ECB with Open ExchangeRate API fallback for fiat, and CoinGecko for registered crypto/tokens) and stores the USD-equivalent value and rate evidence at credit time. This applies to every enabled wallet currency its configured provider can price; USD is 1:1. An unavailable, stale or invalid rate blocks the qualifying classification rather than using a manually entered currency-registry rate. The admin customer list must show each customer's automatically assigned active Trading tiers and cumulative qualifying USD amount. No customer package selection or activation is offered. Ordinary transfers remain unchanged.


## Trading pop-up financial controls

The Trade package editor must expose minimum/maximum configured payout rate, minimum/maximum trade duration, required capital or capital range, eligible wallet funding policy, FX/conversion evidence, and the package/display settings documented in `TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`. Rate values must support decimals and be stored as integer basis points; money uses minor units/decimal-safe arithmetic. Cross-wallet funding uses a fresh timestamped FX quote and an atomic all-or-none ledger operation. A policy-defined payout must be labelled as a configured/contractual return, not market-earned profit. Admin edits are audited/versioned and apply to future opportunities by default; already committed opportunities retain their snapshots.
