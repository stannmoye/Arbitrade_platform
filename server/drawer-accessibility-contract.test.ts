import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminDrawer = readFileSync(new URL("../client/src/components/AdminSlideMenu.tsx", import.meta.url), "utf8");
const customerDrawer = readFileSync(new URL("../client/src/components/CustomerSlideMenu.tsx", import.meta.url), "utf8");
const drawerStyles = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
const recoveryStyles = readFileSync(new URL("../client/src/portal-render-recovery.css", import.meta.url), "utf8");

describe("navigation drawer keyboard accessibility contracts", () => {
  it("announces empty customer navigation search results politely", () => {
    expect(customerDrawer).toContain('className="customer-resource-empty" role="status" aria-live="polite"');
    expect(customerDrawer).toContain("No pages or resources match");
  });

  it("removes the customer search field from the tab order while the drawer is closed", () => {
    expect(customerDrawer).toContain('aria-label="Search customer pages and resources" tabIndex={open ? 0 : -1}');
    expect(customerDrawer).toContain('aria-hidden={!open} role="dialog" aria-modal={open}');
  });

  it.each([
    ["administrator", adminDrawer],
    ["customer", customerDrawer],
  ])("%s drawer traps focus across interactive control types", (_name, source) => {
    expect(source).toContain('a[href]:not([tabindex="-1"]):not([aria-disabled="true"])');
    expect(source).toContain('button:not([tabindex="-1"]):not([disabled])');
    expect(source).toContain('input:not([tabindex="-1"]):not([disabled])');
    expect(source).toContain('select:not([tabindex="-1"]):not([disabled])');
    expect(source).toContain('textarea:not([tabindex="-1"]):not([disabled])');
    expect(source).toContain('[tabindex]:not([tabindex="-1"]):not([disabled])');
    expect(source).toContain('[contenteditable="true"]');
  });

  it.each([
    ["administrator", adminDrawer],
    ["customer", customerDrawer],
  ])("%s drawer restores focus to its trigger after close", (_name, source) => {
    expect(source).toContain("const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); }");
    expect(source).toContain('aria-expanded={open}');
  });

  it("keeps navigation scrollable inside Android's dynamic viewport", () => {
    expect(drawerStyles).toContain("max-height:calc(100dvh - 12px)!important");
    expect(drawerStyles).toContain("overflow-y:auto!important");
    expect(drawerStyles).toContain("-webkit-overflow-scrolling:touch");
    expect(drawerStyles).toContain("touch-action:pan-y");
    expect(drawerStyles).toContain("overscroll-behavior-y:contain");
  });

  it("paints the open mobile account rail above its scrim", () => {
    expect(recoveryStyles).toMatch(/\.customer-portal \.portal-body\.customer-primary-menu-open \.customer-primary-rail\s*\{[^}]*z-index:\s*82\s*!important;/s);
    expect(recoveryStyles).toMatch(/\.customer-portal \.customer-primary-menu-scrim\s*\{[^}]*z-index:\s*81\s*!important;/s);
  });

  it("disables Android-problematic clipping and filtering on the open account rail", () => {
    const openRailRule = recoveryStyles.match(/\.customer-portal \.portal-body\.customer-primary-menu-open \.customer-primary-rail\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(openRailRule).toMatch(/clip-path:\s*none\s*!important;/);
    expect(openRailRule).toMatch(/-webkit-clip-path:\s*none\s*!important;/);
    expect(openRailRule).toMatch(/filter:\s*none\s*!important;/);
    expect(openRailRule).toMatch(/-webkit-filter:\s*none\s*!important;/);
  });

  it("keeps the portaled customer drawer in a layer above page overlays", () => {
    expect(drawerStyles).toMatch(/\.admin-slide-portal-layer\s*\{[^}]*z-index:\s*2147483000!important;[^}]*isolation:\s*isolate!important;/s);
    expect(drawerStyles).toMatch(/\.admin-slide-portal-layer \.admin-slide-drawer\s*\{\s*z-index:\s*2!important;\s*\}/);
  });

  it("hides the redundant left Settings handle when the desktop rail is present", () => {
    expect(recoveryStyles).toMatch(/@media\s*\(min-width:\s*901px\)\s*\{\s*\.customer-portal \.customer-settings-trigger\s*\{\s*display:\s*none\s*!important;/s);
  });
});
