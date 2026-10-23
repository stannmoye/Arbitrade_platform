import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./portal-design-pass4.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const customerReferenceCss = readFileSync(new URL("./customer-reference.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("./theme-system.css", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const adminSlideMenu = readFileSync(new URL("./components/AdminSlideMenu.tsx", import.meta.url), "utf8");
const customerSlideMenu = readFileSync(new URL("./components/CustomerSlideMenu.tsx", import.meta.url), "utf8");
const adminDrawerRule = layoutCss.match(/\.admin-slide-drawer\{([^}]*)\}/)?.[1] ?? "";
const customerDrawerRule = layoutCss.match(/\.customer-slide-drawer\{([^}]*)\}/)?.[1] ?? "";

describe("portal design pass 4 theme bridge", () => {
  it("loads the final cross-portal styling layer after semantic theme tokens", () => {
    expect(entry.indexOf('import "./theme-system.css"')).toBeLessThan(entry.indexOf('import "./portal-design-pass4.css"'));
  });
  it("uses semantic theme tokens for nested panels and metrics", () => {
    expect(css).toContain("var(--arb-color-surface)");
    expect(css).toContain(".customer-metric-grid");
    expect(css).toContain(".admin-kpi-grid");
    expect(css).toContain(".customer-ledger-panel");
  });
  it("covers the admin KYC command center, form controls, and dialogs", () => {
    expect(css).toContain(".kyc-admin-page");
    expect(css).toContain("[role=dialog]");
    expect(css).toContain("focus-visible");
  });
  it("includes responsive layouts and reduced-motion support", () => {
    expect(css).toContain("@media(max-width:600px)");
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("navigation drawer grid layout", () => {
  it("reserves the flexible grid row for admin destinations instead of the search field", () => {
    expect(adminDrawerRule).toContain("grid-template-rows:auto auto auto auto minmax(0,1fr) auto;");
    expect(adminSlideMenu.indexOf('className="quick-actions-search"')).toBeLessThan(
      adminSlideMenu.indexOf('<nav className="admin-slide-nav quick-actions-nav"')
    );
    expect(adminSlideMenu.indexOf('<nav className="admin-slide-nav quick-actions-nav"')).toBeLessThan(
      adminSlideMenu.indexOf('<div className="admin-slide-footer"')
    );
  });

  it("allocates separate theme and search rows before the customer destination list", () => {
    expect(customerDrawerRule).toContain("grid-template-rows:auto auto auto auto auto minmax(0,1fr) auto");
    expect(customerSlideMenu.indexOf('className="customer-slide-theme-control"')).toBeLessThan(
      customerSlideMenu.indexOf('className="quick-actions-search"')
    );
    expect(customerSlideMenu.indexOf('className="quick-actions-search"')).toBeLessThan(
      customerSlideMenu.indexOf('<nav className="admin-slide-nav quick-actions-nav customer-resource-nav"')
    );
    expect(customerSlideMenu.indexOf('<nav className="admin-slide-nav quick-actions-nav customer-resource-nav"')).toBeLessThan(
      customerSlideMenu.indexOf('<div className="admin-slide-footer"')
    );
  });
});

describe("mobile drawer compositing recovery", () => {
  it("avoids transformed drawer layers on touch and narrow viewports", () => {
    expect(layoutCss).toContain("@media (max-width:900px), (pointer:coarse)");
    expect(layoutCss).toContain("transform:none!important");
    expect(layoutCss).toContain("visibility:hidden");
    expect(layoutCss).toContain(".admin-slide-layer.is-open .admin-slide-drawer");
    expect(layoutCss).toContain("visibility:visible!important");
    expect(layoutCss).toContain("opacity:1!important");
  });

  it("keeps drawer content in an explicit paint layer above the panel background", () => {
    expect(layoutCss).toContain(".admin-slide-drawer > *");
    expect(layoutCss).toContain("z-index:1");
    expect(adminSlideMenu).toContain('aria-hidden={!open}');
    expect(customerSlideMenu).toContain('aria-hidden={!open}');
  });
});


describe("body-level navigation drawer portals", () => {
  it("renders both navigation drawers outside page-level clipping and stacking contexts", () => {
    expect(adminSlideMenu).toContain('createPortal(');
    expect(customerSlideMenu).toContain('createPortal(');
    expect(adminSlideMenu).toContain('document.body');
    expect(customerSlideMenu).toContain('document.body');
    expect(adminSlideMenu).toContain('admin-slide-portal-layer');
    expect(customerSlideMenu).toContain('customer-slide-portal');
    expect(layoutCss).toContain('.admin-slide-portal-layer');
    expect(layoutCss).toContain('z-index:2147483000!important');
  });

  it("preserves customer theme tokens inside the portaled drawer", () => {
    expect(layoutCss).toContain(':root[data-arb-theme] .customer-slide-portal .admin-slide-drawer');
    expect(layoutCss).toContain(':root[data-arb-theme] .customer-slide-portal .admin-slide-item');
    expect(layoutCss).toContain('var(--arb-color-surface-raised)');
  });
});


describe("customer left Settings navigation layout recovery", () => {
  it("keeps the customer Settings rail and scrim inside the customer portal shell", () => {
    expect(appSource).not.toContain('id="customer-left-menu-portal-host"');
    expect(appSource).toContain('className="portal-rail customer-primary-rail"');
    expect(appSource).toContain('className="customer-primary-menu-scrim"');
    expect(appSource).toContain('className={`portal-body ${mobilePrimaryMenuOpen?"customer-primary-menu-open":""}`}');
    expect(appSource).toContain('<main key={section} className="portal-main">');
  });

  it("uses the existing responsive customer rail rules instead of a viewport-sized body portal", () => {
    expect(customerReferenceCss).toContain('.customer-portal .portal-body .customer-primary-rail');
    expect(customerReferenceCss).toContain('.customer-portal .portal-body.customer-primary-menu-open .customer-primary-rail');
    expect(customerReferenceCss).not.toContain('.customer-left-menu-portal-host {');
    expect(themeCss).toContain(':root[data-arb-theme] .customer-portal .customer-primary-rail');
    expect(themeCss).toContain('var(--arb-color-surface)');
  });
});

describe("customer menu responsive visibility", () => {
  it("hides floating customer menu triggers on desktop where the navigation rail is already visible", () => {
    expect(layoutCss).toContain(".customer-portal .customer-settings-trigger");
    expect(layoutCss).toContain(".customer-slide-layer .customer-resource-peek-trigger");
    expect(layoutCss).toContain("display:none!important");
    expect(layoutCss).toContain("@media (min-width:1101px) and (hover:hover) and (pointer:fine)");
  });

  it("keeps the mobile customer drawer and its contents visible and scrollable when opened", () => {
    expect(layoutCss).toContain(".customer-slide-portal.is-open .admin-slide-drawer");
    expect(layoutCss).toContain(".customer-slide-portal.is-open .admin-slide-drawer > *");
    expect(layoutCss).toContain("visibility:visible!important");
    expect(layoutCss).toContain("overflow-y:auto!important");
    expect(customerSlideMenu).toContain('createPortal(');
    expect(customerSlideMenu).toContain("customer-slide-portal");
  });
});
