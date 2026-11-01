import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Menu, Search, X, type LucideIcon } from "lucide-react";
import { adminSecondaryNavigationGroups } from "../admin-navigation";

type AdminSlideMenuProps = { section: string; onNavigate: (section: string, focus?: string) => void };

const drawerFocusableSelector = 'a[href]:not([tabindex="-1"]):not([aria-disabled="true"]),button:not([tabindex="-1"]):not([disabled]),input:not([tabindex="-1"]):not([disabled]),select:not([tabindex="-1"]):not([disabled]),textarea:not([tabindex="-1"]):not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled]),[contenteditable="true"]';

export function AdminSlideMenu({ section, onNavigate }: AdminSlideMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(adminSecondaryNavigationGroups.map((group) => [group.id, true]))
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const activeLabel = adminSecondaryNavigationGroups.flatMap((group) => group.items).find((item) => item.target === section)?.label || "Admin workspace";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = adminSecondaryNavigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !normalizedQuery || [group.label, group.detail, item.label, item.detail, item.target, ...(item.children || []).flatMap((child) => [child.label, child.detail])]
        .join(" ").toLowerCase().includes(normalizedQuery)
    ),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(drawerFocusableSelector) || [])
        .filter((element) => !element.closest('[hidden], [aria-hidden="true"]'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !menuRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !menuRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("input,button:not([tabindex=\"-1\"])")?.focus());
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  const navigate = (target: string, focus?: string) => { onNavigate(target, focus); close(); };

  return <>{typeof document !== "undefined" && createPortal(
      <>
    <button ref={triggerRef} className="admin-slide-trigger admin-slide-portal-trigger" type="button" aria-label={open ? "Close Admin Menus" : "Open Admin Menus"} aria-controls="admin-navigation-drawer" aria-expanded={open} tabIndex={open ? -1 : 0} onClick={() => setOpen(true)}>
      <span className="admin-slide-trigger-icon"><Menu size={18} /></span><span className="admin-slide-trigger-copy">ADMIN MENUS</span><span className="admin-slide-trigger-led" />
    </button>
      <div className={`admin-slide-layer admin-slide-portal-layer${open ? " is-open" : ""}`}>
    <button className="admin-slide-backdrop" type="button" aria-label="Close Admin Menus" tabIndex={open ? 0 : -1} onClick={close} />
    <aside id="admin-navigation-drawer" ref={menuRef} className="admin-slide-drawer quick-actions-drawer admin-secondary-drawer" aria-label="Additional admin navigation" aria-hidden={!open} inert={!open} role="dialog" aria-modal={open}>
      <div className="admin-slide-drawer-topline"><span><i /> ADMINISTRATION</span><span className="admin-slide-count">MORE SECTIONS</span></div>
      <div className="admin-slide-heading"><div className="admin-slide-mark"><img src="/arbitrade-mark.svg" alt="" /></div><div className="admin-slide-title"><span>SECONDARY NAVIGATION</span><h2>Admin Menus</h2></div><button className="admin-slide-close" type="button" onClick={close} aria-label="Close Admin Menus" tabIndex={open ? 0 : -1}><X size={17} /></button></div>
      <div className="admin-slide-current"><span className="admin-slide-current-icon"><Activity size={15} /></span><span><small>CURRENT SECTION</small><strong>{activeLabel}</strong></span><span className="admin-slide-current-dot" /></div>
      <div className="quick-actions-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin sections" aria-label="Search admin sections" tabIndex={open ? 0 : -1} /></div>
      <nav className="admin-slide-nav quick-actions-nav admin-secondary-nav" aria-label="Additional admin sections">
        {visibleGroups.map((group) => {
          const expanded = normalizedQuery.length > 0 || Boolean(expandedGroups[group.id]);
          return <section className={`admin-slide-group admin-secondary-group${expanded ? " is-open" : ""}`} key={group.id}>
            <button type="button" className="admin-secondary-group-heading" aria-expanded={expanded} tabIndex={open ? 0 : -1} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}>
              <span>{group.label}</span><small>{group.detail}</small><b aria-hidden="true">{expanded ? "−" : "+"}</b>
            </button>
            {expanded && <div className="admin-slide-items">{group.items.map((item) => {
              const Icon = item.icon as LucideIcon;
              return <div className="admin-secondary-item-wrap" key={item.id}>
                <button type="button" className={`admin-slide-item${section === item.target ? " is-active" : ""}`} tabIndex={open ? 0 : -1} aria-current={section === item.target ? "page" : undefined} onClick={() => navigate(item.target, item.focus)}>
                  <span className="admin-slide-item-icon"><Icon size={16} /></span><span className="admin-slide-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
                {item.children?.length ? <div className="admin-secondary-submenu">{item.children.map((child) =>
                  <button key={child.label} type="button" tabIndex={open ? 0 : -1} title={child.detail} onClick={() => navigate(item.target, item.focus)}>{child.label}</button>
                )}</div> : null}
              </div>;
            })}</div>}
          </section>;
        })}
        {!visibleGroups.length && <p className="quick-actions-empty" role="status">No matching admin sections.</p>}
      </nav>
      <div className="admin-slide-footer"><div className="admin-slide-footer-note">Use these sections to manage verification, communications, platform settings, integrations and governance.</div></div>
    </aside>
      </div>
      </>,
      document.body
    )}</>;
}