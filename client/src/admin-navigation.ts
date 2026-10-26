import {
  Activity,
  BadgeCheck,
  Bell,
  CircleDollarSign,
  Clock3,
  Coins,
  FileCheck2,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Mail,
  MessageSquare,
  PackageCheck,
  Palette,
  PlugZap,
  ReceiptText,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TicketCheck,
  Users,
  WalletCards,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
  id: string;
  target: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  children?: Array<{ label: string; detail: string }>;
};

export type AdminNavigationGroup = {
  id: string;
  label: string;
  detail: string;
  items: AdminNavigationItem[];
};

/** Canonical destination registry. Drawer actions deep-link to target and never render a second page. */
export const adminNavigationGroups: AdminNavigationGroup[] = [
  { id: "overview", label: "Overview", detail: "Read-mostly operational summary", items: [
    { id: "overview-dashboard", target: "overview", label: "Dashboard", detail: "Health, totals, alerts and live summaries", icon: Gauge },
  ]},
  { id: "customers", label: "Customers", detail: "Accounts, access and customer controls", items: [
    { id: "customer-directory", target: "customers", label: "Customer Directory", detail: "Search, create and manage customer accounts", icon: Users, children: [
      { label: "Add Customer", detail: "Create a database-backed account" },
      { label: "Customer Profile", detail: "Summary, access, verification, risk, notes and activity" },
    ]},
  ]},
  { id: "finance", label: "Finance", detail: "Wallets, ledger and asset controls", items: [
    { id: "wallet-ledger", target: "transactionReview", label: "Wallet & Ledger", detail: "Immutable balances and transaction history", icon: WalletCards },
    { id: "credit-adjustment", target: "credit", label: "Credit Adjustment", detail: "Auditable wallet credit action", icon: CircleDollarSign },
    { id: "debit-adjustment", target: "debit", label: "Debit Adjustment", detail: "Validated wallet debit action", icon: ReceiptText },
    { id: "currencies-assets", target: "currencies", label: "Currencies & Assets", detail: "Currency registry and valuation rates", icon: Coins },
    { id: "mining-operations", target: "mining", label: "Mining", detail: "Simulated mining packages, rewards, conversions and ledger controls", icon: Coins },
  ]},
  { id: "trade-settings", label: "Trade Settings", detail: "Admin-controlled trading policy, automation and settlement", items: [
    { id: "trade-settings-overview", target: "opportunity", label: "Overview", detail: "Trading operations, current offers and delivery health", icon: Gauge },
    { id: "trade-packages-eligibility", target: "packages", label: "Packages & Eligibility", detail: "Package definitions, activation eligibility and entitlements", icon: PackageCheck },
    { id: "trade-package-quotas", target: "packages", label: "Package Quotas & Customer Limits", detail: "Per-package opportunity quotas and customer limits", icon: Layers3 },
    { id: "trade-opportunity-schedule", target: "opportunity", label: "Opportunity Schedule", detail: "Admin-configured delivery schedules and quotas", icon: Zap },
    { id: "trade-duration-closing", target: "opportunity", label: "Trade Duration & Closing Rules", detail: "Configure duration policy; authoritative timing remains server-owned", icon: Clock3 },
    { id: "trade-capital-wallet", target: "transactionReview", label: "Capital Allocation & Wallet Rules", detail: "Review wallet balances, ledger movements and allocation records", icon: WalletCards },
    { id: "trade-profit-fees-limits", target: "opportunity", label: "Profit, Fees & Earnings Limits", detail: "Configure reward policy and package/customer ceilings", icon: CircleDollarSign },
    { id: "trade-retries-carry-forward", target: "deliveryMonitor", label: "Retries & Carry-Forward", detail: "Inspect delivery lifecycle, retry and pending work", icon: Activity },
    { id: "trade-company-catalogue", target: "opportunity", label: "Company Catalogue & Rotation", detail: "Manage informational company references and rotation policy", icon: Globe2 },
    { id: "trade-popup-display", target: "deliveryMonitor", label: "Trade Pop-up & Customer Display", detail: "Review customer delivery and popup lifecycle", icon: SlidersHorizontal },
    { id: "trade-notifications", target: "notificationCenter", label: "Notifications", detail: "Trading-related customer and administrator notifications", icon: Bell },
    { id: "trade-active-pending", target: "deliveryMonitor", label: "Active Trades & Pending Work", detail: "Review delivery states and unresolved work", icon: Activity },
    { id: "trade-settlement-reconciliation", target: "transactionReview", label: "Settlement & Reconciliation", detail: "Inspect ledger-backed movements and reconciliation records", icon: ReceiptText },
    { id: "trade-system-health", target: "tradeSystemHealth", label: "System Health & Pause Controls", detail: "Global pause for new allocations and operational safety status", icon: ShieldAlert },
    { id: "trade-audit-policy-versions", target: "audit", label: "Audit Log & Policy Versions", detail: "Review administrator actions and audit history", icon: FileText },
  ]},
  { id: "verification-risk", label: "Verification & Risk", detail: "KYC, review, risk and session oversight", items: [
    { id: "kyc-overview", target: "kycCenter", label: "KYC Overview", detail: "Stages, metrics, settings and review posture", icon: ShieldCheck },
    { id: "verification-queue", target: "verificationOversight", label: "Verification Queue", detail: "Human decisions and verification status", icon: FileCheck2 },
    { id: "customer-verification", target: "verificationOversight", label: "Customer Verification", detail: "Searchable customer verification directory", icon: BadgeCheck },
    { id: "risk-watchlist", target: "riskWatchlist", label: "Risk Watchlist", detail: "Risk tiers, alerts and account state", icon: ShieldAlert },
    { id: "alert-governance", target: "riskWatchlist", label: "Alert Governance", detail: "Review and govern risk signals", icon: Bell },
    { id: "session-device-oversight", target: "riskWatchlist", label: "Session & Device Oversight", detail: "Review and revoke customer sessions", icon: ShieldAlert },
    { id: "kyc-audit-trail", target: "kycCenter", label: "KYC Audit Trail", detail: "Signed KYC chain and minimized events", icon: FileText },
  ]},
  { id: "communications", label: "Communications", detail: "Email operations and support work", items: [
    { id: "email-activity-queue", target: "emailCenter", label: "Email Activity & Queue", detail: "Customer communications and queued actions", icon: Mail },
    { id: "smtp-transport", target: "smtpCenter", label: "Email & SMTP Settings", detail: "Configure local mail, SendGrid, Amazon SES or another SMTP provider", icon: Mail },
    { id: "compose-email", target: "smtpCenter", label: "Compose Email", detail: "Recipients, rich text and attachments", icon: Mail },
    { id: "support-tickets", target: "suiteTickets", label: "Support Tickets", detail: "Canonical customer support queue", icon: TicketCheck },
    { id: "customer-notifications", target: "notificationCenter", label: "Announcements & Notifications", detail: "Publish customer updates and review operational alerts", icon: Bell },
    { id: "communication-settings", target: "communicationSettings", label: "Message Templates & WhatsApp", detail: "Configure WhatsApp contact, customer message copy and planned wallet-provider details", icon: MessageSquare },
  ]},
  { id: "platform-configuration", label: "Platform Configuration", detail: "Signup, security and shared preferences", items: [
    { id: "signup-onboarding", target: "signup", label: "Signup & Onboarding", detail: "Signup rules, gates and jurisdiction matrix", icon: Globe2 },
    { id: "security-policies", target: "policies", label: "Security Policies", detail: "KYC, withdrawals, 2FA and facial defaults", icon: ShieldCheck },
    { id: "privacy-management", target: "privacyManagement", label: "Privacy Management", detail: "Publish privacy notices and review customer privacy requests", icon: FileText },
    { id: "general-settings", target: "settings", label: "General Settings", detail: "Shared operational settings", icon: Settings2 },
    { id: "sound-notifications", target: "sound", label: "Sound & Notifications", detail: "Notification sound and preference controls", icon: Bell },
    { id: "branding-identity", target: "branding", label: "Branding & Identity", detail: "Brand and identity presentation", icon: Settings2 },
    { id: "appearance-themes", target: "appearance", label: "Appearance & Themes", detail: "Default theme, previews and customer theme permissions", icon: Palette },
  ]},
  { id: "integrations", label: "Integrations", detail: "Providers and operational readiness", items: [
    { id: "provider-registry", target: "apis", label: "Provider Registry", detail: "API, market, payment and identity adapters", icon: PlugZap },
    { id: "provider-details", target: "apis", label: "Provider Details", detail: "Connection state and setup readiness", icon: Search },
    { id: "readiness-approval", target: "apis", label: "Readiness & Approval", detail: "Sandbox, permissions and activation gates", icon: ShieldCheck },
  ]},
  { id: "governance-reports", label: "Governance & Reports", detail: "Audit records and operational exports", items: [
    { id: "admin-audit-log", target: "audit", label: "Administrative Audit Log", detail: "General administrator actions", icon: FileText },
    { id: "reports-exports", target: "reportsExports", label: "Reports & Exports", detail: "Customer, finance, KYC and admin records", icon: FileText },
  ]},
];

export const quickActionItems = [
  { target: "customers", label: "Add Customer", detail: "Create an account", icon: Users },
  { target: "credit", label: "Credit Adjustment", detail: "Open audited wallet credit", icon: CircleDollarSign },
  { target: "debit", label: "Debit Adjustment", detail: "Open audited wallet debit", icon: ReceiptText },
  { target: "opportunity", label: "Create Offer", detail: "Open offer management", icon: Zap },
  { target: "smtpCenter", label: "Compose Email", detail: "Open the canonical composer", icon: Mail },
] as const;

export const allAdminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);
export function getAdminNavigationItem(target: string) { return allAdminNavigationItems.find((item) => item.target === target); }
