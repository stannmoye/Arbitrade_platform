import { describe, expect, it } from "vitest";
import { getSafePresignedUploadUrl } from "./support-upload-security";

describe("presigned support upload URL validation", () => {
  it("accepts absolute HTTPS URLs and preserves signed query parameters", () => {
    const input = "https://uploads.example.test/object?signature=abc%2F123&expires=60";
    expect(getSafePresignedUploadUrl(input)).toBe(input);
  });

  it.each([
    ["plain HTTP", "http://uploads.example.test/object"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a relative path", "/uploads/object"],
    ["embedded username", "https://user@uploads.example.test/object"],
    ["embedded password", "https://user:secret@uploads.example.test/object"],
    ["malformed URL", "https://[invalid"],
    ["an empty value", ""],
    ["a non-string value", null],
    ["an embedded tab that URL parsing would normalize", "https://uploads.example.test/ob\tject"],
    ["an embedded newline that URL parsing would normalize", "https://uploads.example.test/ob\nject"],
    ["a DEL control byte", "https://uploads.example.test/ob\u007fject"],
    ["leading whitespace", " https://uploads.example.test/object"],
    ["trailing whitespace", "https://uploads.example.test/object "],
  ])("rejects %s", (_label, input) => {
    expect(getSafePresignedUploadUrl(input)).toBeNull();
  });
});
