import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSessionSecret } from "./session-secret.mjs";

const roots = [];
async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "arbitrade-session-secret-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("automatic production session secret setup", () => {
  it("generates and securely persists a secret when .env is absent", async () => {
    const root = await makeRoot();
    const env = {};
    const result = await ensureSessionSecret({ root, env });
    const contents = await readFile(join(root, ".env"), "utf8");
    const info = await stat(join(root, ".env"));
    expect(result).toEqual({ generated: true, source: "generated" });
    expect(env.SESSION_SECRET).toMatch(/^[a-f0-9]{96}$/);
    expect(contents).toContain("SESSION_SECRET=");
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("preserves other settings and replaces an empty SESSION_SECRET entry", async () => {
    const root = await makeRoot();
    const path = join(root, ".env");
    await writeFile(path, 'DATABASE_URL="mysql://example/db"\nSESSION_SECRET=""\nPASSWORD_PEPPER="keep-me"\n', { mode: 0o600 });
    const env = {};
    await ensureSessionSecret({ root, env });
    const contents = await readFile(path, "utf8");
    expect(contents).toContain('DATABASE_URL="mysql://example/db"');
    expect(contents).toContain('PASSWORD_PEPPER="keep-me"');
    expect(contents.match(/^SESSION_SECRET=/gm)).toHaveLength(1);
    expect(contents).toContain(env.SESSION_SECRET);
  });

  it("reuses a valid secret already saved in .env", async () => {
    const root = await makeRoot();
    const secret = "a".repeat(96);
    await writeFile(join(root, ".env"), 'SESSION_SECRET="' + secret + '"\n', { mode: 0o600 });
    const env = {};
    const result = await ensureSessionSecret({ root, env });
    expect(result).toEqual({ generated: false, source: "env-file" });
    expect(env.SESSION_SECRET).toBe(secret);
  });

  it("does not replace a non-empty host-provided secret", async () => {
    const root = await makeRoot();
    const env = { SESSION_SECRET: "host-managed-stable-secret" };
    const result = await ensureSessionSecret({ root, env });
    expect(result).toEqual({ generated: false, source: "environment" });
    expect(env.SESSION_SECRET).toBe("host-managed-stable-secret");
  });
});
