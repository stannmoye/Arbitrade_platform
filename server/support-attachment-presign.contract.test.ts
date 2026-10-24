import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const presignStart = source.indexOf('app.post("/api/support/attachments/presign"');
const uploadStart = source.indexOf('app.put("/api/support/attachments/upload"', presignStart);
const uploadEnd = source.indexOf("registerProviderOAuthRoutes(app);", uploadStart);
const presign = source.slice(presignStart, uploadStart);
const upload = source.slice(uploadStart, uploadEnd);

describe("self-hosted support attachment upload security", () => {
  it("registers a dedicated request limiter for the presign endpoint before parsing large bodies", () => {
    expect(source).toContain('req.path === "/api/support/attachments/presign"');
    const limiterPosition = source.indexOf("supportAttachmentPresignRateLimit(req, res, next)");
    const parserPosition = source.indexOf("app.use(express.json");
    expect(limiterPosition).toBeGreaterThanOrEqual(0);
    expect(parserPosition).toBeGreaterThan(limiterPosition);
  });

  it("authorizes the customer and ticket before issuing an application-local upload URL", () => {
    expect(presignStart).toBeGreaterThanOrEqual(0);
    expect(uploadStart).toBeGreaterThan(presignStart);
    expect(presign).toContain("resolveLocalSupportUser(req, res)");
    expect(presign).toContain("getCustomerTicket(user.id, ticketId)");
    expect(presign).toContain('randomBytes(24).toString("hex")');
    expect(presign).toContain('fileName.replace(/[^a-zA-Z0-9._-]/g, "_")');
    expect(presign).toContain('uploadUrl: `/api/support/attachments/upload?key=${encodeURIComponent(key)}`');
    expect(presign).toContain('stableUrl: `/storage/${key}`');
    expect(presign).not.toContain("MANUS_API_URL");
    expect(presign).not.toContain("getSafePresignedUploadUrl");
    expect(presign).not.toContain("fetch(");
  });

  it("validates ownership, storage key, actual bytes and policy before persisting upload data", () => {
    expect(uploadStart).toBeGreaterThanOrEqual(0);
    expect(uploadEnd).toBeGreaterThan(uploadStart);
    expect(upload).toContain("resolveLocalSupportUser(req, res)");
    expect(upload).toContain("getCustomerTicket(user.id, ticketId)");
    expect(upload).toContain("Buffer.isBuffer(req.body)");
    expect(upload).toContain("isAllowedAttachmentRequest({ fileName, mimeType, sizeBytes: req.body.length }, policy)");
    const writePosition = upload.indexOf("await writeStorageObject(key, req.body, mimeType)");
    const successPosition = upload.indexOf("res.status(201).json");
    expect(writePosition).toBeGreaterThanOrEqual(0);
    expect(successPosition).toBeGreaterThan(writePosition);
    expect(upload).toContain('error instanceof Error ? error.name : "UnknownError"');
    expect(upload).not.toContain("error.message");
  });
});
