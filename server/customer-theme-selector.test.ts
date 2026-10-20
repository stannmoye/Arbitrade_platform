import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const headerSource = appSource.slice(appSource.indexOf("function PortalHeader"), appSource.indexOf("function CustomerAuth"));
const menuSource = readFileSync("client/src/components/CustomerSlideMenu.tsx", "utf8");
const selectorSource = readFileSync("client/src/components/ThemeSelector.tsx", "utf8");
const themeCss = readFileSync("client/src/theme-system.css", "utf8");
const customerCss = readFileSync("client/src/customer-reference.css", "utf8");

describe("customer theme selector integration", () => {
  it("mounts the shared theme selector in the customer workspace", () => {
    expect(appSource).toContain('return <div className="arb-page separate-portal customer-portal"');
    expect(appSource).toContain("<ThemeSelector compact/>");
    expect(headerSource).toContain('<ThemeSelector compact ariaLabel="Change customer theme"/>');
    expect(headerSource.indexOf('<ThemeSelector compact ariaLabel="Change customer theme"/>')).toBeLessThan(headerSource.indexOf('className="customer-header-profile"'));
    expect(appSource).not.toContain('<ThemeSelector compact ariaLabel="Change customer theme"/><div className="customer-top-wallet-band">');
    expect(appSource).toContain('<ThemeSelector compact ariaLabel="Change customer theme"/>');
    expect(appSource).toContain('<div className="customer-primary-rail-theme-control"><ThemeSelector compact ariaLabel="Change customer theme"/></div>');
    expect(appSource).not.toContain("<ThemeSelector compact readOnly/>");
  });

  it("provides customer theme controls in the left rail and navigation drawer", () => {
    expect(menuSource).toContain('className="customer-slide-theme-control"');
    expect(menuSource).toContain('<ThemeSelector compact readOnly={!open} ariaLabel="Change theme from customer menu" />');
    expect(selectorSource).toContain('aria-label="Choose workspace theme"');
    expect(selectorSource).toContain("Palette");
  });

  it("uses theme tokens to recolor customer surfaces consistently", () => {
    expect(themeCss).toContain(".customer-primary-rail-theme-control");
    expect(themeCss).toContain(".customer-portal .portal-header .arb-theme-selector-compact");
    expect(themeCss).toContain("Stage 3.2: customer workspace visual polish and full theme-token adoption");
    expect(themeCss).toContain(".customer-slide-theme-control");
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .portal-main');
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .customer-primary-rail');
    expect(customerCss).toContain("var(--arb-color-surface)");
  });
});
