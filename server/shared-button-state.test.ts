import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "../client/src/components/ui/button";

describe("shared Button rendered state semantics", () => {
  it("marks a busy button as loading and prevents another activation", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { "aria-busy": true }, "Saving settings"),
    );

    expect(markup).toContain('data-wb-state="loading"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Saving settings");
  });

  it("keeps an idle button enabled and exposes the idle state", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, null, "Save settings"),
    );

    expect(markup).toContain('data-wb-state="idle"');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("Save settings");
  });

  it("keeps explicitly disabled buttons disabled without falsely reporting a busy state", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { disabled: true }, "Unavailable"),
    );

    expect(markup).toContain('data-wb-state="idle"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('aria-busy="true"');
  });
});
