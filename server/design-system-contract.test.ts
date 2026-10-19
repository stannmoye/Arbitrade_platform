import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designSystem = readFileSync(new URL("../client/src/design-system.css", import.meta.url), "utf8");
const themes = readFileSync(new URL("../client/src/theme-system.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const adminAppearance = readFileSync(new URL("../client/src/components/AdminAppearance.tsx", import.meta.url), "utf8");
const themeSelector = readFileSync(new URL("../client/src/components/ThemeSelector.tsx", import.meta.url), "utf8");
const themeContext = readFileSync(new URL("../client/src/contexts/ThemeContext.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../client/src/components/ui/table.tsx", import.meta.url), "utf8");
const componentShowcase = readFileSync(new URL("../client/src/pages/ComponentShowcase.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

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


  const themeNames = ["original", "midnight-premium", "clean-light", "emerald-finance", "aurora-modern"];
  const themeBlock = (theme: string) => {
    const selector = theme === "original"
      ? /:root,\s*:root\[data-arb-theme="original"\]\s*\{([^}]+)\}/
      : new RegExp(`:root\\[data-arb-theme="${theme}"\\]\\s*\\{([^}]+)\\}`);
    const match = themes.match(selector);
    expect(match, `missing theme token block ${theme}`).not.toBeNull();
    return match![1];
  };

  const resolveHexToken = (block: string, token: string, visited = new Set<string>()): string => {
    expect(visited.has(token), `cyclic token reference for ${token}`).toBe(false);
    visited.add(token);
    const declaration = block.match(new RegExp(`${token}:\\s*([^;]+);`));
    expect(declaration, `missing theme token ${token}`).not.toBeNull();
    const value = declaration![1];
    const hexValues = [...value.matchAll(/#[0-9a-fA-F]{6}/g)].map(match => match[0]);
    if (hexValues.length) return hexValues[hexValues.length - 1];
    const reference = value.match(/var\((--arb-[a-z-]+)/);
    expect(reference, `could not resolve literal colour for ${token}`).not.toBeNull();
    return resolveHexToken(block, reference![1], visited);
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

  it("keeps text tokens at WCAG AA contrast against canvas and surfaces in all five themes", () => {
    for (const theme of themeNames) {
      const block = themeBlock(theme);
      const canvas = resolveHexToken(block, "--arb-color-canvas");
      const surface = resolveHexToken(block, "--arb-color-surface");
      for (const token of ["--arb-color-text", "--arb-color-text-soft", "--arb-color-text-muted"]) {
        const foreground = resolveHexToken(block, token);
        expect(contrast(foreground, canvas), `${theme} ${token} on canvas`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(foreground, surface), `${theme} ${token} on surface`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps focus indicators at a minimum 3:1 contrast against canvas and surfaces in all five themes", () => {
    for (const theme of themeNames) {
      const block = themeBlock(theme);
      const focus = resolveHexToken(block, "--arb-focus-ring");
      expect(contrast(focus, resolveHexToken(block, "--arb-color-canvas")), `${theme} focus ring on canvas`).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, resolveHexToken(block, "--arb-color-surface")), `${theme} focus ring on surface`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the shared page foundation on active customer and administrator portal roots", () => {
    expect(app).toContain('className="arb-page separate-portal customer-portal"');
    expect(app).toContain('className={`arb-page separate-portal admin-portal');
    expect(adminAppearance).toContain('className="portal-page arb-page arb-stack arb-appearance-admin"');
  });

  it("keeps theme selection accessible and touch-friendly on small screens", () => {
    expect(themeSelector).toContain('aria-label="Appearance settings"');
    expect(themeSelector).toContain('aria-busy={!policyReady}');
    expect(themeSelector).toContain('role={policyFailed ? "alert" : "status"}');
    expect(themeSelector).toContain('aria-describedby=');
    expect(themes).toMatch(/\.arb-theme-preview-option[\s\S]*?min-height:\s*44px;/);
    expect(themes).toMatch(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.arb-theme-selector select\s*\{[^}]*min-height:\s*44px;/);
  });

  it("keeps shared buttons and form controls at touch-friendly sizes on mobile", () => {
    expect(designSystem).toContain("@media (max-width: 640px)");
    expect(designSystem).toContain('[data-slot="select-trigger"]');
    expect(designSystem).toContain('[data-slot="input"]');
    expect(designSystem).toContain('[data-slot="textarea"]');
    expect(designSystem).toContain("min-height: 44px");
    expect(designSystem).toContain('[data-slot="button"].size-9');
    expect(designSystem).toContain("min-width: 44px");
  });

  it("gives keyboard-scrollable data tables an accessible region name", () => {
    expect(table).toContain('data-slot="table-container"');
    expect(table).toContain('role="region"');
    expect(table).toContain('containerAriaLabel = "Scrollable table"');
    expect(table).toContain('import { resolveTableContainerLabel } from "./table-label"');
    expect(table).toContain("resolveTableContainerLabel(containerAriaLabel)");
    expect(table).toContain("aria-label={resolvedContainerAriaLabel}");
    expect(table).toContain("tabIndex={0}");
    expect(table).toContain("overflow-x-auto");
    expect(componentShowcase).toContain('containerAriaLabel="Recent invoice examples"');
  });


  it("keeps administrator previews persistent while enforcing customer theme policy", () => {
    expect(themeContext).toContain('const THEME_STORAGE_KEY = "arbitrade-theme"');
    expect(themeContext).toContain("setThemeState(readStoredTheme(defaultTheme))");
    expect(themeContext).toContain("if (isAdmin) {\n      setThemeState(nextTheme);\n      return;\n    }");
    expect(themeContext).toContain("if (!policy || appearance.isError) return;");
    expect(themeContext).toContain("if (customerCanSelect && enabledThemes.includes(nextTheme)) setThemeState(nextTheme)");
    expect(themeContext).toContain("const nextTheme = customerCanSelect && isTheme(event.newValue) && enabledThemes.includes(event.newValue)");
    expect(themeContext).toContain("window.localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme)");
  });

  it("keeps administrator appearance edits valid and protects the last enabled theme", () => {
    expect(adminAppearance).toContain("toggleEnabledTheme(enabledThemes, candidate)");
    expect(adminAppearance).toContain("normalizeEnabledThemes(appearance.enabledThemes, requestedDefault)");
    expect(adminAppearance).toContain("disabled={controlsDisabled || (enabledThemes.length === 1 && enabledThemes.includes(option))}");
    expect(adminAppearance).toContain("if (!next.includes(defaultTheme)) setDefaultTheme(next[0]);");
    expect(adminAppearance).toContain('disabled={save.isPending || settings.isLoading || settings.isError || !enabledThemes.length}');
    expect(adminAppearance).toContain('role="alert"');
    expect(adminAppearance).toContain('role={save.isError ? "alert" : "status"}');
  });

  it("keeps dialog content scrollable and action rows adaptable at short/mobile viewports", () => {
    expect(designSystem).toContain('[data-slot="dialog-content"]');
    expect(designSystem).toContain('max-height: calc(100dvh - 2rem)');
    expect(designSystem).toContain('overflow-y: auto');
    expect(designSystem).toContain('[data-slot="dialog-footer"]');
    expect(designSystem).toContain('flex-wrap: wrap');
  });


  it("keeps semantic status and link colours readable on theme surfaces", () => {
    for (const theme of themeNames) {
      const block = themeBlock(theme);
      const surface = resolveHexToken(block, "--arb-color-surface");
      for (const token of ["--arb-color-accent", "--arb-color-warning", "--arb-color-danger", "--arb-color-info"]) {
        const foreground = resolveHexToken(block, token);
        expect(contrast(foreground, surface), `${theme} ${token} on surface`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });


  it("keeps server-side appearance policy validation constrained to known themes", () => {
    expect(routers).toContain(
      'enabledThemes: z.array(z.enum(["original","midnight-premium","clean-light","emerald-finance","aurora-modern"])).min(1).max(5)',
    );
    expect(routers).toContain(
      'if (!input.appearance.enabledThemes.includes(input.appearance.defaultTheme)) throw new TRPCError({ code: "BAD_REQUEST", message: "The default theme must be enabled." });',
    );
  });


  it("keeps adopted pages and nested data content within responsive viewport bounds", () => {
    expect(designSystem).toContain(".arb-page {");
    expect(designSystem).toContain("box-sizing: border-box;");
    expect(designSystem).toContain("min-width: 0;");
    expect(designSystem).toContain("max-width: 100%;");
    expect(designSystem).toContain("overflow-wrap: anywhere;");
    expect(designSystem).toContain(".arb-page :where(img, video, iframe, canvas, svg)");
    expect(designSystem).toContain(".arb-page :where(input, select, textarea)");
    expect(designSystem).toContain(".arb-page :where(pre, code)");
    expect(designSystem).toContain("@media (max-width: 640px)");
    expect(designSystem).toContain("-webkit-overflow-scrolling: touch;");
  });


  it("keeps responsive media bounded without overriding explicit embed or canvas heights", () => {
    expect(designSystem).toContain(".arb-page :where(img, video, iframe, canvas, svg) {");
    expect(designSystem).toContain("max-width: 100%;");
    expect(designSystem).toContain(".arb-page :where(img, video) {\n  height: auto;\n}");
    expect(designSystem).not.toContain(".arb-page :where(img, video, iframe, canvas) {\n  height: auto;\n}");
  });

  it("defines every semantic status colour for every supported theme", () => {
    for (const theme of themeNames) {
      const block = themeBlock(theme);
      for (const token of [
        "--arb-color-accent",
        "--arb-color-info",
        "--arb-color-warning",
        "--arb-color-danger",
        "--arb-color-decorative",
      ]) {
        expect(block, `${theme} missing semantic status token ${token}`).toMatch(
          new RegExp(`${token}:\\s*[^;]+;`)
        );
      }
    }
  });

  it("keeps semantic status colours readable against canvas and surfaces in every theme", () => {
    const statusTokens = [
      "--arb-color-accent",
      "--arb-color-info",
      "--arb-color-warning",
      "--arb-color-danger",
      "--arb-color-decorative",
    ];
    for (const theme of themeNames) {
      const block = themeBlock(theme);
      const backgrounds = [
        ["canvas", resolveHexToken(block, "--arb-color-canvas")],
        ["surface", resolveHexToken(block, "--arb-color-surface")],
      ] as const;
      for (const token of statusTokens) {
        const foreground = resolveHexToken(block, token);
        for (const [backgroundName, background] of backgrounds) {
          expect(
            contrast(foreground, background),
            `${theme} ${token} against ${backgroundName}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });


  it("uses the shared canonical theme normalizer in the customer provider", () => {
    expect(themeContext).toContain("normalizeEnabledThemes(value, fallback)");
    expect(themeContext).toContain("readEnabledThemes(policy?.enabledThemes, requestedPolicyDefault)");
    expect(themeContext).not.toContain("Array.from(new Set(value.filter(isTheme)))");
  });

});
