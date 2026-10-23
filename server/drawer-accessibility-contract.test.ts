import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminDrawer = readFileSync(new URL("../client/src/components/AdminSlideMenu.tsx", import.meta.url), "utf8");
const customerDrawer = readFileSync(new URL("../client/src/components/CustomerSlideMenu.tsx", import.meta.url), "utf8");
const drawerStyles = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

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
});
