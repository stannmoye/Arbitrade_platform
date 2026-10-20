import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const menuSource = readFileSync("client/src/components/CustomerSlideMenu.tsx", "utf8");
const selectorSource = readFileSync("client/src/components/ThemeSelector.tsx", "utf8");
const themeCss = readFileSync("client/src/theme-system.css", "utf8");
const customerCss = readFileSync("client/src/customer-reference.css", "utf8");

describe("customer theme selector integration", () => {
  it("mounts the shared theme selector in the customer workspace", () => {
    expect(appSource).toContain('return <div className="arb-page separate-portal customer-portal"');
    expect(appSource).toContain("<ThemeSelector compact/>");
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
    expect(customerCss).toContain(':root[data-arb-theme] .customer-portal .customer-primary-rail');
    expect(customerCss).toContain("var(--arb-color-surface)");
  });
});
