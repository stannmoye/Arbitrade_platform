import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const menuSource = readFileSync("client/src/components/CustomerSlideMenu.tsx", "utf8");
const selectorSource = readFileSync("client/src/components/ThemeSelector.tsx", "utf8");
const themeCss = readFileSync("client/src/theme-system.css", "utf8");
const customerCss = readFileSync("client/src/customer-reference.css", "utf8");
const customerThemeOverrides = readFileSync("client/src/customer-theme-overrides.css", "utf8");

describe("customer theme selector integration", () => {
  it("mounts the shared theme selector in the customer workspace", () => {
    expect(appSource).toContain('return <div className="arb-page separate-portal customer-portal"');
    expect(appSource).toContain("<ThemeSelector compact/>");
    expect(appSource).toContain('<ThemeSelector compact ariaLabel="Change customer theme"/>');
    expect(appSource).toContain('<div className="customer-primary-rail-theme-control"><ThemeSelector compact ariaLabel="Change customer theme"/></div>');
    expect(appSource).not.toContain("<ThemeSelector compact readOnly/>");
  });

  it("provides customer theme controls in the left rail and navigation drawer", () => {
    expect(menuSource).toContain('className="customer-theme-sidebar-control"');
    expect(menuSource).toContain('className="customer-slide-theme-control"');
    expect(menuSource).toContain('<ThemeSelector compact readOnly={!open} ariaLabel="Change theme from customer menu" />');
    expect(selectorSource).toContain('aria-label="Choose workspace theme"');
    expect(selectorSource).toContain("Palette");
  });

  it("uses theme tokens to recolor customer surfaces consistently", () => {
    expect(themeCss).toContain(".customer-theme-sidebar-control");
    expect(themeCss).toContain(".customer-slide-theme-control");
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .portal-main');
    expect(customerCss).toContain(':root[data-arb-theme] .customer-left-menu-portal-host .customer-primary-rail');
    expect(customerCss).toContain("var(--arb-color-surface)");
  });

  it("places the customer theme selector beside the profile in the top bar and preserves the left-rail selector", () => {
    const headerStart = appSource.indexOf("function PortalHeader");
    const customerAuthStart = appSource.indexOf("function CustomerAuth", headerStart);
    const header = appSource.slice(headerStart, customerAuthStart);
    expect(header).toContain('<ThemeSelector compact ariaLabel="Change customer theme"/>');
    expect(header.indexOf('<ThemeSelector compact ariaLabel="Change customer theme"/>')).toBeLessThan(header.indexOf('className="customer-header-bell"'));
    expect(appSource).toContain('<div className="customer-primary-rail-theme-control"><ThemeSelector compact ariaLabel="Change customer theme"/></div>');
    expect(customerThemeOverrides).toMatch(/\.portal-session\s*>\s*\.arb-theme-selector-compact/);
    expect(customerThemeOverrides).toContain("Customer workspace experience polish");
  });

  it("keeps customer layout and surfaces responsive and driven by the active theme tokens", () => {
    expect(customerThemeOverrides).toMatch(/max-width:\s*1320px/);
    expect(customerThemeOverrides).toContain("var(--arb-color-surface-raised)");
    expect(customerThemeOverrides).toMatch(/@media\s*\(max-width:\s*760px\)/);
    expect(customerThemeOverrides).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

});
