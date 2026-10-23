import { describe, expect, it } from "vitest";
import { buildPrivacyHtmlDocument } from "./privacyHtml";

describe("buildPrivacyHtmlDocument", () => {
  it("preserves inline styles and wraps HTML fragments as complete documents", () => {
    const document = buildPrivacyHtmlDocument('<style>.panel{background:#123;color:#fff}</style><section class="panel" onclick="alert(1)"><h1>Privacy</h1></section><script>alert(1)</script>');
    expect(document).toContain(".panel{background:#123;color:#fff}");
    expect(document).toContain('<section class="panel">');
    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain("default-src 'none'");
    expect(document).not.toContain("<script>alert(1)</script>");
  });

  it("injects the restrictive policy into a complete HTML document", () => {
    const document = buildPrivacyHtmlDocument("<!doctype html><html><head><title>Notice</title></head><body><h1>Notice</h1></body></html>");
    expect(document).toContain("<head>" + '<meta http-equiv="Content-Security-Policy"');
    expect(document).toContain("<h1>Notice</h1>");
  });
});
