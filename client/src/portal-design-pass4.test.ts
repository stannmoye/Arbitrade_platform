import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./portal-design-pass4.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

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


describe("mobile navigation drawer visibility", () => {
  it("keeps customer and admin destination lists visible and independently scrollable on mobile", () => {
    expect(css).toContain('.admin-slide-layer.is-open .admin-slide-drawer .admin-slide-nav');
    expect(css).toContain('overflow-y: auto !important');
    expect(css).toContain('display: flex !important');
    expect(css).toContain('visibility: visible !important');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
