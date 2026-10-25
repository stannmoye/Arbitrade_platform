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
  it("does not trust forwarded HTTPS unless the immediate proxy IP is explicitly allowlisted", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("function installerRequestIsHttps(): bool");
    expect(source).toContain("getenv('INSTALLER_TRUSTED_PROXY_IPS')");
    expect(source).toContain("in_array($remoteAddress, $trustedProxies, true)");
    expect(source).toContain("$forwardedProto === 'https'");
    expect(source).toContain("$httpsDetected = installerRequestIsHttps();");
  });

  it("blocks wizard progression until Node.js, pnpm, and installed dependency metadata pass preflight", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("function installerCommandOutput(string $binary, array $arguments): ?string");
    expect(source).toContain("getenv('ARBITRADE_NODE_BINARY')");
    expect(source).toContain("getenv('ARBITRADE_PNPM_BINARY')");
    expect(source).toContain("$nodeVersionValid");
    expect(source).toContain("$pnpmVersionValid");
    expect(source).toContain("is_file($root . '/node_modules/.modules.yaml')");
    expect(source).toContain("|| !$nodeVersionValid || !$pnpmVersionValid || !$nodeModulesReady");
    expect(source).toContain("All required PHP, Node.js, pnpm, installed-dependency, package, permission, and installation-state checks must pass");
  });

  it("keeps stage navigation controls outside the stage panels and gates progression", async () => {
    const source = await readFile(wizardPath, "utf8");
    expect(source).toContain("navigationControls.remove();");
    expect(source).toContain("form.appendChild(navigationControls);");
    expect(source).toContain("const preflightBlocked=");
    expect(source).toContain("next.disabled=preflightBlocked||!currentStepValid();");
    expect(source).toContain("submit.disabled=preflightBlocked||!currentStepValid();");
  });

});
