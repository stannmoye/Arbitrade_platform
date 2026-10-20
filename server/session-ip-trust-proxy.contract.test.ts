import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const sessionStart = source.indexOf("session: protectedProcedure");
const sessionEnd = source.indexOf("sessions: protectedProcedure", sessionStart);
const sessionRoute = source.slice(sessionStart, sessionEnd);

describe("customer session audit IP trust boundary", () => {
  it("uses Express trusted-proxy resolution instead of trusting X-Forwarded-For directly", () => {
    expect(sessionRoute).toContain("const ipAddress = ctx.req.ip || ctx.req.socket.remoteAddress;");
    expect(sessionRoute).not.toContain("x-forwarded-for");
    expect(sessionRoute).not.toContain("forwarded.split");
  });
});
