import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./trading-experience.css", import.meta.url), "utf8");

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

    expect(navGroup).toContain("overflow: visible");
    expect(navGroup).not.toMatch(/overflow:\s*hidden/i);
    expect(packageCard).not.toMatch(/overflow:\s*hidden/i);
    expect(companyPanel).not.toMatch(/overflow:\s*hidden/i);
    expect(stylesheet).not.toMatch(/\.trade-admin-surface \.portal-page-top,[\s\S]{0,180}?overflow:\s*hidden/i);
    expect(stylesheet).not.toMatch(/\.customer-portal \.portal-main \.customer-opportunities-page \.portal-page-top[\s\S]{0,180}?overflow:\s*hidden/i);
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
});
