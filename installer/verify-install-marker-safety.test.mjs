import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { safeDisplayText } from "./recovery-utils.mjs";

const verifierPath = resolve(fileURLToPath(new URL("..", import.meta.url)), "installer", "verify-install.mjs");

describe("installer verifier recovery-marker output safety", () => {
  it("sanitizes untrusted marker fields before printing them to a terminal", async () => {
    const source = await readFile(verifierPath, "utf8");
    expect(source).toContain('import { safeDisplayText } from "./recovery-utils.mjs";');
    expect(source).toContain("stage: ${safeDisplayText(progress.stage)}");
    expect(source).toContain("started: ${safeDisplayText(progress.startedAt)}");
    expect(source).not.toContain("stage: ${String(progress.stage || \"unknown\")}");
    expect(source).not.toContain("started: ${String(progress.startedAt || \"unknown\")}");
  });

  it("removes control and ANSI escape sequences from displayed marker values", () => {
    expect(safeDisplayText("stage\u001b[31m\u001b[2J\nforged output")).toBe("stageforged output");
  });
});
