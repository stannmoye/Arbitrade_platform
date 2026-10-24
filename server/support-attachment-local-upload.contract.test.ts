import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const prepareStart = source.indexOf('app.post("/api/support/attachments/prepare-upload"');
const uploadStart = source.indexOf('app.put("/api/support/attachments/upload"', prepareStart);
const uploadEnd = source.indexOf("registerProviderOAuthRoutes(app);", uploadStart);
const prepare = source.slice(prepareStart, uploadStart);
const upload = source.slice(uploadStart, uploadEnd);

describe("self-hosted support attachment upload security", () => {
  it("registers a dedicated request limiter for local upload preparation endpoint before parsing large bodies", () => {
    expect(source).toContain('req.path === "/api/support/attachments/prepare-upload"');
    const limiterPosition = source.indexOf("supportAttachmentPrepareUploadRateLimit(req, res, next)");
    const parserPosition = source.indexOf("app.use(express.json");
    expect(limiterPosition).toBeGreaterThanOrEqual(0);
    expect(parserPosition).toBeGreaterThan(limiterPosition);
  });

  it("authorizes the customer and ticket before issuing an application-local upload URL", () => {
    expect(prepareStart).toBeGreaterThanOrEqual(0);
    expect(uploadStart).toBeGreaterThan(prepareStart);
    expect(prepare).toContain("resolveLocalSupportUser(req, res)");
    expect(prepare).toContain("getCustomerTicket(user.id, ticketId)");
    expect(prepare).toContain('randomBytes(24).toString("hex")');
    expect(prepare).toContain('fileName.replace(/[^a-zA-Z0-9._-]/g, "_")');
    expect(prepare).toContain('uploadUrl: `/api/support/attachments/upload?key=${encodeURIComponent(key)}`');
    expect(prepare).toContain('stableUrl: `/storage/${key}`');
    expect(prepare).not.toContain("fetch(");
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
