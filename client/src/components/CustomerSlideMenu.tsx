import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { createPortal } from "react-dom";
import {
  Activity, ArrowDownUp, BarChart3, BookMarked, BookOpen, CircleHelp, Coins, Cpu, FileText,
  Headphones, Home, Library, LockKeyhole, Map, Menu, Newspaper, Scale, Search, ShieldAlert,
  ShieldCheck, Sparkles, WalletCards, X, type LucideIcon,
} from "lucide-react";

type CustomerSlideMenuProps = { section: string; onNavigate: (section: string) => void };
type CustomerDestination = { label: string; detail: string; target: string; icon: LucideIcon; planned?: boolean };
type CustomerDestinationGroup = { label: string; detail: string; items: CustomerDestination[] };

const destinationGroups: CustomerDestinationGroup[] = [
  {
    label: "Core Workspace",
    detail: "Account tools and personal settings",
    items: [
      { label: "Power tools", detail: "Risk reports, sessions and support tools", target: "advanced", icon: Sparkles },
      { label: "Portfolio intelligence", detail: "Allocation health and signal quality", target: "intelligence", icon: BarChart3 },
      { label: "Account Settings", detail: "Profile, security and preferences", target: "account", icon: LockKeyhole },
    ],
  },
  {
    label: "Project & Investment",
    detail: "Project context before participation",
    items: [
      { label: "Whitepaper", detail: "Project thesis, architecture and operating model", target: "whitepaper", icon: BookOpen },
      { label: "Token Launch", detail: "Planned offering · review only, not live", target: "token-launch", icon: Coins, planned: true },
      { label: "Tokenomics", detail: "Planned token model · not currently active", target: "tokenomics", icon: Scale, planned: true },
      { label: "Roadmap", detail: "Milestones, delivery phases and priorities", target: "roadmap", icon: Map },
      { label: "Investment Research", detail: "Research notes, signals and market context", target: "investment-research", icon: Library },
    ],
  },
  {
    label: "Knowledge & Support",
    detail: "Learn, compare and get help",
    items: [
      { label: "Knowledge Base", detail: "Answers to common platform questions", target: "knowledge-base", icon: BookMarked },
      { label: "Documentation", detail: "How the platform and workflows operate", target: "documentation", icon: FileText },
      { label: "FAQs", detail: "Fast answers for common decisions", target: "faqs", icon: CircleHelp },
      { label: "Trading Guides", detail: "Practical guides for market workflows", target: "trading-guides", icon: Activity },
    ],
  },
  {
    label: "Transparency & Updates",
    detail: "Risk, legal and platform updates",
    items: [
      { label: "Risk Disclosure", detail: "Important risks before any action", target: "risk-disclosure", icon: ShieldAlert },
      { label: "Legal Documents", detail: "Terms, policies and formal notices", target: "legal-documents", icon: Scale },
      { label: "News & Updates", detail: "Platform announcements and releases", target: "news-updates", icon: Newspaper },
    ],
  },
];

const destinations = destinationGroups.flatMap((group) => group.items);
const mainPageSearchDestinations: CustomerDestination[] = [
  { label: "Home", detail: "Main customer dashboard", target: "dashboard", icon: Home },
  { label: "Wallet", detail: "Balances, funding and transaction history", target: "wallet", icon: WalletCards },
  { label: "Opportunities", detail: "Published customer opportunities", target: "opportunities", icon: ArrowDownUp },
  { label: "Activity", detail: "Account activity and transactions", target: "activity", icon: Activity },
  { label: "Crypto Mining", detail: "Mining packages and activity", target: "crypto-mining", icon: Coins },
  { label: "Yield Strategies", detail: "Yield and staking products", target: "yield", icon: Sparkles },
  { label: "Support", detail: "Customer support and tickets", target: "support", icon: Headphones },
];
const menuTargets = new Set(destinations.map((item) => item.target));
const mainPageOnlySearchDestinations = mainPageSearchDestinations.filter((item) => !menuTargets.has(item.target));
const primaryLabels: Record<string, string> = {
  dashboard: "Dashboard", opportunities: "Opportunities", yield: "Yield Strategies", wallet: "Wallet",
  activity: "Activity", support: "Support", account: "Account Settings", security: "Security",
  kyc: "Identity verification", notifications: "Notifications", console: "Customer console",
  "crypto-mining": "Crypto Mining", "token-launch": "Token Launch",
};

export function CustomerSlideMenu({ section, onNavigate }: CustomerSlideMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const active = destinations.find((item) => item.target === section);
  const shouldSearchRecords = open && query.trim().length >= 2;
  const tradesQuery = trpc.customer.trades.useQuery(undefined, { enabled: shouldSearchRecords, staleTime: 15_000 });
  const consoleQuery = trpc.customer.transactionConsole.useQuery(undefined, { enabled: shouldSearchRecords, staleTime: 15_000 });
  const payoutQuery = trpc.customer.payoutRequests.useQuery(undefined, { enabled: shouldSearchRecords, staleTime: 15_000 });
  const ticketQuery = trpc.customer.tickets.useQuery(undefined, { enabled: shouldSearchRecords, staleTime: 15_000 });
  const activeLabel = active?.label || primaryLabels[section] || "Customer workspace";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = destinationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery)),
  })).filter((group) => group.items.length > 0);
  const mainPageMatches = normalizedQuery.length >= 1
    ? mainPageOnlySearchDestinations.filter((item) => `${item.label} ${item.detail} ${item.target}`.toLowerCase().includes(normalizedQuery)).slice(0, 6)
    : [];
  const recordMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    const collections: Array<{ kind: string; rows: any[]; target: string }> = [
      { kind: "Transaction", rows: Array.isArray(tradesQuery.data) ? tradesQuery.data as any[] : [], target: "activity" },
      { kind: "Transaction activity", rows: Array.isArray(consoleQuery.data) ? consoleQuery.data as any[] : [], target: "activity" },
      { kind: "Withdrawal request", rows: Array.isArray(payoutQuery.data) ? payoutQuery.data as any[] : [], target: "wallet" },
      { kind: "Support ticket", rows: Array.isArray(ticketQuery.data) ? ticketQuery.data as any[] : [], target: "support" },
    ];
    return collections.flatMap(({ kind, rows, target }) => rows.filter((row) => {
      const searchable = Object.entries(row || {}).filter(([key, value]) =>
        !/email|phone|address|metadata|message|body|token|secret|password/i.test(key) &&
        ["string", "number"].includes(typeof value)
      ).map(([key, value]) => `${key} ${String(value)}`).join(" ").toLowerCase();
      return searchable.includes(normalizedQuery);
    }).slice(0, 5).map((row) => {
      const id = row.transactionCode ?? row.reference ?? row.ticketNumber ?? row.id ?? row.tradeId ?? "Record";
      const description = row.title ?? row.subject ?? row.symbol ?? row.currency ?? row.asset ?? kind;
      const status = row.status ? ` · ${String(row.status)}` : "";
      return { kind, id: String(id), description: String(description), status, target, key: `${kind}:${String(id)}` };
    })).slice(0, 10);
  }, [normalizedQuery, tradesQuery.data, consoleQuery.data, payoutQuery.data, ticketQuery.data]);
  const recordSearchLoading = shouldSearchRecords && [tradesQuery, consoleQuery, payoutQuery, ticketQuery].some((item) => item.isLoading);
  const recordSearchFailed = shouldSearchRecords && [tradesQuery, consoleQuery, payoutQuery, ticketQuery].every((item) => item.isError);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
        'a[href]:not([tabindex="-1"]):not([aria-disabled="true"]),button:not([tabindex="-1"]):not([disabled]),input:not([tabindex="-1"]):not([disabled]),select:not([tabindex="-1"]):not([disabled]),textarea:not([tabindex="-1"]):not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled]),[contenteditable="true"]'
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("input,button:not([tabindex=\"-1\"])")?.focus());
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  const navigate = (target: string) => { onNavigate(target); close(); };
  const renderItem = (item: CustomerDestination) => {
    const Icon = item.icon;
    return <button key={item.target} type="button" className={`admin-slide-item${section === item.target ? " is-active" : ""}`} tabIndex={open ? 0 : -1} aria-current={section === item.target ? "page" : undefined} onClick={() => navigate(item.target)}><span className="admin-slide-item-icon"><Icon size={17} /></span><span className="admin-slide-item-copy"><strong>{item.label}{item.planned && <em className="customer-slide-planned">PLANNED</em>}</strong><small>{item.detail}</small></span><span className="admin-slide-item-arrow">→</span></button>;
  };

  return <><div className={`admin-slide-layer customer-slide-layer arb-page${open ? " is-open" : ""}`}>
    <button ref={triggerRef} className="admin-slide-trigger customer-slide-trigger customer-resource-peek-trigger" type="button" aria-label={open ? "Close customer navigation" : "Open customer navigation"} title={open ? "Close customer navigation" : "Open customer navigation"} aria-controls="customer-navigation-drawer" aria-expanded={open} tabIndex={open ? -1 : 0} onClick={() => setOpen(true)}><span className="customer-resource-bulb" aria-hidden="true"><Menu size={24} strokeWidth={1.9} /></span><span className="customer-resource-bulb-label">MENU</span><span className="admin-slide-trigger-led" /></button>
    </div>{typeof document !== "undefined" && createPortal(
      <div className={`admin-slide-layer admin-slide-portal-layer customer-slide-portal arb-page${open ? " is-open" : ""}`}>
    <button className="admin-slide-backdrop" type="button" aria-label="Close customer navigation" tabIndex={open ? 0 : -1} onClick={close} />
    <aside id="customer-navigation-drawer" ref={menuRef} className="admin-slide-drawer customer-slide-drawer" aria-label="Customer navigation and resources" aria-hidden={!open} role="dialog" aria-modal={open}>
      <div className="admin-slide-drawer-topline"><span><i /> CUSTOMER COMMAND PANEL</span><span className="admin-slide-count">MAIN MENU</span></div>
      <div className="admin-slide-heading"><div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div><div className="admin-slide-title"><span>CUSTOMER WORKSPACE</span><h2>Navigation &amp; resources</h2></div><button className="admin-slide-close" type="button" onClick={close} aria-label="Close customer navigation" tabIndex={open ? 0 : -1}><X size={17} /></button></div>
      <div className="admin-slide-current"><span className="admin-slide-current-icon"><Activity size={15} /></span><span><small>YOU ARE IN</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
      <div className="quick-actions-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and resources" aria-label="Search customer pages and resources" tabIndex={open ? 0 : -1} /></div>
      <nav className="admin-slide-nav quick-actions-nav customer-resource-nav" aria-label="Customer pages and resources">
        {filteredGroups.map((group) => <section className="admin-slide-group customer-resource-group" key={group.label}><div className="admin-slide-group-title"><span>{group.label}</span><small>{group.detail}</small><i /></div><div className="admin-slide-items">{group.items.map(renderItem)}</div></section>)}
        {mainPageMatches.length > 0 && <section className="admin-slide-group customer-resource-group" aria-label="Main menu page matches">
          <div className="admin-slide-group-title"><span>Main menu pages</span><small>Destinations already available on the main page</small><i /></div>
          <div className="admin-slide-items">{mainPageMatches.map((item) => { const Icon = item.icon; return <button key={item.target} type="button" className="admin-slide-item customer-search-result" tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><span className="admin-slide-item-icon"><Icon size={16} /></span><span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="admin-slide-item-arrow">→</span></button>; })}</div>
        </section>}
        {!filteredGroups.length && !mainPageMatches.length && normalizedQuery.length > 0 && <div className="customer-resource-empty" role="status" aria-live="polite">No pages or resources match “{query}”.</div>}
        {normalizedQuery.length >= 2 && <section className="customer-resource-group customer-search-records" aria-label="Matching account records">
          <div className="admin-slide-group-title"><span>Account records</span><small>Private records for your signed-in account</small><i /></div>
          {recordSearchLoading && <div className="customer-resource-empty" role="status">Searching account records…</div>}
          {recordSearchFailed && <div className="customer-resource-empty" role="status">Account records could not be searched right now. Please retry in a moment.</div>}
          {!recordSearchLoading && !recordSearchFailed && recordMatches.map((match) => <button key={match.key} type="button" className="admin-slide-item customer-search-result" tabIndex={open ? 0 : -1} onClick={() => navigate(match.target)}><span className="admin-slide-item-icon"><Search size={16} /></span><span className="admin-slide-item-copy"><strong>{match.description}</strong><small>{match.kind} · {match.id}{match.status}</small></span><span className="admin-slide-item-arrow">→</span></button>)}
          {!recordSearchLoading && !recordSearchFailed && !recordMatches.length && <div className="customer-resource-empty" role="status" aria-live="polite">No matching account records found.</div>}
        </section>}
      </nav>
      <div className="admin-slide-footer"><div className="quick-actions-status"><span><span className="quick-actions-status-dot" /> Customer workspace</span><strong>Connected</strong><small>Database-backed customer portal</small></div><div className="admin-slide-footer-note">Open a destination to switch customer pages. Items marked Planned are not live offerings.</div></div>
    </aside>
      </div>,
      document.body
    )}</>;
}
