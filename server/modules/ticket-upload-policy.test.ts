import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_UPLOAD_POLICY,
  normalizeTicketUploadPolicy,
} from "./ticket-upload-policy";

describe("ticket upload policy normalization", () => {
  it("uses safe defaults when persisted settings are missing", () => {
    expect(normalizeTicketUploadPolicy(undefined, undefined)).toEqual({
      maxAttachmentMb: 25,
      allowedMimeTypes: [...DEFAULT_TICKET_UPLOAD_POLICY.allowedMimeTypes],
    });
  });

  it("preserves valid settings and caps the maximum size", () => {
    expect(normalizeTicketUploadPolicy("12", "image/*, .pdf, text/plain")).toEqual({
      maxAttachmentMb: 12,
      allowedMimeTypes: ["image/*", ".pdf", "text/plain"],
    });
    expect(normalizeTicketUploadPolicy("150", ".pdf").maxAttachmentMb).toBe(100);
  });

  it("falls back from invalid sizes and empty MIME lists", () => {
    for (const value of ["", "0", "-1", "2.5", "NaN", "Infinity"]) {
      expect(normalizeTicketUploadPolicy(value, ".pdf").maxAttachmentMb).toBe(25);
    }
    expect(normalizeTicketUploadPolicy("10", " , ")).toEqual({
      maxAttachmentMb: 10,
      allowedMimeTypes: [...DEFAULT_TICKET_UPLOAD_POLICY.allowedMimeTypes],
    });
  });
});
