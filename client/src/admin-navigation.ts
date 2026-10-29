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
  focus?: string;
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
  { id: "trade-settings", label: "Trading", detail: "Set up, watch and safely finish customer trades", items: [
    { id: "trade-settings-overview", target: "tradeSystemOverview", label: "Trading home", detail: "See what is open, what finished, and whether new trades are allowed", icon: Gauge },
    { id: "trade-packages-eligibility", target: "packages", focus: "tiers", label: "Customer tiers", detail: "Create the tiers customers receive after approved qualifying credits", icon: PackageCheck },
    { id: "trade-package-quotas", target: "packages", focus: "quotas", label: "Daily trade allowance", detail: "Set how many opportunities each tier can receive each day", icon: Layers3 },
    { id: "trade-opportunity-schedule", target: "opportunity", focus: "delivery", label: "When offers appear", detail: "Choose how often customer trade offers can appear", icon: Zap },
    { id: "trade-duration-closing", target: "tradeDurationRules", label: "How trades finish", detail: "Set the estimated wait and the rules that stop new trades; time alone never settles a trade", icon: Clock3 },
    { id: "trade-capital-wallet", target: "transactionReview", focus: "capital", label: "Money used for trades", detail: "Review wallet movements and the money needed before a trade can start", icon: WalletCards },
    { id: "trade-profit-fees-limits", target: "transactionReview", focus: "fees", label: "Returns and fees", detail: "Review configured return limits and the fee policy for completed trades", icon: CircleDollarSign },
    { id: "trade-retries-carry-forward", target: "tradeRetryPolicy", label: "Try failed trades again", detail: "Set how many technical retries are allowed; carry-forward is not available yet", icon: Activity },
    { id: "trade-company-catalogue", target: "opportunity", focus: "rotation", label: "Company names shown", detail: "Choose the company references customers may see; this never creates a trade", icon: Globe2 },
    { id: "trade-popup-display", target: "tradeCustomerDisplay", label: "Customer pop-up timing", detail: "Choose how long an offer and its completed message stay visible", icon: SlidersHorizontal },
    { id: "trade-notifications", target: "notificationCenter", label: "Trade messages", detail: "Review customer and administrator trade notifications", icon: Bell },
    { id: "trade-active-pending", target: "deliveryMonitor", label: "Open and waiting work", detail: "Check offers that are open, waiting, or need attention", icon: Activity },
    { id: "trade-settlement-reconciliation", target: "transactionReview", focus: "reconciliation", label: "Check finished trades", detail: "Compare completed trades with wallet ledger records", icon: ReceiptText },
    { id: "trade-system-health", target: "tradeSystemHealth", label: "Pause new trades", detail: "Stop new allocations safely while you investigate a problem", icon: ShieldAlert },
    { id: "trade-worker-health", target: "tradeWorkerHealth", label: "Worker health", detail: "Check the background service that delivers and settles trades", icon: Activity },
    { id: "trade-audit-policy-versions", target: "audit", label: "Who changed what", detail: "Read the admin change history and policy versions", icon: FileText },
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
