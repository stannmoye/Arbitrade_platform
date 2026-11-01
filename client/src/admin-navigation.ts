import {
  Activity,
  BadgeCheck,
  BookOpen,
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
  { id: "trade-settings", label: "Trade Settings", detail: "One place for tier rules, opportunity delivery, trade records and system health", items: [
    { id: "trade-settings-overview", target: "tradeSystemOverview", label: "Trading Overview", detail: "View current delivery, open work and system status", icon: Gauge },
    { id: "trade-tiers-eligibility", target: "packages", focus: "tiers", label: "Tiers & Eligibility", detail: "Create and edit admin-managed tiers, thresholds, duration and assigned entitlements", icon: PackageCheck },
    { id: "trade-daily-delivery-caps", target: "packages", focus: "quotas", label: "Daily Delivery Caps", detail: "Set hard pop-up limits, simultaneous display limits and the counting window", icon: Layers3 },
    { id: "trade-delivery-policy", target: "packages", focus: "policy", label: "Delivery Switches & Offer Rules", detail: "Control tier policy, pop-up delivery, capital bounds and published offer limits", icon: SlidersHorizontal },
    { id: "trade-opportunity-publishing", target: "opportunity", label: "Publish & Manage Opportunities", detail: "Publish reviewed opportunities, import validated records and inspect the open feed", icon: Zap },
    { id: "trade-delivery-schedule", target: "packages", focus: "delivery", label: "Delivery Schedule", detail: "Set the server-controlled gaps and timing between customer pop-ups", icon: Clock3 },
    { id: "trade-duration-closing", target: "tradeDurationRules", label: "Trade Duration & Closing", detail: "Configure trade duration and review/closing deadlines; elapsed time never confirms a result", icon: Clock3 },
    { id: "trade-popup-display", target: "tradeCustomerDisplay", label: "Customer Pop-up Display", detail: "Set how long opportunity and completion messages remain visible", icon: SlidersHorizontal },
    { id: "trade-company-rotation", target: "packages", focus: "rotation", label: "Company Rotation Rules", detail: "Choose approved company filters and repeat-avoidance rules for pop-ups", icon: Globe2 },
    { id: "trade-company-catalogue", target: "companyCatalogue", label: "Company Catalogue", detail: "Search and manage the saved company reference records and approval status", icon: Search },
    { id: "trade-capital-funding", target: "transactionReview", focus: "capital", label: "Capital & Wallet Funding Rules", detail: "Review capital requirements and permitted wallet funding policy", icon: WalletCards },
    { id: "trade-fees-earnings", target: "transactionReview", focus: "fees", label: "Fees & Earnings Limits", detail: "Configure the fee policy and review earnings limits", icon: CircleDollarSign },
    { id: "trade-retries", target: "tradeRetryPolicy", label: "Retries & Carry-Forward", detail: "Set technical retry limits and inspect the current carry-forward availability", icon: Activity },
    { id: "trade-active-pending", target: "deliveryMonitor", label: "Active & Pending Opportunities", detail: "Review opportunities waiting for delivery, customer action or further processing", icon: Activity },
    { id: "trade-settlement", target: "transactionReview", focus: "reconciliation", label: "Settlement & Reconciliation", detail: "Review confirmed outcomes and reconcile trade records against wallet ledger entries", icon: ReceiptText },
    { id: "trade-system-health", target: "tradeSystemHealth", label: "System Pause & Safety", detail: "Pause new allocations safely without deleting pending work or blocking reconciliation", icon: ShieldAlert },
    { id: "trade-worker-health", target: "tradeWorkerHealth", label: "Worker Health & Recovery", detail: "Check background worker heartbeats, delayed work and recovery queues", icon: Activity },
    { id: "trade-audit-policy-history", target: "audit", label: "Audit & Policy History", detail: "Review who changed Trading settings, why they changed and the saved versions", icon: FileText },
    { id: "trade-admin-guide", target: "tradeAdminGuide", label: "Trade Settings Guide", detail: "Read the menu guide and explanations for each Trading control", icon: BookOpen },
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
    { id: "reports-exports", target: "reportsExports", label: "Reports & Exports", detail: "Customer, finance, KYC and admin records", icon: FileText },
  ]},
];

/** Groups shown in the right-side secondary navigation drawer. */
export const adminSecondaryNavigationGroupIds = [
  "verification-risk",
  "communications",
  "platform-configuration",
  "integrations",
  "governance-reports",
] as const;

export const adminSecondaryNavigationGroups = adminNavigationGroups.filter((group) =>
  adminSecondaryNavigationGroupIds.includes(group.id as typeof adminSecondaryNavigationGroupIds[number])
);

export const adminPrimaryNavigationGroups = adminNavigationGroups.filter((group) =>
  !adminSecondaryNavigationGroupIds.includes(group.id as typeof adminSecondaryNavigationGroupIds[number])
);

export const allAdminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);
export function getAdminNavigationItem(target: string) { return allAdminNavigationItems.find((item) => item.target === target); }
