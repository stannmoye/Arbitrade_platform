import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const route = source.match(/app\.post\("\/api\/support\/attachments\/presign"[\s\S]*?registerOAuthRoutes\(app\);/);

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

  it("does not log raw provider or network exception messages", () => {
    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('error instanceof Error ? error.name : "UnknownError"');
    expect(route?.[0]).not.toContain("error.message");
  });
});
