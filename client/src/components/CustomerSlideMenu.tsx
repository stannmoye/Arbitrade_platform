import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Bell, CircleHelp, LayoutDashboard, LockKeyhole, Menu, Search, Settings2, ShieldCheck, Sparkles, Terminal, WalletCards, X, type LucideIcon } from "lucide-react";

type CustomerSlideMenuProps = { section: string; onNavigate: (section: string) => void };
type CustomerDestination = { label: string; detail: string; target: string; icon: LucideIcon };

// Primary investment destinations intentionally stay in the visible customer rail.
const destinations: CustomerDestination[] = [
  { label: "Portfolio intelligence", detail: "Allocation health and signal quality", target: "intelligence", icon: BarChart3 },
  { label: "Wallet settings", detail: "Wallet balances, locks and preferences", target: "wallet", icon: WalletCards },
  { label: "Console mode", detail: "Focused customer operating view", target: "console", icon: Terminal },
  { label: "Account settings", detail: "Profile, preferences and account controls", target: "account", icon: Settings2 },
  { label: "Power tools", detail: "Risk reports, sessions and support tools", target: "advanced", icon: Sparkles },
  { label: "Activity centre", detail: "Recorded events and account history", target: "activity", icon: Activity },
  { label: "Security centre", detail: "Sessions, access and protection controls", target: "security", icon: LockKeyhole },
  { label: "KYC verification", detail: "Identity journey and verification status", target: "kyc", icon: ShieldCheck },
  { label: "Notifications", detail: "Account updates and delivery notices", target: "notifications", icon: Bell },
  { label: "Support centre", detail: "Open and follow customer support cases", target: "support", icon: CircleHelp },
];

const primaryLabels: Record<string, string> = {
  dashboard: "Home dashboard", opportunities: "Trade & Earn", yield: "Stake & Earn", wallet: "Wallet settings",
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
  const filtered = destinations.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  const quick = [destinations[1], destinations[0], destinations[6], destinations[7]];
  const shortcuts = [destinations[4], destinations[2], destinations[3], destinations[8], destinations[9]];

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
  const renderItem = (item: CustomerDestination) => { const Icon = item.icon; return <button key={item.target} type="button" className={`admin-slide-item${section === item.target ? " is-active" : ""}`} tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><span className="admin-slide-item-icon"><Icon size={17} /></span><span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="admin-slide-item-arrow">→</span></button>; };

  return <div className={`admin-slide-layer customer-slide-layer${open ? " is-open" : ""}`}>
    <button ref={triggerRef} className="admin-slide-trigger customer-slide-trigger" type="button" aria-label={open ? "Close customer menu" : "Open customer menu"} aria-controls="customer-navigation-drawer" aria-expanded={open} tabIndex={open ? -1 : 0} onClick={() => setOpen(true)}><span className="admin-slide-trigger-icon"><Menu size={18} /></span><span className="admin-slide-trigger-copy">CUSTOMER MENU</span><span className="admin-slide-trigger-led" /></button>
    <button className="admin-slide-backdrop" type="button" aria-label="Close customer menu" tabIndex={open ? 0 : -1} onClick={close} />
    <aside id="customer-navigation-drawer" ref={menuRef} className="admin-slide-drawer customer-slide-drawer" aria-label="Customer account menu" aria-hidden={!open} role="dialog" aria-modal={open}>
      <div className="admin-slide-drawer-topline"><span><i /> CUSTOMER COMMAND PANEL</span><span className="admin-slide-count">ACCOUNT-LINKED</span></div>
      <div className="admin-slide-heading"><div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div><div className="admin-slide-title"><span>SECONDARY WORKSPACE</span><h2>Customer tools</h2></div><button className="admin-slide-close" type="button" onClick={close} aria-label="Close customer menu" tabIndex={open ? 0 : -1}><X size={17} /></button></div>
      <div className="admin-slide-current"><span className="admin-slide-current-icon"><Activity size={15} /></span><span><small>YOU ARE IN</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
      <div className="quick-actions-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account tools" aria-label="Search customer account tools" /></div>
      <nav className="admin-slide-nav quick-actions-nav" aria-label="Customer account tools">
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>Important tools</span><i /></div><div className="admin-slide-items">{quick.map(renderItem)}</div></section>
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>Account shortcuts</span><i /></div><div className="quick-actions-counter-list">{shortcuts.map((item) => { const Icon = item.icon; return <button key={item.target} type="button" className="quick-actions-counter" tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><Icon size={15} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><span className="quick-actions-counter-arrow">→</span></button>; })}</div></section>
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>All account tools</span><i /></div><div className="admin-slide-items">{filtered.map(renderItem)}</div></section>
      </nav>
      <div className="admin-slide-footer"><div className="quick-actions-status"><span><span className="quick-actions-status-dot" /> Account status</span><strong>Connected</strong><small>Database-backed customer workspace</small></div><button className="admin-slide-exit" type="button" tabIndex={open ? 0 : -1} onClick={() => navigate("account")}><Settings2 size={15} /> Account settings</button><div className="admin-slide-footer-note">Primary investment categories stay in the main menu.</div></div>
    </aside>
  </div>;
}
