import { useEffect, useRef, useState } from "react";
import { Activity, CircleDollarSign, Clock3, Database, FileText, Mail, Menu, RefreshCw, Search, ShieldAlert, ShieldCheck, TicketCheck, Users, WalletCards, X, Zap, type LucideIcon } from "lucide-react";
import { quickActionItems } from "../admin-navigation";

type AdminSlideMenuProps = { section: string; onNavigate: (section: string) => void };

export function AdminSlideMenu({ section, onNavigate }: AdminSlideMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const activeLabel = section === "suiteTickets" ? "Support Tickets" : section === "deliveryMonitor" ? "Delivery & Lifecycle" : section === "smtpCenter" ? "SMTP Transport" : section === "credit" ? "Credit Adjustment" : section === "debit" ? "Debit Adjustment" : section === "opportunity" ? "Offers" : section === "customers" ? "Customer Directory" : "Admin workspace";
  const counters = [
    { label: "Pending KYC", value: "Review queue", target: "verificationOversight", icon: ShieldCheck },
    { label: "Open tickets", value: "Support queue", target: "suiteTickets", icon: TicketCheck },
    { label: "Risk alerts", value: "Risk watchlist", target: "riskWatchlist", icon: ShieldAlert },
  ];
  const recent = [
    { label: "Administrative audit log", target: "audit", icon: FileText },
    { label: "Wallet & ledger", target: "transactionReview", icon: WalletCards },
    { label: "Provider readiness", target: "apis", icon: Database },
  ];
  const matchesQuery = (item: { label: string; target: string; detail?: string; value?: string }) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [item.label, item.target, item.detail, item.value]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  };
  const filteredActions = quickActionItems.filter(matchesQuery);
  const filteredCounters = counters.filter(matchesQuery);
  const filteredRecent = recent.filter(matchesQuery);
  const hasSearchResults = filteredActions.length + filteredCounters.length + filteredRecent.length > 0;

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

  return <div className={`admin-slide-layer arb-page${open ? " is-open" : ""}`}>
    <button ref={triggerRef} className="admin-slide-trigger" type="button" aria-label={open ? "Close Quick Actions" : "Open Quick Actions"} aria-controls="admin-navigation-drawer" aria-expanded={open} tabIndex={open ? -1 : 0} onClick={() => setOpen(true)}>
      <span className="admin-slide-trigger-icon"><Menu size={18} /></span><span className="admin-slide-trigger-copy">QUICK ACTIONS</span><span className="admin-slide-trigger-led" />
    </button>
    <button className="admin-slide-backdrop" type="button" aria-label="Close Quick Actions" tabIndex={open ? 0 : -1} onClick={close} />
    <aside id="admin-navigation-drawer" ref={menuRef} className="admin-slide-drawer quick-actions-drawer" aria-label="Quick Actions" aria-hidden={!open} role="dialog" aria-modal={open}>
      <div className="admin-slide-drawer-topline"><span><i /> COMMAND PANEL</span><span className="admin-slide-count">ROLE-AWARE</span></div>
      <div className="admin-slide-heading"><div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div><div className="admin-slide-title"><span>CANONICAL DESTINATIONS</span><h2>Quick Actions</h2></div><button className="admin-slide-close" type="button" onClick={close} aria-label="Close Quick Actions" tabIndex={open ? 0 : -1}><X size={17} /></button></div>
      <div className="admin-slide-current"><span className="admin-slide-current-icon"><Activity size={15} /></span><span><small>YOU ARE IN</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
      <div className="quick-actions-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions and destinations" aria-label="Search actions and destinations" /></div>
      <nav className="admin-slide-nav quick-actions-nav" aria-label="Quick Actions command panel">
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>Quick-create</span><i /></div><div className="admin-slide-items">{filteredActions.map((item) => { const Icon = item.icon as LucideIcon; return <button key={item.label} type="button" className="admin-slide-item" tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><span className="admin-slide-item-icon"><Icon size={17} /></span><span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span></button>; })}</div></section>
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>Assigned work</span><i /></div><div className="quick-actions-counter-list">{filteredCounters.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" className="quick-actions-counter" tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><Icon size={15} /><span><strong>{item.label}</strong><small>{item.value}</small></span><span className="quick-actions-counter-arrow">→</span></button>; })}</div></section>
        <section className="admin-slide-group"><div className="admin-slide-group-title"><span>Recent activity</span><i /></div><div className="quick-actions-recent-list">{filteredRecent.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" className="quick-actions-recent" tabIndex={open ? 0 : -1} onClick={() => navigate(item.target)}><Icon size={14} /><span>{item.label}</span></button>; })}</div></section>
        {!hasSearchResults && <p className="quick-actions-empty" role="status">No matching actions or destinations.</p>}
      </nav>
      <div className="admin-slide-footer"><div className="quick-actions-status"><span><span className="quick-actions-status-dot" /> System status</span><strong>Connected</strong><small>Database and portal runtime</small></div><button className="admin-slide-exit" type="button" tabIndex={open ? 0 : -1} onClick={() => window.location.reload()}><RefreshCw size={15} /> Refresh status</button><div className="admin-slide-footer-note">Counters and actions link to the canonical menu tree.</div></div>
    </aside>
  </div>;
}
