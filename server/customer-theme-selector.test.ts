import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const menuSource = readFileSync("client/src/components/CustomerSlideMenu.tsx", "utf8");
const selectorSource = readFileSync("client/src/components/ThemeSelector.tsx", "utf8");
const themeCss = readFileSync("client/src/theme-system.css", "utf8");
const customerCss = readFileSync("client/src/customer-reference.css", "utf8");
const customerThemeOverrides = readFileSync("client/src/customer-theme-overrides.css", "utf8");

describe("customer theme selector integration", () => {
  it("renders exactly one customer theme selector in the header beside the logo/profile row", () => {
    expect(appSource).toContain('return <div className="arb-page separate-portal customer-portal"');

    const headerStart = appSource.indexOf("function PortalHeader");
    const customerAuthStart = appSource.indexOf("function CustomerAuth", headerStart);
    const header = appSource.slice(headerStart, customerAuthStart);
    const selectorMarkup = '<ThemeSelector compact ariaLabel="Change customer theme"/>';
    expect(header.match(/<ThemeSelector compact ariaLabel="Change customer theme"\/>/g) || []).toHaveLength(1);
    expect(header.indexOf(selectorMarkup)).toBeLessThan(header.indexOf('className="customer-header-bell"'));
    expect(appSource.match(/<ThemeSelector compact ariaLabel="Change customer theme"\/>/g) || []).toHaveLength(1);

    const workspaceStart = appSource.indexOf("function CustomerWorkspace");
    const workspaceEnd = appSource.indexOf("function CustomerOpportunityAlert", workspaceStart);
    const workspace = appSource.slice(workspaceStart, workspaceEnd);
    expect(workspace).not.toContain("ThemeSelector");
    expect(workspace).not.toContain("customer-primary-rail-theme-control");
  });

  it("does not render theme selectors in floating menu controls or the navigation drawer", () => {
    expect(menuSource).not.toContain("ThemeSelector");
    expect(menuSource).not.toContain("customer-theme-sidebar-control");
    expect(menuSource).not.toContain("customer-slide-theme-control");
    expect(selectorSource).toContain('aria-label="Choose workspace theme"');
    expect(selectorSource).toContain("Palette");
  });

  it("removes obsolete duplicate-selector layout rules but preserves token-based customer styling", () => {
    expect(themeCss).not.toContain(".customer-theme-sidebar-control");
    expect(themeCss).not.toContain(".customer-slide-theme-control");
    expect(themeCss).not.toContain(".customer-portal > .arb-theme-selector-compact");
    expect(customerThemeOverrides).not.toContain("customer-primary-rail-theme-control");
    expect(customerThemeOverrides).not.toContain(".customer-portal>.arb-theme-selector-compact");
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .portal-main');
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .customer-primary-rail');
    expect(customerCss).toContain("var(--arb-color-surface)");
  });

  it("keeps the one header selector policy-aware, accessible, and styled by the active theme", () => {
    expect(selectorSource).toContain('ariaLabel ?? (compact ? "Change workspace theme" : "Appearance settings")');
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
