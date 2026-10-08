import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleDollarSign,
  Coins,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Menu,
  PlugZap,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

type AdminMenuItem = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type AdminMenuGroup = {
  label: string;
  items: AdminMenuItem[];
};

const menuGroups: AdminMenuGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Control centre", detail: "Live platform overview", icon: Gauge },
      { id: "customers", label: "Customers", detail: "Accounts and access", icon: Users },
    ],
  },
  {
    label: "Money & trading",
    items: [
      { id: "credit", label: "Credit customer", detail: "Wallet credit workflow", icon: CircleDollarSign },
      { id: "debit", label: "Debit customer", detail: "Wallet debit workflow", icon: ArrowDownToLine },
      { id: "currencies", label: "Currencies", detail: "Assets and conversion rates", icon: Coins },
      { id: "autoTrade", label: "Auto-trade policy", detail: "Global and account rules", icon: Zap },
      { id: "opportunity", label: "Opportunity engine", detail: "Delivery and eligibility", icon: Activity },
      { id: "packages", label: "Packages & groups", detail: "Entitlements and limits", icon: Layers3 },
    ],
  },
  {
    label: "Access & governance",
    items: [
      { id: "signup", label: "Signup policy", detail: "Registration and country rules", icon: Globe2 },
      { id: "policies", label: "Security policies", detail: "Identity and account controls", icon: ShieldCheck },
      { id: "audit", label: "Audit log", detail: "Administrative activity", icon: FileText },
      { id: "advanced", label: "Advanced controls", detail: "Operational safeguards", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "apis", label: "API registry", detail: "Provider health and scopes", icon: PlugZap },
      { id: "branding", label: "Branding & identity", detail: "Portal presentation", icon: Settings2 },
      { id: "sound", label: "Sound settings", detail: "Customer alert preferences", icon: Bell },
      { id: "settings", label: "Settings", detail: "Global configuration", icon: Settings2 },
    ],
  },
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
  const itemCount = menuGroups.reduce((total, group) => total + group.items.length, 0);

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
        const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
          'button:not([tabindex="-1"])'
        );
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
    if (nextOpen) {
      window.requestAnimationFrame(() => {
        menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"])')?.focus();
      });
    }
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
        aria-label={open ? "Close administrator navigation" : "Open administrator navigation"}
        aria-controls="admin-navigation-drawer"
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        onClick={toggle}
      >
        <span className="admin-slide-trigger-icon"><Menu size={18} /></span>
        <span className="admin-slide-trigger-copy">NAVIGATION</span>
        <span className="admin-slide-trigger-led" />
      </button>

      <button
        className="admin-slide-backdrop"
        type="button"
        aria-label="Close administrator navigation"
        tabIndex={open ? 0 : -1}
        onClick={close}
      />

      <aside
        id="admin-navigation-drawer"
        ref={menuRef}
        className="admin-slide-drawer"
        aria-label="Administrator navigation"
        aria-hidden={!open}
        onPointerEnter={() => { userInteracted.current = true; }}
        onFocusCapture={() => { userInteracted.current = true; }}
      >
        <div className="admin-slide-drawer-topline"><span><i /> OPERATIONS SUITE</span><span className="admin-slide-count">{String(itemCount).padStart(2, "0")} MODULES</span></div>
        <div className="admin-slide-heading">
          <div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div>
          <div className="admin-slide-title"><span>ADMINISTRATOR</span><h2>Navigate</h2></div>
          <button className="admin-slide-close" type="button" onClick={close} aria-label="Close navigation" tabIndex={open ? 0 : -1}><X size={17} /></button>
        </div>
        <div className="admin-slide-current"><span className="admin-slide-current-icon"><Search size={15} /></span><span><small>YOU ARE IN</small><strong>{menuGroups.flatMap(group => group.items).find(item => item.id === section)?.label || "Admin workspace"}</strong></span><span className="admin-slide-current-dot" /></div>
        <nav className="admin-slide-nav" aria-label="Admin pages">
          {menuGroups.map(group => (
            <section className="admin-slide-group" key={group.label}>
              <div className="admin-slide-group-title"><span>{group.label}</span><i /></div>
              <div className="admin-slide-items">
                {group.items.map((item, index) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-slide-item${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      tabIndex={open ? 0 : -1}
                      onClick={() => navigate(item.id)}
                    >
                      <span className="admin-slide-item-icon"><Icon size={17} strokeWidth={1.8} /></span>
                      <span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                      <span className="admin-slide-item-index">{String(index + 1).padStart(2, "0")}</span>
                      <ChevronRight className="admin-slide-item-arrow" size={15} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="admin-slide-footer">
          <div className="admin-slide-session"><span className="admin-slide-session-icon"><ShieldCheck size={16} /></span><span><strong>Administrator workspace</strong><small>Role-protected portal</small></span><span className="admin-slide-session-status">ACTIVE</span></div>
          <button className="admin-slide-exit" type="button" tabIndex={open ? 0 : -1} onClick={() => { close(); window.location.assign("/"); }}><ArrowUpRight size={15} /> Exit admin workspace</button>
          <div className="admin-slide-footer-note">Navigation stays overlaid; your workspace never shifts.</div>
        </div>
      </aside>
    </div>
  );
}
