import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("revokeSession: protectedProcedure");
const end = source.indexOf("requestRiskReport:", start);
const route = source.slice(start, end);

describe("customer session revocation security notifications", () => {
  it("checks the authenticated customer's session ownership before revoking", () => {
    expect(route).toContain("listCustomerSessions(ctx.user.id)");
    expect(route).toContain("sessions.find((session: any) => Number(session.id) === input.id)");
    expect(route).toContain('new TRPCError({ code: "NOT_FOUND", message: "Session not found" })');
    expect(route.indexOf("listCustomerSessions")).toBeLessThan(route.indexOf("await revokeCustomerSession"));
  });

  it("creates a recipient-scoped, high-priority security notice after the revocation", () => {
    expect(route).toContain('"Security: session revoked"');
    expect(route).toContain("security-session-revoked:");
    expect(route).toContain('category: "security"');
    expect(route).toContain('priority: "high"');
    expect(route.indexOf("await revokeCustomerSession")).toBeLessThan(route.indexOf("await createNotification"));
  });

  it("keeps notification delivery best-effort after the security action commits", () => {
    expect(route).toContain('console.error("[Notifications] Session revocation notice failed after security change:"');
    expect(route).toContain("return { success: true }");
  });
});
