# Arbitrade: Hosted Crypto-Arbitrage Platform Specification

**Version:** 1.0  
**Date:** 30 September 2026  
**Audience:** Founders, compliance counsel, product designers, solution architects, engineering teams, security teams, payment and custody partners

## 1. Product definition

Arbitrade should be built as a **hosted, jurisdiction-aware crypto-market opportunity and execution platform**. It can aggregate prices from multiple exchanges and blockchains, calculate net spreads after fees and slippage, show time-limited opportunities, and let an eligible customer place a clearly disclosed order or allocation request.

It should **not** promise fixed returns, display fabricated “profit” figures, pool customer money into an unlicensed wallet, or imply that every opportunity is risk-free. The phrase “likely make” should mean an estimate based on an identified route, current quotes, fees, slippage assumptions, liquidity, and an expiry timestamp. The interface must display the assumptions and the possibility of partial fill or loss next to the estimate.

There are three product modes:

1. **Analytics mode:** show live market data and hypothetical net arbitrage opportunities. No customer funds are accepted.
2. **Assisted-execution mode:** a verified customer approves each transaction; regulated exchange, broker, payment, and custody partners execute it. The platform records the instruction but does not silently trade.
3. **Managed-investment mode:** only after legal authorization, custody arrangements, investor disclosures, suitability controls, safeguarding, complaints handling, and jurisdiction-specific approvals. This mode must be separately enabled by country and product.

The system should launch in analytics or assisted-execution mode first. Managed investment is a regulated business model, not simply a software feature.

## 2. Regulatory and trust boundary

The platform needs a written country-by-country legal opinion before onboarding customers. Crypto-asset services can trigger licensing, AML registration, money-transmission, securities or collective-investment rules, financial-promotion rules, consumer-protection duties, tax reporting, data-protection law, and safeguarding requirements.

FATF guidance says countries should assess and mitigate virtual-asset risks, license or register virtual-asset service providers, and subject them to supervision; VASPs are subject to relevant AML/CFT measures that apply to financial institutions. [1] If the platform targets UK consumers, cryptoasset promotions are subject to the UK financial-promotion regime regardless of where the firm is based or what technology is used, and promotions must be fair, clear, and not misleading. [2] In the EU, MiCA creates rules around cryptoasset offers, trading, authorization, supervision, disclosure, and consumer protection. [3]

The company should decide whether it is:

- a non-custodial software and data vendor;
- a broker or execution intermediary;
- a cryptoasset service provider;
- a money-services business or payment intermediary;
- an investment manager or portfolio manager;
- a platform operator offering a pooled product; or
- a combination of these through separately licensed entities.

A practical structure is a technology company plus licensed partners for fiat collection, card processing, exchange execution, custody, blockchain analytics, KYC/KYB, sanctions screening, and banking. Customer funds should remain with regulated providers wherever possible. The technology company should not accept deposits into an uncontrolled omnibus wallet.

The following claims must be prohibited by the content system unless reviewed and approved by compliance:

- “guaranteed profit”;
- “risk-free arbitrage”;
- “fixed daily return”;
- “your money is insured” unless the exact applicable scheme and limits are true;
- “instant withdrawal” where provider, network, or review delays are possible;
- “we cannot lose”; and
- any fabricated live-user balance, trade, yield, or testimonial.

## 3. User roles

### Customer roles

- Visitor: views public information and risk disclosures.
- Applicant: has started registration but is not approved.
- Verified customer: passed required identity and sanctions checks.
- Restricted customer: limited by country, risk score, age, product, or missing documents.
- Professional or institutional customer: additional verification, beneficial-owner data, suitability, source-of-funds, and permissions.
- Customer support user: access to ticketing and educational material only.

### Internal roles

- Platform owner.
- Compliance officer.
- MLRO or equivalent financial-crime lead.
- KYC reviewer.
- Risk manager.
- Treasury operator.
- Opportunity analyst.
- Operations administrator.
- Customer-support agent.
- Finance and reconciliation operator.
- Security administrator.
- Read-only auditor.
- API/integration manager.

Every internal action must be permissioned, logged, attributable to a user, and protected by step-up authentication for sensitive actions.

## 4. Customer portal: 60 recommended features

The portal should expose only features allowed by the customer’s country, account type, product eligibility, verification status, and provider availability.

### Identity and account

1. Email or phone registration.
2. Passwordless passkeys and optional password login.
3. Multi-factor authentication using TOTP, passkeys, or hardware keys.
4. Device and active-session management.
5. Login-risk notifications.
6. Country and residency selection.
7. Age and eligibility confirmation.
8. Identity verification and document upload.
9. Selfie or liveness verification through a KYC partner.
10. Source-of-funds and source-of-wealth questionnaires.
11. Beneficial-owner and business verification for organizations.
12. Profile, communication, and consent management.

### Wallet, money, and payments

13. Fiat account view.
14. Crypto balance view by asset and network.
15. Segregated transaction history.
16. Provider-hosted card payment checkout.
17. Bank-transfer deposit instructions with unique reference.
18. Supported direct-bank/open-banking deposit flow where lawful.
19. Crypto deposit address generation and network warning.
20. Withdrawal address book with cooling period.
21. Whitelisted withdrawal addresses.
22. Withdrawal risk review status.
23. Payment-method limits and verification.
24. Refund, reversal, chargeback, and failed-payment statuses.
25. Downloadable statements and tax-lot exports.

### Opportunity and market intelligence

26. Real-time opportunity feed.
27. Opportunity detail panel with source venues and networks.
28. Net-spread calculation after trading fees, gas, payment fees, and estimated slippage.
29. Available capacity and maximum investable amount.
30. Quote timestamp and expiry countdown.
31. Confidence and data-quality indicator.
32. Liquidity depth and estimated fill probability.
33. Risk flags for bridge, exchange, counterparty, stablecoin, and network risk.
34. Historical opportunity replay.
35. Watchlists for assets, venues, and routes.
36. Search and filtering by asset, region, minimum spread, risk tier, and duration.
37. Price and volume charts.
38. Order-book or depth visualization where licensed data permits.
39. Gas-fee and network-congestion panel.
40. Market-status and venue-health indicators.

### Participation and portfolio

41. Opportunity reservation or intent flow.
42. Customer confirmation showing full cost and downside scenarios.
43. Manual approval for every assisted-execution trade.
44. Portfolio allocation view.
45. Cost basis and realized/unrealized P&L.
46. Exposure by asset, chain, venue, and currency.
47. Portfolio risk limits.
48. Performance history with benchmark selection.
49. Diversification and concentration warnings.
50. Pending, partially filled, completed, failed, and cancelled order states.
51. Withdrawal and settlement tracking.
52. Customer-generated reports.

### Trust, communications, and support

53. Sound notification with mute, volume, and quiet-hours controls.
54. Browser push notification with explicit consent.
55. Email, SMS, and in-app notification preferences.
56. Risk disclosures attached to every opportunity.
57. Education centre and glossary.
58. Support tickets, secure messaging, and complaint workflow.
59. Security centre with recent events and emergency lock.
60. Privacy controls, data-export request, and account-closure request.

The sound alert must never be the only way to communicate an opportunity. A customer should not be pressured by flashing timers, artificial scarcity, or dark patterns. The popup must remain accessible, keyboard navigable, readable by screen readers, and disabled by default until the customer opts in.

### 4.1 Wallet, cash, and balance model

The customer portal must distinguish accounting states instead of showing one ambiguous “balance.” Each customer can have wallets or ledger accounts for USD, EUR, GBP, and each supported cryptoasset/network.

- **Total balance:** all settled customer assets valued in the selected display currency.
- **Available balance:** settled funds that are not locked, reserved, under review, or required to satisfy a chargeback or margin rule.
- **Current balance:** the latest provider and ledger position, including clearly labelled pending movements.
- **Locked balance:** funds reserved for an open order, dispute, compliance review, withdrawal cooling period, or earning-module position.
- **Pending balance:** deposits, withdrawals, swaps, settlements, and network confirmations not yet final.
- **Total invested:** principal allocated to open and completed products, with a definition and date range.
- **Total earned:** realized net gains, rewards, rebates, or distributions after fees, shown separately from unrealized estimates.
- **Unrealized P&L:** an estimate based on the displayed reference price and timestamp.
- **Withdrawable balance:** the amount currently eligible for withdrawal after all policy checks.

Every balance card should show asset, network, valuation source, timestamp, and whether the amount is settled or estimated. USD, EUR, and GBP accounts must be ledger accounts backed by a supported fiat provider or safeguarded bank arrangement; a display conversion alone does not create real cash. Customer money must not be represented as held in a bank or protected by a compensation scheme unless that statement is factually true for the relevant entity and jurisdiction.

### 4.2 Trading and funds controls

Customers need separate flows for **deposit, reserve, invest, trade, swap, settle, release, and withdraw**. A customer should be able to view the reason and expected release condition for every locked amount.

- Reserve funds for a displayed opportunity without treating reservation as execution.
- Approve, reject, cancel, or let an opportunity expire before execution.
- Cancel an order only while the provider and order state allow cancellation.
- See whether cancellation is requested, accepted, partially filled, or impossible.
- View filled quantity, average price, fees, network costs, and remaining quantity.
- Request release of unused reserved funds.
- See when locked funds are scheduled for release.
- Prevent withdrawals while a chargeback, fraud review, sanctions review, or settlement rule applies.
- Allow an authorized admin to release or continue a lock only with dual approval and a reason.
- Apply customer-specific limits on funding, order size, daily turnover, asset exposure, withdrawal, and earning products.

The portal must never label a customer’s unavailable funds as “lost” when they are pending, and must never label locked funds as available. Cancellation and release actions must create ledger events and customer notifications.

### 4.3 Five additional customer earning modules

These modules are optional product lines, not guaranteed-return features. Each one requires a separate product approval, eligibility rule, risk disclosure, fee schedule, provider contract, and admin kill switch. A module must be hidden or shown as unavailable when the customer’s jurisdiction, verification level, age, risk profile, or product permission does not allow it.

1. **Asset swap and routing:** customers can swap supported assets through approved liquidity providers. The quote must show the exact route, price impact, spread, network fee, provider fee, minimum received amount, expiry, and failure behavior. A swap is a conversion, not an earning guarantee; any price movement can create a loss.
2. **Token launch access:** customers can view and, where lawful, submit an expression of interest or allocation request for reviewed token launches. The portal must show issuer identity, contract address, audit status, vesting, unlock schedule, token utility, jurisdiction restrictions, conflict disclosures, and the possibility of total loss. Admins must be able to pause a launch, cap allocations, cancel an unfilled request, or block a token address.
3. **Staking or protocol rewards:** customers may opt into staking only through an approved custody or protocol provider. Display gross reward rate, variable rate history, validator or protocol risk, lock-up, unbonding period, slashing risk, fees, tax treatment, and exit conditions. Never call a variable reward rate a fixed return.
4. **Liquidity provision or market-making pools:** customers can supply assets to an approved liquidity venue where legally permitted. Show pool composition, historical fee income, impermanent-loss scenarios, smart-contract risk, withdrawal limits, utilization, and provider fees. Participation requires a separate suitability acknowledgement.
5. **Referral, education, and loyalty rewards:** customers can earn non-investment rewards for verified referrals, learning activities, or platform usage, subject to anti-abuse rules and local marketing requirements. Rewards must not depend on recruiting an endless chain of investors, require a deposit to qualify unless clearly disclosed and lawful, or be presented as investment yield.

Each module should have a lifecycle of `DRAFT → REVIEW → APPROVED → SCHEDULED → LIVE → PAUSED → CLOSED → ARCHIVED`. Closing a module must stop new participation while preserving settlement and withdrawal handling for existing positions.

## 5. Opportunity engine

The opportunity engine is the core of the product. It should not calculate a headline spread from two unconnected prices and call it profit. Each opportunity needs a reproducible route and an evidence record.

### Opportunity inputs

- Asset pair and exact contract or token address.
- Source exchange, broker, DEX, or liquidity venue.
- Destination venue.
- Fiat currency and settlement currency.
- Bid/ask prices and quote sizes.
- Order-book depth.
- Trading fees and withdrawal fees.
- Network fee and expected confirmation time.
- Bridge or cross-chain fee, if any.
- Payment-rail fee and settlement delay.
- Slippage model.
- Counterparty and venue status.
- Customer eligibility and regional restrictions.
- Opportunity expiry and stale-data threshold.

### Net opportunity calculation

For a notional amount `N`, the engine should calculate at least:

```text
entry_cost = N + entry_fee + payment_fee + estimated_slippage
transfer_cost = network_fee + bridge_fee + withdrawal_fee
exit_value = executable_exit_quantity × executable_exit_price
exit_cost = exit_fee + estimated_exit_slippage
net_result = exit_value - entry_cost - transfer_cost - exit_cost
net_return_pct = net_result / entry_cost × 100
```

The engine should show a base case, conservative case, and stress case. It must reserve a safety buffer for quote movement, partial fill, failed transfer, and fee changes. If the result becomes negative under conservative assumptions, the display should say so rather than highlighting the optimistic case.

### Opportunity state machine

`DETECTED → VALIDATING → ELIGIBLE → PUBLISHED → RESERVED → CUSTOMER_APPROVAL → EXECUTING → PARTIALLY_FILLED → SETTLING → COMPLETED`

Failure states are `EXPIRED`, `STALE_DATA`, `LIQUIDITY_INSUFFICIENT`, `RISK_BLOCKED`, `PROVIDER_ERROR`, `CUSTOMER_DECLINED`, `COMPLIANCE_HOLD`, and `CANCELLED`.

Every published opportunity needs an immutable calculation snapshot. If a quote changes, publish a new version rather than silently changing the customer’s expected result.

### Real-time delivery

Use a market-data ingestion layer, normalized event model, and event bus. Publish only validated events to WebSockets or Server-Sent Events. The browser should receive:

```json
{
  "event": "opportunity.published",
  "id": "opp_123",
  "version": 4,
  "asset": "BTC/USDC",
  "route": ["venue_a", "venue_b"],
  "net_return_estimate": {"base": 0.82, "conservative": 0.18, "stress": -0.44, "currency": "USD"},
  "maximum_eligible_amount": 1250,
  "expires_at": "2026-09-30T11:15:20Z",
  "risk_tier": "high",
  "data_quality": "good",
  "requires_customer_approval": true
}
```

The front end must visually distinguish **available capacity** from a guaranteed allocation. It should display “maximum currently estimated capacity” and explain that actual execution can be lower.

## 6. Payments and asset support

Do not integrate every payment method directly into the core application. Create a payment abstraction with provider adapters, a capability matrix, webhooks, idempotency, reconciliation, and kill switches.

### Payment categories

- Card payments through a PCI-capable provider-hosted checkout or tokenized fields.
- Bank transfer and virtual account deposits.
- Open-banking payment initiation where available.
- Local payment methods by country.
- Stablecoin transfers.
- Major crypto networks with exact network selection.
- Provider-managed wallets or custody accounts.
- Perfect Money only if a reputable, licensed, contractually approved provider supports it in the target jurisdiction. Perfect Money is a payment service, not a blockchain; it should not be described as a chain or treated as equivalent to a self-custodied crypto network.

Cards create chargeback and fraud risk. The design should include 3-D Secure where required, velocity limits, cardholder-name checks where permitted, deposit-to-withdrawal cooling rules, chargeback monitoring, and a policy against using a newly funded card deposit as an instant crypto withdrawal channel.

PCI DSS provides the baseline technical and operational requirements for entities that store, process, transmit, or can affect the security of cardholder data. [4] The preferred design is to keep raw card data outside the platform by using a hosted checkout or provider tokenization, while still completing the applicable compliance assessment.

Crypto deposits should require an exact asset and network selection, address checksum display, test-transfer or provider confirmation where appropriate, on-chain risk screening, confirmations policy, and a clear warning that sending the wrong asset or network can cause permanent loss.

## 7. Recommended API catalogue: at least 12 integrations

Use a connector interface so every integration has common methods such as `healthCheck`, `capabilities`, `getQuote`, `createPaymentIntent`, `createOrder`, `getOrder`, `cancelOrder`, `getBalances`, `subscribeEvents`, and `reconcile`.

1. **Market-data API:** ticker, order book, trades, candles, liquidity.
2. **Centralized-exchange API:** balances, quotes, orders, fills, withdrawals.
3. **DEX and RPC API:** quotes, route simulation, gas estimates, transaction status.
4. **Blockchain-indexing API:** addresses, transfers, token balances, confirmations.
5. **Custody API:** segregated wallets, policy approvals, signing, withdrawal status.
6. **Fiat on-ramp API:** card or local payment initiation.
7. **Bank-transfer/open-banking API:** virtual accounts, payment initiation, webhooks.
8. **Payout API:** fiat and crypto withdrawals.
9. **KYC/KYB API:** identity verification, business verification, beneficial owners.
10. **AML and sanctions API:** PEP, sanctions, adverse media, wallet screening, transaction monitoring.
11. **Travel-rule API:** originator and beneficiary information exchange where required.
12. **FX and reference-rate API:** conversion and reporting prices.
13. **Fraud and device-intelligence API:** velocity, device reputation, behavioral risk.
14. **Messaging API:** email, SMS, push, and incident communications.
15. **Tax and reporting API:** cost basis, transaction classification, jurisdictional reporting.
16. **Support and CRM API:** tickets, identity-linked support, complaint tracking.

### Admin API registry

The admin portal needs a registry with:

- connector name, provider, version, environment, and owner;
- supported countries, currencies, networks, and operations;
- secret reference stored in a secrets manager, never the secret itself;
- sandbox and production configuration;
- webhook signing and replay protection;
- rate limits and timeout policy;
- health status, latency, error rate, and last successful call;
- feature flags and rollout percentage;
- enabled/disabled state with reason and approver;
- dependency and fallback provider;
- data-retention classification;
- last test result and contract version.

“Direct import” should mean importing a signed, reviewed connector package or OpenAPI-defined adapter into an isolated integration runner. It must not mean uploading arbitrary code into the production process. Required controls are code signing, malware scanning, static analysis, dependency scanning, sandbox execution, permission declarations, human approval, version pinning, rollback, and an audit record. Connectors should be deployed through CI/CD, not executed from an admin text box.

## 8. Admin portal

### Operations dashboard

- Live platform health.
- Active opportunity count.
- Stale-data count.
- Provider error map.
- Deposit, withdrawal, and settlement queues.
- Suspended customer count.
- Unresolved compliance cases.
- Chargeback and fraud indicators.
- Reconciliation breaks.
- Assets and networks under maintenance.

### Customer and compliance

- Customer search with least-privilege masking.
- KYC/KYB review queue.
- Sanctions and transaction-monitoring alerts.
- Risk-score overrides with mandatory reason.
- Country and product eligibility rules.
- Suspicious-activity case workflow.
- Complaints and vulnerable-customer handling.
- Account lock, withdrawal freeze, and emergency controls.
- Data-access and deletion request workflow.

### Market and opportunity controls

- Source-venue configuration.
- Asset and network allowlist.
- Minimum liquidity thresholds.
- Spread thresholds.
- Fee schedules.
- Slippage assumptions.
- Opportunity publishing rules.
- Per-customer and global capacity limits.
- Kill switch by asset, venue, chain, country, or provider.
- Replay and audit of every published opportunity.

### Treasury and reconciliation

- Provider balances.
- Blockchain confirmations.
- Pending and failed transfers.
- Double-entry ledger view.
- Customer-liability reconciliation.
- Fiat settlement reconciliation.
- Exchange and custody reconciliation.
- Suspense-account workflow.
- Daily close and sign-off.
- Export to accounting system.

### Content and design operations

- Risk disclosure management.
- Versioned promotion approval.
- Customer education articles.
- Localized copy.
- Notification templates.
- Sound and push preferences.
- Feature flags.
- Maintenance banners.
- A/B experiments only after compliance approval and never on risk disclosures.

### Full feature and customer-access control plane

Every customer-facing capability must be represented in a centralized policy registry. The admin portal controls **availability**, but it must not be able to bypass law, custody policy, ledger integrity, or required compliance approvals.

Each feature record should contain:

- immutable feature key and display name;
- product family and dependency list;
- version, owner, documentation, and change ticket;
- enabled, disabled, maintenance, or sunset status;
- allowed countries, currencies, assets, networks, and customer tiers;
- KYC/KYB, age, risk, suitability, and consent requirements;
- per-customer, per-day, per-transaction, and global limits;
- funding and withdrawal restrictions;
- rollout percentage and allowlist or denylist;
- start time, end time, maintenance window, and emergency kill switch;
- customer-facing explanation when unavailable;
- approvers, effective version, and immutable audit history.

The admin portal should support configuration changes through versioned policies rather than direct database edits. High-impact changes require four-eyes approval: one operator proposes the change and a second authorized person approves it. Code changes must go through a repository, pull request, tests, security checks, deployment approval, and rollback plan. The portal may trigger a controlled deployment or feature-flag change, but it must never execute arbitrary code submitted into a text field.

### Customer restriction and account-control matrix

Admin users should be able to apply scoped controls to a customer, organization, asset, network, country, provider, or product:

- suspend login;
- require re-verification;
- disable deposits;
- disable card funding;
- disable bank funding;
- disable crypto deposits;
- disable trading or swaps;
- disable new earning positions;
- disable token-launch participation;
- disable withdrawals;
- cap transaction amount or daily turnover;
- cap asset or network exposure;
- place an account or position on compliance hold;
- lock only specified funds instead of freezing the whole account;
- release a lock after authorized review;
- cancel unfilled orders when provider rules permit;
- close a product while allowing orderly settlement;
- send a mandatory notice and record customer acknowledgement.

Every restriction needs a reason code, scope, start time, review date, creator, approver, customer notice, and appeal or support path where applicable. Support staff can request a restriction but cannot silently impose a financial lock unless their role and policy permit it. Emergency actions must be logged and reviewed after the incident.

## 9. Architecture

### Suggested stack

- **Web application:** Next.js or React with TypeScript, responsive design, server-side rendering for public pages, and an accessible component system.
- **Mobile:** responsive web first; native apps later only if the notification and device-security case justifies them.
- **API layer:** TypeScript or Go REST API plus WebSocket gateway.
- **Core services:** identity, customer profile, KYC orchestration, payments, ledger, market data, opportunity engine, order orchestration, custody, notifications, reporting, support, and audit.
- **Data:** PostgreSQL for transactional data, Redis for short-lived caches and locks, Kafka or NATS for events, object storage for documents, ClickHouse or TimescaleDB for high-volume market and opportunity history.
- **Secrets:** cloud KMS and secrets manager with short-lived credentials.
- **Infrastructure:** managed Kubernetes or serverless containers, private networks, managed database, WAF, CDN, centralized logs, metrics, tracing, and backup vault.
- **Observability:** OpenTelemetry, error tracking, SLO dashboards, provider latency metrics, and immutable audit storage.

### Service boundaries

1. **Identity service:** sessions, MFA, passkeys, risk-based authentication.
2. **Customer service:** profile, status, consent, eligibility.
3. **Compliance service:** KYC, KYB, sanctions, risk cases, travel rule.
4. **Payment orchestration service:** intents, provider routing, webhooks, refunds, chargebacks.
5. **Ledger service:** append-only double-entry records; never calculate balances from browser state.
6. **Market-data service:** ingestion, normalization, timestamping, quality checks.
7. **Opportunity service:** route construction, fee modeling, stress cases, publishing.
8. **Execution service:** explicit customer approvals and provider orders.
9. **Wallet/custody service:** addresses, policies, approvals, transaction status.
10. **Notification service:** in-app, email, SMS, push, sound permission.
11. **Admin and policy service:** RBAC, feature flags, provider switches, content approvals.
12. **Reporting service:** statements, tax exports, regulatory records, analytics.

The browser should never call exchange, custody, bank, or blockchain credentials directly. All provider calls pass through server-side adapters with idempotency keys, request signing, retries, rate limiting, and structured logs that redact secrets and personal data.

### Code modification and feature-release lifecycle

The product should support continuous improvement without turning the admin portal into an unsafe code execution surface. The recommended lifecycle is:

1. A product owner creates a feature request with user impact, regulatory impact, dependencies, metrics, and rollback conditions.
2. Engineers implement the feature in a version-controlled repository using a pull request.
3. Automated tests run for unit behavior, ledger invariants, permissions, security, accessibility, calculations, and connector contracts.
4. Security and compliance review the change when it affects money movement, customer eligibility, promotional content, custody, or balances.
5. The release is deployed to development, sandbox, and staging environments with migration checks.
6. An admin-controlled feature flag enables the feature for internal testers or a small allowlist.
7. Monitoring confirms error rate, latency, reconciliation, customer-support events, and risk metrics.
8. The rollout expands gradually or is rolled back to the previous known-good version.

The admin portal can change flags, limits, content, provider routing, and policy versions. It should not edit executable production code, ledger history, customer balances, or payment-provider secrets directly. Database migrations must be backward compatible, reversible where possible, and separately approved.

## 10. Core data model

Important tables or collections include:

- `users`, `organizations`, `roles`, `permissions`, `sessions`, `devices`;
- `customer_profiles`, `customer_consents`, `eligibility_rules`, `jurisdiction_rules`;
- `kyc_cases`, `kyb_cases`, `documents`, `screening_hits`, `risk_cases`;
- `payment_methods`, `payment_intents`, `bank_accounts`, `card_events`, `chargebacks`;
- `assets`, `networks`, `venues`, `provider_connectors`, `connector_versions`;
- `market_quotes`, `order_books`, `liquidity_snapshots`, `gas_snapshots`;
- `opportunities`, `opportunity_versions`, `opportunity_calculations`, `opportunity_reservations`;
- `orders`, `fills`, `settlements`, `withdrawals`, `deposits`;
- `ledger_accounts`, `ledger_entries`, `reconciliation_runs`, `suspense_items`;
- `notifications`, `support_tickets`, `complaints`, `audit_events`, `admin_actions`;
- `risk_limits`, `policy_versions`, `feature_flags`, `feature_entitlements`, `maintenance_windows`;
- `wallets`, `wallet_addresses`, `wallet_policies`, `asset_positions`, `balance_snapshots`;
- `fund_locks`, `fund_reservations`, `release_requests`, `order_cancellations`;
- `products`, `product_versions`, `product_positions`, `rewards`, `referrals`, `token_launches`, `token_allocations`;
- `staking_positions`, `liquidity_positions`, `swap_quotes`, `swap_executions`;
- `deployment_releases`, `change_requests`, `approvals`, `rollback_events`.

The ledger must be append-only. Corrections are reversal entries, not updates to historical entries. Each entry should include customer, asset, network, provider, amount, valuation basis, timestamp, source event, and correlation ID.

For each fiat or crypto wallet, maintain separate ledger accounts for settled available funds, pending funds, locked funds, reserved funds, fees, realized earnings, unrealized valuation, and provider or custody liabilities. The balance service should derive customer-facing totals from ledger entries and provider reconciliation, then publish a signed or versioned balance snapshot. A cached balance may improve performance, but it can never be the source of truth.

## 11. Registration and login journeys

### Registration

1. Customer selects country and account type.
2. The platform shows availability and risk disclosures before collecting unnecessary data.
3. Customer submits email or phone and completes verification.
4. Customer creates a passkey or password and MFA.
5. Device risk checks run.
6. Customer provides identity and residency information.
7. KYC/KYB and sanctions checks run through approved providers.
8. The customer accepts terms, privacy notice, risk disclosure, and communication consent separately.
9. The platform assigns an eligibility state: pending, approved, restricted, or rejected.
10. Funding and product access are enabled only after all required checks.

### Login

- Passkey-first login.
- MFA and step-up authentication for sensitive actions.
- New-device challenge.
- Impossible-travel and session-anomaly detection.
- Session revocation from the security centre.
- No security questions or emailed one-time passwords as the only factor for withdrawals.
- Security notifications for password, passkey, MFA, bank-account, and withdrawal-address changes.

## 12. Customer experience and visual design

The visual direction can be premium and animated without imitating a casino. Use a dark graphite base, high-contrast typography, restrained electric cyan or violet accents, clear red/amber risk states, and optional light mode. Prefer a quiet institutional feel over neon “get rich” styling.

### Dashboard layout

- Header: verification status, account selector, notifications, security centre.
- Main card: net account value, available balance, pending settlements, and a visible “not guaranteed” label.
- Opportunity rail: live cards sorted by eligibility and freshness.
- Center panel: opportunity chart, route diagram, fee breakdown, and stress-case outcomes.
- Right panel: portfolio exposure, risk limits, and provider status.
- Bottom panel: activity ledger, support, and education.

### Opportunity popup

The popup should include:

- “New opportunity detected” rather than “profit guaranteed.”
- asset and exact route;
- estimated base, conservative, and stress outcomes;
- maximum eligible amount;
- fees, gas, slippage, and assumed fill;
- source venues and quote timestamps;
- expiry countdown;
- liquidity and risk indicators;
- “Review details” and “Dismiss” actions;
- a mandatory confirmation step;
- no preselected investment amount;
- no auto-execution unless separately authorized and legally supported.

Animations should use 150–250 ms transitions, respect `prefers-reduced-motion`, and never hide a risk warning behind animation. Sound should be a short, optional neutral chime; customers must be able to disable it.

## 13. Security and privacy

Use OWASP ASVS as the application-security verification baseline. OWASP describes ASVS as a basis for testing technical security controls and a secure-development requirements list. [5] Use NIST CSF 2.0 to organize governance, identification, protection, detection, response, and recovery activities. [6]

Minimum controls:

- MFA and passkeys for customers and mandatory phishing-resistant MFA for administrators.
- Separate production accounts and networks.
- Least-privilege IAM and just-in-time admin access.
- Hardware-backed signing or custody-provider policy controls.
- Encryption in transit and at rest.
- Field-level encryption for identity documents and bank details.
- Tokenization for payment data.
- Secret rotation and no secrets in logs.
- Strong webhook signature validation and replay protection.
- Idempotency on deposits, payments, orders, and withdrawals.
- Immutable audit events.
- WAF, bot mitigation, rate limits, and abuse monitoring.
- Secure SDLC with threat modeling, SAST, DAST, dependency scanning, and penetration testing.
- Backup, restore, disaster-recovery, and incident-response exercises.
- Data minimization, retention schedules, customer access, correction, and deletion workflows.
- Segregation of duties for onboarding overrides, ledger adjustments, withdrawals, and connector changes.

## 14. Risk controls specific to arbitrage

The opportunity engine must block publication when:

- quotes are stale or come from only one source;
- executable liquidity is below the proposed amount;
- the asset or contract address is not allowlisted;
- bridge or network risk exceeds policy;
- the route requires an unsupported or unverified transfer;
- the provider is degraded or in maintenance;
- the calculated result depends on an unrealistic fill;
- the net result is negative after conservative costs;
- the customer is not eligible;
- a market, sanctions, fraud, or counterparty rule triggers;
- the opportunity would exceed customer or platform exposure limits.

Do not use an opportunity feed to manipulate behavior. Avoid countdowns that reset, fake “other investors are buying” counters, or claims that an opportunity will never appear again. Store the exact inputs and algorithm version for each opportunity so customers and auditors can reproduce the display.

## 15. Reliability and real-time operation

Set measurable service objectives:

- 99.9% monthly availability for authenticated portal access.
- 99.95% for the ledger and critical payment webhooks.
- Market-data freshness displayed to customers, not hidden.
- Opportunity publication only after validation.
- Recovery point and recovery time objectives defined per service.
- Provider outages isolated through circuit breakers.
- Multi-region backups for critical records.
- Queue-based retry with dead-letter queues.
- No duplicate payment or order creation after retries.

Every customer-facing quote should show its data timestamp. “Real time” should mean the system’s measured freshness window, such as “updated 1.2 seconds ago,” not an absolute promise.

## 16. Guided installer and portable deployment

The application should ship as a versioned release bundle that can be deployed to a VPS, managed container host, or compatible shared-hosting account. The installer must be a **first-run configuration wizard**, not an unrestricted web shell. A browser request cannot safely or reliably obtain root privileges on a shared server, so the installer must detect the hosting capability and either perform permitted user-level steps or give exact provider-specific instructions for the remaining steps.

### Supported deployment profiles

1. **VPS or dedicated server:** recommended for the full platform. A command-line installer or deployment script can install approved OS packages, configure the application user, create services, run migrations, configure a reverse proxy, request TLS, and enable workers.
2. **Managed container host:** recommended for production when the provider supplies managed database, secrets, object storage, queues, and TLS. The release should include a container image, health checks, migration job, worker process, and environment-variable template.
3. **Shared hosting:** suitable only for a reduced portal or analytics edition if the host provides the required PHP/Node/Python runtime, database, HTTPS, cron, outbound network access, WebSockets or polling, and background-job support. The full real-time trading, custody, blockchain, and worker stack may not be possible on ordinary shared hosting.

The installer should show a compatibility result before making changes:

- operating system and version;
- CPU, memory, disk, and available storage;
- runtime and package-manager versions;
- database engine and version;
- HTTPS and domain status;
- writable directories;
- cron or worker availability;
- queue and cache availability;
- outbound network and DNS checks;
- required extensions;
- file and process permissions;
- whether root or sudo access exists;
- whether the environment is suitable for production money movement.

The result should be **Compatible**, **Compatible with limitations**, or **Not compatible**, with a downloadable remediation report. The installer must never claim that shared hosting is production-ready simply because a login page loads.

### Installation wizard

The first-run browser wizard should use short, resumable steps and display a progress timeline:

1. Welcome, license, deployment warning, and environment check.
2. Select database type, enter database host/name/user/password, or create a database where the hosting API permits it.
3. Enter application URL, timezone, default currency, supported fiat currencies, and email settings.
4. Generate encryption keys, application secrets, webhook-signing keys, and a secure secrets-manager reference where available.
5. Import the versioned schema and run migrations.
6. Seed system permissions, feature definitions, supported assets, notification templates, and default policy records.
7. Create the first super-admin account using an interactive form that validates password or passkey setup and MFA enrollment.
8. Create optional normal-admin accounts and assign predefined roles.
9. Configure providers in sandbox mode, test connectivity, and verify webhook signatures.
10. Configure storage, queue, cache, scheduled jobs, and background workers.
11. Import optional demo data using clearly synthetic accounts and balances.
12. Run health checks, ledger invariants, permission checks, and a test notification.
13. Disable installation mode, remove or invalidate the installer token, and redirect to the secure login page.

Progress should be based on real completed checks, not a decorative timer. Each step needs status, start/end time, logs safe for customer viewing, retry, skip-with-reason where allowed, and a link to remediation guidance. Long tasks should run in a server-side job with a signed progress token so a browser refresh does not repeat database migrations or duplicate seed data.

### Database import and demo accounts

The installer should support:

- clean schema creation;
- versioned migrations from a prior release;
- idempotent seed scripts;
- encrypted backup import where the operator supplies the decryption key through the installer form or environment;
- dry-run migration preview;
- pre-migration backup;
- migration checksum and release compatibility check;
- post-migration integrity checks;
- rollback guidance when a migration cannot be reversed.

Demo accounts must use fictional names, synthetic identities, nonfunctional wallet addresses, and clearly labelled simulated balances. Demo funds must be recorded in a separate simulation ledger and can never be withdrawn, used for real orders, or mixed with production funds. Demo mode must be disabled by default in production and must be removable from the admin portal.

The installer must refuse to import a database into the wrong application version, refuse to overwrite a non-empty production database without an explicit backup and confirmation, and never log database passwords or encryption keys.

### Admin account and privilege setup

The wizard should create roles, not just two accounts. Recommended initial roles are:

- **Super admin:** platform configuration, role assignment, feature flags, deployment status, and emergency controls. Cannot silently change ledger history or bypass dual approval.
- **Security admin:** authentication, sessions, MFA policies, device revocation, and security events.
- **Compliance admin:** KYC, sanctions, risk cases, customer restrictions, and compliance holds.
- **Treasury admin:** provider balances, reconciliation, settlement, and fund-release requests.
- **Trading operations admin:** opportunities, venues, order states, cancellations where permitted, and trading limits.
- **Product admin:** feature definitions, earning modules, content, notifications, and rollout flags.
- **Support admin:** customer support, status viewing, and ticket actions without raw financial secrets.
- **Read-only auditor:** reports, logs, configurations, and immutable history without mutation rights.
- **Normal admin:** a configurable limited role assembled from approved permissions.

The first super admin must enroll phishing-resistant MFA before installation completes. The installer should require a separate recovery method, show the exact permissions being granted, and create a one-time recovery code that is displayed once and never stored in plaintext. It should not create a universal default password such as `admin/admin`.

### Permissions and automatic privilege configuration

Permissions should be granular and deny-by-default. Examples include `customer.view_masked`, `customer.restrict`, `funds.lock_request`, `funds.release_approve`, `trade.cancel_request`, `trade.cancel_approve`, `feature.publish`, `connector.disable`, `ledger.adjust_request`, `ledger.adjust_approve`, and `deployment.rollback`.

High-impact permissions require dual control. The installer can assign the baseline role matrix automatically, but all resulting grants must be visible, exportable, and editable by an authorized super admin. No role should combine customer-data export, secret access, ledger adjustment, and withdrawal approval without a documented exception and compensating controls.

### Post-install hardening

At the end of installation the system should:

- set an installation-complete flag;
- invalidate the install session and token;
- disable setup routes;
- remove or quarantine the installer package where supported;
- verify that setup files are not web-accessible;
- set secure cookie and HTTPS headers;
- apply least-privilege file ownership and permissions;
- create scheduled backup and health-check jobs;
- enable audit logging;
- require MFA for admin access;
- keep all payment, custody, exchange, and blockchain providers disabled until configured and tested;
- display a production-readiness checklist;
- notify the first super admin of the installation completion.

If a shared host cannot remove setup files, the application should refuse to mark installation complete and give exact instructions. The installer should also offer a maintenance lock so customers cannot access a partially configured system.

### Upgrade and rollback

Each release should contain a manifest with application version, schema version, runtime requirements, migration list, dependency lockfile checksum, security advisories, and rollback notes. An admin may request an upgrade from the portal, but the actual package installation should run through a signed deployment pipeline or provider-supported job.

Upgrades must be staged, backed up, health-checked, and observable. If health checks fail, the system should stop new deposits, trades, swaps, and earning-product entries according to policy, preserve withdrawals and support access where safe, and provide a controlled rollback or recovery path. Never roll back by rewriting ledger history.

## 17. Testing plan

### Unit and integration tests

- Fee, slippage, and net-return calculation.
- Quote versioning and expiry.
- Ledger invariants and reversal entries.
- Payment webhook idempotency.
- KYC status transitions.
- RBAC and admin approval paths.
- Connector capability and failure behavior.
- Withdrawal cooling rules.
- Notification consent and quiet hours.

### Simulation and scenario tests

- Exchange outage during an active route.
- Chain reorganization or delayed confirmation.
- Gas price spike.
- Partial fill.
- Card chargeback after a crypto withdrawal attempt.
- Duplicate webhook.
- Price-feed divergence.
- Customer loses MFA device.
- Malicious connector package.
- Admin account compromise.
- Database restore and reconciliation break.

### Security testing

- Threat model for account takeover, payment fraud, market manipulation, insider abuse, and connector compromise.
- OWASP ASVS verification.
- Independent penetration test before production.
- Smart-contract audit for any contract the platform deploys or controls.
- Custody and key-management review.
- PCI assessment with a qualified assessor where applicable.
- Disaster-recovery exercise and incident tabletop.

## 18. Delivery roadmap

### Phase 0: legal and business design

Choose launch jurisdiction, customer type, services, custody model, regulated partners, prohibited countries, disclosures, complaint route, data-retention policy, and operating budget. Obtain counsel’s written classification before accepting money.

### Phase 1: secure foundation

Build landing pages, account registration, passkeys/MFA, customer profile, KYC integration, jurisdiction rules, admin RBAC, audit log, risk disclosure system, and a read-only market-data dashboard.

### Phase 2: opportunity analytics

Add normalized market data, opportunity calculation, historical replay, fee model, conservative and stress cases, WebSocket feed, sound/push preferences, and internal opportunity approval.

### Phase 3: payments and ledger

Add provider-hosted card checkout, bank-transfer deposits, crypto deposit addresses, double-entry ledger, reconciliation, limits, chargeback states, statements, and withdrawal controls. Keep assets with regulated providers.

### Phase 4: assisted execution

Add explicit customer approval, provider adapters, order and fill states, partial-fill handling, settlement tracking, kill switches, and complete audit replay. Begin with a small allowlist of assets and venues.

### Phase 5: scale and governance

Add connector marketplace, institutional accounts, localization, mobile applications, tax exports, advanced reporting, external audits, and additional providers only after each connector passes the same review gate.

## 19. Suggested repository structure

```text
arbitrade/
  apps/
    customer-web/
    admin-web/
    api/
  services/
    identity/
    compliance/
    payments/
    ledger/
    market-data/
    opportunity-engine/
    execution/
    custody/
    notifications/
    reporting/
  packages/
    design-system/
    event-contracts/
    fee-model/
    connector-sdk/
    auth-client/
    observability/
  connectors/
    exchange/
    dex/
    blockchain/
    custody/
    fiat-payment/
    bank-transfer/
    kyc/
    aml/
    messaging/
  infra/
    terraform/
    kubernetes/
    policies/
  docs/
    product-spec.md
    risk-disclosures.md
    runbooks/
    connector-review.md
  tests/
    unit/
    integration/
    contract/
    security/
    simulations/
```

A 120 MB deliverable is not a useful engineering target. The repository should be measured by correctness, security, tests, documentation, and deployment reproducibility. Generated assets, source maps, dependencies, market history, logs, and media should live in managed storage or build artifacts rather than being artificially bundled into the application repository.

## 20. Launch acceptance checklist

Before accepting the first customer deposit, confirm:

- launch jurisdiction and regulated-business classification are documented;
- every customer-facing promotion and risk claim has compliance approval;
- KYC, sanctions, transaction monitoring, and case management work end to end;
- payment, custody, exchange, and banking contracts are signed;
- card data is handled through an approved architecture;
- the ledger reconciles against every provider;
- withdrawals have step-up authentication and review controls;
- opportunity estimates include fees, slippage, capacity, and expiry;
- the platform never presents an estimate as a guarantee;
- all admin actions are attributable and auditable;
- connectors can be disabled without redeploying the whole platform;
- backups and restore have been tested;
- penetration testing and remediation are complete;
- customer complaints and incident-response playbooks are staffed;
- terms, privacy notice, disclosures, and data-retention rules are published;
- accessibility and reduced-motion requirements are tested;
- the first release is limited to an allowlisted set of assets, countries, providers, and transaction sizes.

## 21. Recommended first release

The safest and fastest credible MVP is:

- one jurisdiction;
- one regulated fiat/payment provider;
- one KYC/AML provider;
- two or three exchange data providers;
- read-only opportunity analytics;
- no pooled funds;
- no guaranteed returns;
- customer-confirmed execution only in a later controlled release;
- one fiat currency and a small allowlist of cryptoassets and networks;
- full ledger, audit trail, disclosures, and support from day one.

This still permits a beautiful, animated portal and real-time opportunity notifications, but it avoids making visual sophistication a substitute for licensing, custody, financial-crime controls, or honest risk communication.

## References

[1]: https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html "Updated Guidance for a Risk-Based Approach to Virtual Assets and Virtual Asset Service Providers"

[2]: https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers "Cryptoasset firms marketing to UK consumers"

[3]: https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica "Markets in Crypto-Assets Regulation (MiCA)"

[4]: https://www.pcisecuritystandards.org/standards/pci-dss/ "PCI Data Security Standard (PCI DSS)"

[5]: https://owasp.org/projects/asvs "OWASP Application Security Verification Standard (ASVS)"

[6]: https://www.nist.gov/cyberframework "NIST Cybersecurity Framework"

## Important notice

This document is a product and engineering specification, not legal, regulatory, tax, investment, custody, or accounting advice. Laws vary by jurisdiction and can change. Before accepting customer money, promoting cryptoasset opportunities, operating wallets, routing payments, or executing trades, obtain advice from qualified counsel and engage the relevant licensed providers and regulators. Arbitrage is not risk-free; estimates can be wrong, liquidity can disappear, transfers can fail, assets can lose value, and customers can lose some or all of their funds.
