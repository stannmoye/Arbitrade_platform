import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("admin Home Trading controls visibility", () => {
  it("keeps the global Trading controls off Home while preserving them on other admin pages", () => {
    expect(app).toContain('{section!=="overview"&&<AdminTradingGlobalControls/>}');
    expect(app).toContain('<PortalRenderBoundary key={section} portal="admin">');
  });
});
