import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public company catalogue assets", () => {
  it("does not publish provider access tokens in the logo source mapping", () => {
    const mapping = readFileSync(
      new URL("../../client/public/assets/company-logo-source/logo-mapping.csv", import.meta.url),
      "utf8",
    );
    expect(mapping).not.toMatch(/[?&]token=/i);
  });
});
