import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const attachmentPolicy = readFileSync(new URL("./_core/attachmentPolicy.ts", import.meta.url), "utf8");
const localStorage = readFileSync(new URL("./local-storage.ts", import.meta.url), "utf8");
const route = source.match(/app\.post\("\/api\/support\/attachments\/presign"[\s\S]*?registerProviderOAuthRoutes\(app\);/);

describe("support attachment presign error logging", () => {
  it("rate-limits support presign requests before parsing potentially oversized JSON bodies", () => {
    expect(source).toContain('const supportAttachmentPresignRateLimit = createAuthRateLimiter({ windowMs: 60_000, max: 20');
    expect(source).toContain('scope: "support-attachment-presign"');
    expect(source).toContain('if (req.method === "POST" && req.path === "/api/support/attachments/presign")');
    const limiterPosition = source.indexOf("supportAttachmentPresignRateLimit(req, res, next)");
    const parserPosition = source.indexOf("app.use(express.json");
    expect(limiterPosition).toBeGreaterThan(-1);
    expect(parserPosition).toBeGreaterThan(-1);
    expect(limiterPosition).toBeLessThan(parserPosition);
    expect(source).toContain('app.post("/api/support/attachments/presign", async (req, res) => {');
  });

  it("validates private local storage paths, ticket scope, and attachment ownership", () => {
    expect(route).not.toBeNull();
    const routeSource = route?.[0] ?? "";
    const keyPosition = routeSource.indexOf("isSupportAttachmentStorageKeyForTicket(key, ticketId)");
    const responsePosition = routeSource.indexOf("return res.json({");
    expect(keyPosition).toBeGreaterThan(-1);
    expect(responsePosition).toBeGreaterThan(keyPosition);
    expect(routeSource).not.toContain("MANUS_API_URL");
    expect(routeSource).not.toContain("fetch(");
    expect(attachmentPolicy).toContain("isValidSupportAttachmentStorageKey");
    expect(localStorage).toContain("relativeTarget.startsWith(\"..\")");
    expect(localStorage).toContain("relativeFromPublic");
    expect(source).toContain('app.get("/api/support/attachments/file"');
    expect(source).toContain("getTicketAttachmentAccess(key)");
    expect(source).toContain('user.role !== "admin" && attachment.customerId !== Number(user.id)');
  });

  it("does not log raw provider or network exception messages", () => {
    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('error instanceof Error ? error.name : "UnknownError"');
    expect(route?.[0]).not.toContain("error.message");
    expect(route?.[0]).not.toContain("MANUS_API_KEY");
  });
});
