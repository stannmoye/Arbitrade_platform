import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const route = source.match(/app\\.post\\("\/api\/support\/attachments\/presign"[\\s\\S]*?registerOAuthRoutes\\(app\\);/);

describe("support attachment presign error logging", () => {
  it("does not log raw provider or network exception messages", () => {
    expect(route).not.toBeNull();
    expect(route?.[0]).toContain('error instanceof Error ? error.name : "UnknownError"');
    expect(route?.[0]).not.toContain("error.message");
  });
});
