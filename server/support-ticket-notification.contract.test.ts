import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("support reply notification failure visibility", () => {
  it("reports partial admin notification failures after the reply commits", () => {
    expect(source).toContain('const results=await Promise.allSettled(admins.map(admin=>createNotification(admin.id,"Customer replied to a support ticket"');
    expect(source).toContain('if(results.some(result=>result.status==="rejected")) console.error("[Notifications] One or more customer-reply notices failed after message commit.");');
  });
});
