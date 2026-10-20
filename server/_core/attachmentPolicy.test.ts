import { describe, expect, it } from "vitest";
import { isAllowedAttachmentRequest } from "./attachmentPolicy";

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
});
