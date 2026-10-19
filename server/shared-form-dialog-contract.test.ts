import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialog = readFileSync(new URL("../client/src/components/ui/dialog.tsx", import.meta.url), "utf8");
const input = readFileSync(new URL("../client/src/components/ui/input.tsx", import.meta.url), "utf8");
const textarea = readFileSync(new URL("../client/src/components/ui/textarea.tsx", import.meta.url), "utf8");
const select = readFileSync(new URL("../client/src/components/ui/select.tsx", import.meta.url), "utf8");
const button = readFileSync(new URL("../client/src/components/ui/button.tsx", import.meta.url), "utf8");

describe("shared form and dialog interaction contracts", () => {
  it("prevents Escape from closing a dialog during active IME composition", () => {
    expect(dialog).toContain("const isCurrentlyComposing = (e as any).isComposing || isComposing();");
    expect(dialog).toContain("if (isCurrentlyComposing) {");
    expect(dialog).toContain("e.preventDefault();");
    expect(dialog).toContain("onEscapeKeyDown?.(e);");
  });

  it("provides an accessible close name for shared dialogs", () => {
    expect(dialog).toContain('data-slot="dialog-content"');
    expect(dialog).toContain('<span className="sr-only">Close</span>');
    expect(dialog).toContain("showCloseButton = true");
    expect(dialog).toContain("DialogPrimitive.Title");
    expect(dialog).toContain("DialogPrimitive.Description");
  });

  it.each([
    ["input", input],
    ["textarea", textarea],
  ])("%s does not submit on Enter while text composition is active or has just ended", (_name, source) => {
    expect(source).toContain("e.nativeEvent.isComposing || dialogComposition.justEndedComposing()");
    expect(source).toMatch(/if \(e\.key === "Enter" &&(?: !e\.shiftKey &&)? isComposing\)/);
    expect(source).toContain("return;");
    expect(source).toContain("onKeyDown?.(e)");
  });

  it("keeps select trigger keyboard focus and disabled state styling", () => {
    expect(select).toContain("focus-visible:ring-[3px]");
    expect(select).toContain("disabled:cursor-not-allowed");
    expect(select).toContain("disabled:opacity-50");
    expect(select).toContain("<SelectPrimitive.Trigger");
    expect(select).toContain("{...props}");
  });

  it.each([
    ["input", input, 'data-slot="input"'],
    ["textarea", textarea, 'data-slot="textarea"'],
  ])("%s preserves keyboard focus, invalid, and disabled affordances", (_name, source, slot) => {
    expect(source).toContain(slot);
    expect(source).toContain("focus-visible:ring-[3px]");
    expect(source).toContain("aria-invalid:border-destructive");
    expect(source).toContain("disabled:opacity-50");
    expect(source).toContain("disabled:cursor-not-allowed");
  });

  it("preserves Shift+Enter for textarea newlines during IME composition", () => {
    expect(textarea).toContain("// Note: For textarea, Shift+Enter should still work for newlines");
    expect(textarea).toContain('if (e.key === "Enter" && !e.shiftKey && isComposing)');
  });

  it("keeps shared button disabled state explicit and visibly distinguishable", () => {
    expect(button).toContain("disabled:pointer-events-none");
    expect(button).toContain("disabled:opacity-50");
    expect(button).toContain("focus-visible:ring-[3px]");
    expect(button).toContain("aria-invalid:ring-destructive/20");
  });
});
