import { describe, expect, it } from "vitest";
import type { PrivacyPolicyDocument } from "../../../shared/privacy";
import { createPrivacyNoticePdf } from "./privacyNoticePdf";

const policy: PrivacyPolicyDocument = {
  id: 7,
  versionLabel: "2.1",
  title: "Customer Privacy Notice",
  summary: "How account information is handled.",
  controllerName: "Arbitrade Platform",
  controllerAddress: "12 Market Street",
  privacyContact: "privacy@example.test",
  applicableJurisdiction: "Nigeria",
  sections: [{ id: "records", title: "Financial records", body: "Account and financial activity records are maintained for accountability." }],
  status: "published",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  publishedAt: "2026-10-02T00:00:00.000Z",
};

describe("createPrivacyNoticePdf", () => {
  it("creates a valid PDF document with publication metadata and page references", () => {
    const pdf = createPrivacyNoticePdf(policy);
    const source = new TextDecoder().decode(pdf);
    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toContain("/Type /Catalog");
    expect(source).toContain("/Type /Page");
    expect(source).toContain("startxref");
    expect(source).toContain("%%EOF");
    expect(source).toContain("/Count 1");
    expect(source).toContain("Author (Arbitrade Platform)");
  });

  it("splits long notices across pages and keeps PDF page numbering", () => {
    const longPolicy = {
      ...policy,
      sections: [{ id: "long", title: "Long section", body: Array.from({ length: 140 }, () => "Privacy information and financial account records.").join(" ") }],
    };
    const source = new TextDecoder().decode(createPrivacyNoticePdf(longPolicy));
    expect(source).toMatch(/\/Count [2-9]\d*/);
    expect(source).toContain("506167652031206F66");
  });

  it("includes text from the published HTML notice in the downloadable PDF", () => {
    const htmlPolicy = {
      ...policy,
      htmlContent: '<style>.hidden{display:none}</style><section><h1>Custom notice heading</h1><p>Styled financial privacy content.</p><script>secretScript()</script></section>',
    };
    const source = new TextDecoder().decode(createPrivacyNoticePdf(htmlPolicy));
    const pdfTextHex = (value: string) => Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    expect(source).toContain(pdfTextHex("Custom notice heading"));
    expect(source).toContain(pdfTextHex("Styled financial privacy content."));
    expect(source).not.toContain("secretScript");
  });

  it("safely encodes common punctuation and avoids raw PDF delimiters in text strings", () => {
    const punctuatedPolicy = { ...policy, title: "Privacy — Customer’s Information (2026)" };
    const source = new TextDecoder().decode(createPrivacyNoticePdf(punctuatedPolicy));
    expect(source).toContain("PDF-1.4");
    expect(source).toContain("/Title (Privacy ? Customer?s Information \\(2026\\))");
  });
});
