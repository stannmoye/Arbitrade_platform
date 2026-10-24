import { describe, expect, it } from "vitest";
import { createTextPdf } from "./api-access-pdf";

describe("account statement PDF generation", () => {
  it("creates a valid PDF envelope and escapes untrusted PDF text", () => {
    const pdf = createTextPdf(["Account statement", "Reference (A) \\ test"]);
    const text = pdf.toString("ascii");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(Reference \\(A\\) \\\\ test) Tj");
    expect(text).toContain("xref\n");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("creates additional pages for long reports", () => {
    const pdf = createTextPdf(Array.from({ length: 100 }, (_, index) => "Report line " + index));
    const text = pdf.toString("ascii");
    expect(text).toContain("/Count 3");
    expect(text).toContain("(Report line 99) Tj");
  });

  it("replaces unsupported glyphs instead of emitting arbitrary PDF syntax", () => {
    const text = createTextPdf(["Customer — statement"]).toString("ascii");
    expect(text).toContain("(Customer ? statement) Tj");
  });
});
