import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designSystem = readFileSync(new URL("../client/src/design-system.css", import.meta.url), "utf8");
const themes = readFileSync(new URL("../client/src/theme-system.css", import.meta.url), "utf8");

describe("ARBITRADE shared design-system contract", () => {
  it("defines the semantic tokens used by shared components", () => {
    for (const token of [
      "--arb-color-canvas",
      "--arb-color-surface",
      "--arb-color-surface-raised",
      "--arb-color-border",
      "--arb-color-text",
      "--arb-color-text-muted",
      "--arb-color-accent",
      "--arb-color-warning",
      "--arb-color-danger",
      "--arb-focus-ring",
    ]) {
      expect(designSystem, `missing design token ${token}`).toContain(token);
    }
  });

  it("keeps all five named themes mapped to semantic tokens", () => {
    for (const theme of [
      "original",
      "midnight-premium",
      "clean-light",
      "emerald-finance",
      "aurora-modern",
    ]) {
      expect(themes, `missing theme ${theme}`).toContain(`data-arb-theme="${theme}"`);
    }
    expect(themes).toContain("--arb-color-canvas");
    expect(themes).toContain("--arb-color-danger");
    expect(themes).toContain("--arb-focus-ring");
  });

  it("retains keyboard, high-contrast, reduced-motion and mobile support", () => {
    expect(designSystem).toContain(":focus-visible");
    expect(designSystem).toContain("@media (forced-colors: active)");
    expect(designSystem).toContain("@media (prefers-contrast: more)");
    expect(designSystem).toContain("@media (prefers-reduced-motion: reduce)");
    expect(designSystem).toContain("@media (max-width: 600px)");
  });

  it("provides shared feedback and narrow-screen data-table primitives", () => {
    for (const selector of [
      ".arb-field-error",
      ".arb-button-primary",
      ".arb-button-danger",
      ".arb-status-success",
      ".arb-status-warning",
      ".arb-status-danger",
      ".arb-overflow-x",
    ]) {
      expect(designSystem, `missing shared primitive ${selector}`).toContain(selector);
    }
  });

  it("defines semantic colour and focus tokens inside every theme block", () => {
    const themeSelectors = [
      ':root,\n:root[data-arb-theme="original"]',
      ':root[data-arb-theme="midnight-premium"]',
      ':root[data-arb-theme="clean-light"]',
      ':root[data-arb-theme="emerald-finance"]',
      ':root[data-arb-theme="aurora-modern"]',
    ];
    for (const selector of themeSelectors) {
      const start = themes.indexOf(selector);
      expect(start, `missing theme token block ${selector}`).toBeGreaterThanOrEqual(0);
      const block = themes.slice(start, start + 1000);
      expect(block).toContain("--arb-color-canvas");
      expect(block).toContain("--arb-color-text");
      expect(block).toContain("--arb-color-accent");
      expect(block).toContain("--arb-color-danger");
      expect(block).toContain("--arb-focus-ring");
    }
  });

  it("keeps mobile data tables scrollable instead of forcing page-wide overflow", () => {
    expect(designSystem).toContain(".arb-overflow-x");
    expect(designSystem).toContain("overflow-x: auto");
    expect(designSystem).toContain("overscroll-behavior-inline: contain");
    expect(designSystem).toContain("-webkit-overflow-scrolling: touch");
  });

  it("preserves accessible feedback for disabled and invalid form controls", () => {
    expect(designSystem).toContain('[aria-invalid="true"]');
    expect(designSystem).toContain(":disabled");
    expect(designSystem).toContain(".arb-field-error");
    expect(designSystem).toContain(".arb-status-warning");
    expect(designSystem).toContain(".arb-status-danger");
  });


  it("keeps new-theme text tokens at WCAG AA contrast against canvas and surfaces", () => {
    const themesToCheck = ["midnight-premium", "clean-light", "emerald-finance", "aurora-modern"];
    const readHexToken = (block: string, token: string) => {
      const match = block.match(new RegExp(`\\\\${token}:\\\\s*(#[0-9a-fA-F]{6})`));
      expect(match, `missing literal token ${token}`).not.toBeNull();
      return match![1];
    };
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
      const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (first: string, second: string) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };

    for (const theme of themesToCheck) {
      const match = themes.match(new RegExp(`:root\\\\[data-arb-theme="\\\\${theme}"\\\\]\\\\s*\\\\{([^}]+)\\\\}`));
      expect(match, `missing literal theme block ${theme}`).not.toBeNull();
      const block = match![1];
      const canvas = readHexToken(block, "--arb-color-canvas");
      const surface = readHexToken(block, "--arb-color-surface");
      for (const token of ["--arb-color-text", "--arb-color-text-soft", "--arb-color-text-muted"]) {
        const foreground = readHexToken(block, token);
        expect(contrast(foreground, canvas), `${theme} ${token} on canvas`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(foreground, surface), `${theme} ${token} on surface`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

});
