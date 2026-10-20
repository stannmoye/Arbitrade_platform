import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("client/src/App.tsx", "utf8");

describe("customer theme selector integration", () => {
  it("renders accessible theme controls in the header and left customer rail", () => {
    expect(appSource).toContain('<ThemeSelector compact placement="header"/>');
    expect(appSource).toContain('<ThemeSelector compact placement="sidebar"/>');
    expect(appSource).not.toContain("<ThemeSelector compact readOnly/>");
  });
});
