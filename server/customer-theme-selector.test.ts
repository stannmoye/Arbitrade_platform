import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");

describe("customer theme selector integration", () => {
  it("lets the shared selector enforce administrator policy instead of hardcoding read-only mode", () => {
    expect(appSource).toContain('return <div className="arb-page separate-portal customer-portal"');
    expect(appSource).toContain("<ThemeSelector compact/>");
    expect(appSource).not.toContain("<ThemeSelector compact readOnly/>");
  });
});
