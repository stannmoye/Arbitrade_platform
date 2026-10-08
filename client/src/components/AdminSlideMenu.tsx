import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Menu,
  Search,
  ShieldAlert,
  ShieldCheck,
  TicketCheck,
  X,
  type LucideIcon,
} from "lucide-react";

type AdminMenuItem = { id: string; label: string; detail: string; icon: LucideIcon };

const menuItems: AdminMenuItem[] = [
  { id: "suiteTickets", label: "Tickets", detail: "Customer support queue", icon: TicketCheck },
  { id: "deliveryMonitor", label: "Opportunity Delivery", detail: "Popup lifecycle and reach", icon: Activity },
  { id: "verificationOversight", label: "Verification Oversight", detail: "Email and KYC controls", icon: BadgeCheck },
  { id: "riskWatchlist", label: "Risk Watchlist", detail: "Risk tiers and account state", icon: ShieldAlert },
  { id: "transactionReview", label: "Transaction Review", detail: "Read-only wallet ledger", icon: CircleDollarSign },
  { id: "reportsExports", label: "Reports & Exports", detail: "Download operational records", icon: FileText },
];

export function AdminSlideMenu({
  section,
  onNavigate,
}: {
  section: string;
  onNavigate: (section: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const userInteracted = useRef(false);
  const menuRef = useRef<HTMLElement | null>(null);
  const activeLabel = menuItems.find((item) => item.id === section)?.label || "Admin workspace";

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      if (!userInteracted.current) setOpen(true);
    }, 800);
    const tuckTimer = window.setTimeout(() => {
      if (!userInteracted.current) setOpen(false);
    }, 6_800);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(tuckTimer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        userInteracted.current = true;
        setOpen(false);
      }
      if (event.key === "Tab") {
        const focusable = menuRef.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    userInteracted.current = true;
    setOpen(false);
  };

  const toggle = () => {
    userInteracted.current = true;
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"])')?.focus());
  };

  const navigate = (id: string) => {
    userInteracted.current = true;
    onNavigate(id);
    setOpen(false);
  };

  return (
    <div className={`admin-slide-layer${open ? " is-open" : ""}`}>
      <button
        className="admin-slide-trigger"
        type="button"
        aria-label={open ? "Close supplemental admin tools" : "Open supplemental admin tools"}
        aria-controls="admin-navigation-drawer"
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        onClick={toggle}
      >
        <span className="admin-slide-trigger-icon"><Menu size={18} /></span>
        <span className="admin-slide-trigger-copy">ADMIN TOOLS</span>
        <span className="admin-slide-trigger-led" />
      </button>

      <button className="admin-slide-backdrop" type="button" aria-label="Close admin tools" tabIndex={open ? 0 : -1} onClick={close} />

      <aside
        id="admin-navigation-drawer"
        ref={menuRef}
        className="admin-slide-drawer"
        aria-label="Supplemental administrator tools"
        aria-hidden={!open}
        role="dialog"
        aria-modal={open}
        onPointerEnter={() => { userInteracted.current = true; }}
        onFocusCapture={() => { userInteracted.current = true; }}
      >
        <div className="admin-slide-drawer-topline"><span><i /> ADMIN OPERATIONS</span><span className="admin-slide-count">06 TOOLS</span></div>
        <div className="admin-slide-heading">
          <div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div>
          <div className="admin-slide-title"><span>SUPPLEMENTAL SUITE</span><h2>Operations</h2></div>
          <button className="admin-slide-close" type="button" onClick={close} aria-label="Close admin tools" tabIndex={open ? 0 : -1}><X size={17} /></button>
        </div>
        <div className="admin-slide-current"><span className="admin-slide-current-icon"><Search size={15} /></span><span><small>YOU ARE IN</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
        <nav className="admin-slide-nav" aria-label="Supplemental admin pages">
          <section className="admin-slide-group">
            <div className="admin-slide-group-title"><span>Operations desk</span><i /></div>
            <div className="admin-slide-items">
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button key={item.id} type="button" className={`admin-slide-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} tabIndex={open ? 0 : -1} onClick={() => navigate(item.id)}>
                    <span className="admin-slide-item-icon"><Icon size={17} strokeWidth={1.8} /></span>
                    <span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <span className="admin-slide-item-index">{String(index + 1).padStart(2, "0")}</span>
                    <ChevronRight className="admin-slide-item-arrow" size={15} />
                  </button>
                );
              })}
            </div>
          </section>
        </nav>
        <div className="admin-slide-footer">
          <div className="admin-slide-session"><span className="admin-slide-session-icon"><ShieldCheck size={16} /></span><span><strong>Administrator workspace</strong><small>Role-protected portal</small></span><span className="admin-slide-session-status">ACTIVE</span></div>
          <button className="admin-slide-exit" type="button" tabIndex={open ? 0 : -1} onClick={() => { close(); window.location.assign("/"); }}><ArrowUpRight size={15} /> Exit admin workspace</button>
          <div className="admin-slide-footer-note">Overlay navigation — the original left rail and page width stay unchanged.</div>
        </div>
      </aside>
    </div>
  );
}
