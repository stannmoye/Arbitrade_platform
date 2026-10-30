import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./trading-experience.css", import.meta.url), "utf8");
const portalStylesheet = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("Trade experience visual system", () => {
  it("loads the Trade stylesheet and scopes administrator styling to Trade destinations", () => {
    expect(appSource).toContain('import "./trading-experience.css"');
    expect(appSource).toContain("trade-admin-surface");
    expect(appSource).toContain('"transactionReview","audit"');
    expect(appSource).toContain("trade-nav-group");
    expect(stylesheet).toContain(".trade-admin-surface");
    expect(stylesheet).toContain(".admin-rail .trade-nav-group");
    expect(stylesheet).toContain("--package-card-accent");
    expect(stylesheet).toContain("--trading-tier-accent");
  });

  it("keeps expandable Trade navigation and content containers from clipping their children", () => {
    const navGroup = stylesheet.match(/\.admin-portal \.admin-rail \.trade-nav-group\s*\{([^}]*)\}/)?.[1] ?? "";
    const packageCard = stylesheet.match(/\.trade-admin-surface \.package-admin-card\s*\{([^}]*)\}/)?.[1] ?? "";
    const companyPanel = stylesheet.match(/\.customer-portal \.portal-main \.customer-opportunities-page \.company-reference-panel\s*\{([^}]*)\}/)?.[1] ?? "";
    const adminHeader = stylesheet.match(/\.trade-admin-surface \.portal-page-top,\s*\.trade-admin-surface \.admin-ops-head\s*\{([^}]*)\}/)?.[1] ?? "";
    const customerHeader = stylesheet.match(/\.customer-portal \.portal-main \.customer-opportunities-page \.portal-page-top\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(navGroup).toContain("overflow: visible");
    expect(navGroup).not.toMatch(/overflow:\s*hidden/i);
    expect(packageCard).not.toMatch(/overflow:\s*hidden/i);
    expect(companyPanel).not.toMatch(/overflow:\s*hidden/i);
    expect(adminHeader).not.toMatch(/overflow:\s*hidden/i);
    expect(customerHeader).not.toMatch(/overflow:\s*hidden/i);
  });

  it("gives every administrator menu a distinct parent accent and keeps expanded submenus fully sized", () => {
    expect(appSource).toContain("admin-nav-group--${group.id}");
    const menuIds = [
      "overview", "customers", "finance", "trade-setup", "trade-offers", "trade-results",
      "trade-monitoring", "trade-history", "verification-risk", "communications",
      "platform-configuration", "integrations", "governance-reports",
    ];
    for (const id of menuIds) {
      expect(portalStylesheet).toContain(`.admin-nav-group--${id}`);
    }
    expect(portalStylesheet).not.toContain(".admin-nav-group:nth-child(");
    expect(portalStylesheet).toContain("--nav-accent-text");
    expect(portalStylesheet).toContain("var(--arb-color-surface-raised");
    expect(portalStylesheet).toContain("--nav-accent");
    expect(portalStylesheet).toContain("display: block !important");
    expect(portalStylesheet).toContain("overflow: visible !important");
    expect(portalStylesheet).toContain("min-height: 0 !important");
    expect(portalStylesheet).toContain("overscroll-behavior: contain");
  });

  it("covers customer eligibility, opportunity history, and the persistent opportunity display", () => {
    expect(stylesheet).toContain(".trading-packages-panel");
    expect(stylesheet).toContain(".customer-opportunities-page");
    expect(stylesheet).toContain(".trading-opportunity-row");
    expect(stylesheet).toContain(".center-opportunity-toast");
    expect(stylesheet).toContain(".trade-progress-banner");
  });

  it("keeps interaction states accessible and honours reduced-motion preferences", () => {
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain(":disabled");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("@media (forced-colors: active)");
  });

  it("groups each main menu in a thick regional container with spaced, lightly outlined submenu containers", () => {
    expect(portalStylesheet).toContain("gap: 22px !important");
    expect(portalStylesheet).toContain("border-width: 3px !important");
    expect(portalStylesheet).toContain("border: 1px solid color-mix(in srgb,var(--nav-accent) 36%");
    expect(portalStylesheet).toContain("gap: 10px !important");
    expect(portalStylesheet).toContain("margin-top: 8px !important");
    expect(portalStylesheet).toContain(".admin-nav-item-wrap");
    expect(portalStylesheet).toContain(".admin-nav-group");
  });


  it("uses a restrained professional financial palette with a distinct accent for every menu", () => {
    const accents = [
      "#315B7D", "#80627A", "#8B6A3E", "#536A9A", "#39796F", "#9A5A5A",
      "#3F7188", "#6D668C", "#8A7848", "#557A65", "#765E68", "#477A82", "#696F78",
    ];
    expect(new Set(accents).size).toBe(13);
    for (const accent of accents) expect(portalStylesheet).toContain(`--nav-accent:${accent}`);
  });

});
