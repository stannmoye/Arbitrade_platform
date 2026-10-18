import { useEffect, useRef, useState } from "react";
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
    label: "Main navigation",
    detail: "Primary customer pages",
    items: [
      { label: "Dashboard", detail: "Account overview and activity summary", target: "dashboard", icon: Home },
      { label: "Wallet", detail: "Balances, funding, withdrawals and conversions", target: "wallet", icon: WalletCards },
      { label: "Opportunities", detail: "Review current market opportunities", target: "opportunities", icon: ArrowDownUp },
      { label: "Activity", detail: "Account and transaction history", target: "activity", icon: Activity },
      { label: "Crypto Mining", detail: "Mining package and simulated engine", target: "crypto-mining", icon: Cpu },
      { label: "Yield Strategies", detail: "Explore yield and staking products", target: "yield", icon: Sparkles },
      { label: "Support", detail: "Help and customer support", target: "support", icon: Headphones },
      { label: "Account Settings", detail: "Profile, security and preferences", target: "account", icon: LockKeyhole },
    ],
  },
  {
    label: "Core Workspace",
    detail: "Live account operating tools",
    items: [
      { label: "Power tools", detail: "Risk reports, sessions and support tools", target: "advanced", icon: Sparkles },
      { label: "Portfolio intelligence", detail: "Allocation health and signal quality", target: "intelligence", icon: BarChart3 },
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
const primaryLabels: Record<string, string> = {
  dashboard: "Dashboard", opportunities: "Opportunities", yield: "Yield Strategies", wallet: "Wallet",
  activity: "Activity", support: "Support", account: "Account Settings", security: "Security",
  kyc: "Identity verification", notifications: "Notifications", console: "Customer console",
  "crypto-mining": "Crypto Mining", "token-launch": "Token Launch", "treasury-bond": "Treasury Bond", "cooperate-dept": "Cooperate Dept",
  "litigation-funds": "Litigation Funds", "ip-royalties": "IP Royalties", "music-royalties": "Music Royalties", "agro-investment": "Agro Investment",
  "carbon-credit": "Carbon Credit", "green-energy": "Green Energy",
};

export function CustomerSlideMenu({ section, onNavigate }: CustomerSlideMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const active = destinations.find((item) => item.target === section);
  const activeLabel = active?.label || primaryLabels[section] || "Customer workspace";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = destinationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery)),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]),input:not([tabindex="-1"])') || []);
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

  return <div className={`admin-slide-layer customer-slide-layer arb-page${open ? " is-open" : ""}`}>
    <button ref={triggerRef} className="admin-slide-trigger customer-slide-trigger customer-resource-peek-trigger" type="button" aria-label={open ? "Close customer navigation" : "Open customer navigation"} title={open ? "Close customer navigation" : "Open customer navigation"} aria-controls="customer-navigation-drawer" aria-expanded={open} tabIndex={open ? -1 : 0} onClick={() => setOpen(true)}><span className="customer-resource-bulb" aria-hidden="true"><Menu size={24} strokeWidth={1.9} /></span><span className="customer-resource-bulb-label">MENU</span><span className="admin-slide-trigger-led" /></button>
    <button className="admin-slide-backdrop" type="button" aria-label="Close customer navigation" tabIndex={open ? 0 : -1} onClick={close} />
    <aside id="customer-navigation-drawer" ref={menuRef} className="admin-slide-drawer customer-slide-drawer" aria-label="Customer navigation and resources" aria-hidden={!open} role="dialog" aria-modal={open}>
      <div className="admin-slide-drawer-topline"><span><i /> CUSTOMER COMMAND PANEL</span><span className="admin-slide-count">MAIN MENU</span></div>
      <div className="admin-slide-heading"><div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div><div className="admin-slide-title"><span>CUSTOMER WORKSPACE</span><h2>Navigation &amp; resources</h2></div><button className="admin-slide-close" type="button" onClick={close} aria-label="Close customer navigation" tabIndex={open ? 0 : -1}><X size={17} /></button></div>
      <div className="admin-slide-current"><span className="admin-slide-current-icon"><Activity size={15} /></span><span><small>YOU ARE IN</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
      <div className="quick-actions-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and resources" aria-label="Search customer pages and resources" /></div>
      <nav className="admin-slide-nav quick-actions-nav customer-resource-nav" aria-label="Customer pages and resources">
        {filteredGroups.map((group) => <section className="admin-slide-group customer-resource-group" key={group.label}><div className="admin-slide-group-title"><span>{group.label}</span><small>{group.detail}</small><i /></div><div className="admin-slide-items">{group.items.map(renderItem)}</div></section>)}
        {!filteredGroups.length && <div className="customer-resource-empty">No pages or resources match “{query}”.</div>}
      </nav>
      <div className="admin-slide-footer"><div className="quick-actions-status"><span><span className="quick-actions-status-dot" /> Customer workspace</span><strong>Connected</strong><small>Database-backed customer portal</small></div><div className="admin-slide-footer-note">Open a destination to switch customer pages. Items marked Planned are not live offerings.</div></div>
    </aside>
  </div>;
}
