import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const wizardPath = new URL("./index.php", import.meta.url);

describe("PHP installer state-marker safety", () => {
  it("treats dangling symlinks as existing protected state", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("function installerPathExists(string $path): bool");
    expect(source).toContain("return file_exists($path) || is_link($path);");
    expect(source).toContain("installerPathExists($configuredLock)");
    expect(source).toContain("installerPathExists($installedLock)");
    expect(source).toContain("installerPathExists($envPath)");
    expect(source).toContain("installerPathExists($bootstrapPath)");
    expect(source).toContain("!installerPathExists($configuredLock) && !installerPathExists($installedLock) && !installerPathExists($envPath) && !installerPathExists($bootstrapPath)");
    expect(source).not.toContain("if (file_exists($configuredLock) || file_exists($installedLock) || file_exists($envPath))");
  });

  it("rechecks every protected destination before saving configuration", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("if (installerPathExists($envPath) || installerPathExists($bootstrapPath) || installerPathExists($configuredLock) || installerPathExists($installedLock))");
  });

  it("rejects credentials embedded in the public application URL", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("$parsedAppUrl = parse_url($appUrl);");
    expect(source).toContain("isset($parsedAppUrl['user']) || isset($parsedAppUrl['pass'])");
    expect(source).toContain("The application URL must not contain a username or password.");
  });
});
