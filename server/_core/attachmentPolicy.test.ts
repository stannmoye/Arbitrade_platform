import { describe, expect, it } from "vitest";
import { isAllowedAttachmentRequest, isValidSupportAttachmentStorageKey } from "./attachmentPolicy";

const policy = {
  maxAttachmentMb: 5,
  allowedMimeTypes: ["image/*", ".pdf", "text/plain"],
};

describe("support attachment request validation", () => {
  it("accepts allowed MIME types and extension rules", () => {
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(true);
    expect(isAllowedAttachmentRequest(
      { fileName: "photo.png", mimeType: "image/png", sizeBytes: 1000 },
      policy,
    )).toBe(true);
    expect(isAllowedAttachmentRequest(
      { fileName: "notes.txt", mimeType: "text/plain", sizeBytes: 1000 },
      policy,
    )).toBe(true);
  });

  it("rejects missing or malformed fields without throwing", () => {
    expect(isAllowedAttachmentRequest(
      { fileName: undefined, mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: undefined, sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: "1000" },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "", mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: " ", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: "image/", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: "image/png; charset=utf-8", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report\n.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(false);
  });

  it("rejects known file extensions whose declared MIME type disagrees", () => {
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf", mimeType: "image/png", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "photo.png", mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.PDF", mimeType: "application/pdf", sizeBytes: 1000 },
      policy,
    )).toBe(true);
    // Trailing dots/spaces must not bypass known-extension MIME consistency.
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf.", mimeType: "image/png", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    expect(isAllowedAttachmentRequest(
      { fileName: "report.pdf ", mimeType: "image/png", sizeBytes: 1000 },
      policy,
    )).toBe(false);
  });

  it("rejects unsupported types and invalid sizes", () => {
    expect(isAllowedAttachmentRequest(
      { fileName: "payload.exe", mimeType: "application/octet-stream", sizeBytes: 1000 },
      policy,
    )).toBe(false);
    for (const sizeBytes of [0, -1, 1.5, 5_000_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isAllowedAttachmentRequest(
        { fileName: "report.pdf", mimeType: "application/pdf", sizeBytes },
        policy,
      )).toBe(false);
    }
  });

  it("fails closed when the attachment size policy is invalid", () => {
    const request = { fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 100 };
    for (const maxAttachmentMb of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isAllowedAttachmentRequest(request, { ...policy, maxAttachmentMb })).toBe(false);
    }
  });

  it("fails closed when the allowed MIME configuration is malformed", () => {
    const request = { fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 100 };
    expect(isAllowedAttachmentRequest(request, { ...policy, allowedMimeTypes: [] })).toBe(false);
    expect(isAllowedAttachmentRequest(request, { ...policy, allowedMimeTypes: null as unknown as string[] })).toBe(false);
    expect(isAllowedAttachmentRequest(request, { ...policy, allowedMimeTypes: [""] })).toBe(false);
    expect(isAllowedAttachmentRequest(request, { ...policy, allowedMimeTypes: [null as unknown as string] })).toBe(false);
  });
});

describe("support attachment storage key validation", () => {
  it("accepts keys in the managed support upload format", () => {
    expect(isValidSupportAttachmentStorageKey("support/1729440000000-ab12cd34-report.pdf")).toBe(true);
  });

  it("accepts cryptographically random 192-bit upload identifiers", () => {
    expect(isValidSupportAttachmentStorageKey(`support/1729440000000-${"a".repeat(48)}-report.pdf`)).toBe(true);
  });

  it("rejects arbitrary paths and malformed keys", () => {
    for (const key of [
      "",
      "../support/report.pdf",
      "support/../private/file.pdf",
      "support/report.pdf",
      "support/1729440000000-ab12cd34-folder/report.pdf",
      null,
      42,
    ]) {
      expect(isValidSupportAttachmentStorageKey(key)).toBe(false);
    }
  });
});
