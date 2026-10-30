import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./trade-visual-system.css", import.meta.url), "utf8");

describe("Trading visual refresh", () => {
  it("loads a dedicated visual layer without changing the Trading workflows", () => {
    expect(app).toContain('import "./trade-visual-system.css"');
    expect(app).toContain('section==="opportunities"?" trade-customer-workspace":""');
    expect(app).toContain('" trade-workspace"');
  });

  it("scopes the full admin Trading submenu tree and its page surfaces", () => {
    expect(app).toContain('group.id.startsWith("trade-")?" trade-nav-group":""');
    for (const selector of [
      ".trade-workspace",
      ".admin-rail .trade-nav-group",
      ".trade-workspace .package-admin-card",
      ".trade-workspace .admin-ops-panel",
      ".trade-workspace .admin-ops-table-wrap",
    ]) expect(styles).toContain(selector);
  });

  it("styles customer eligibility, opportunity cards and the live opportunity panel", () => {
    for (const selector of [
      ".customer-portal .trading-packages-panel",
      ".customer-portal .trading-tier-card-current",
      ".customer-portal .trading-tier-card-next",
      ".customer-portal .trading-total-allowance",
      ".customer-portal .customer-opportunity",
      ".customer-portal .center-opportunity-toast",
    ]) expect(styles).toContain(selector);
  });

  it("keeps the design responsive, theme-aware and accessible", () => {
    expect(styles).toContain("var(--arb-color-surface)");
    expect(styles).toContain("var(--arb-color-accent)");
    expect(styles).toContain("@media (max-width: 760px)");
    expect(styles).toContain("@media (max-width: 460px)");
    expect(styles).toContain("prefers-reduced-motion");
    expect(styles).toContain(":focus-visible");
  });
});
