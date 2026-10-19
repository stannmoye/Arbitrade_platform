import { describe, expect, it } from "vitest";
import { resolveTableContainerLabel } from "./table-label";

describe("resolveTableContainerLabel", () => {
  it("uses a stable fallback when the label is absent", () => {
    expect(resolveTableContainerLabel(undefined)).toBe("Scrollable table");
  });

  it.each(["", " ", "\t\n"])("uses a fallback for blank labels (%j)", (label) => {
    expect(resolveTableContainerLabel(label)).toBe("Scrollable table");
  });

  it.each([null, false, 0, {}, []])("uses a fallback for malformed runtime values (%j)", (value) => {
    expect(resolveTableContainerLabel(value)).toBe("Scrollable table");
  });

  it("trims caller-provided labels without changing their words", () => {
    expect(resolveTableContainerLabel("  Recent invoice examples  ")).toBe("Recent invoice examples");
  });
});
