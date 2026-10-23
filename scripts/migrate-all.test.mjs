import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("canonical database migration workflow", () => {
  it("runs every migration ledger, mining repair, and required-table verification in order", async () => {
    const source = await readFile(new URL("scripts/migrate-all.mjs", root), "utf8");
    const ordered = [
      "scripts/guarded-main-migrate.mjs",
      "scripts/apply-portal-migrations.mjs",
      "scripts/apply-mining-migrations.mjs",
      "scripts/apply-mining-initial-reward-rates.mjs",
      "scripts/ensure-mining-current-schema.mjs",
      "scripts/ensure-worker-runtime-schema.mjs",
      "scripts/verify-worker-schema.mjs",
    ];
    let last = -1;
    for (const file of ordered) {
      const position = source.indexOf(file);
      expect(position, file).toBeGreaterThan(last);
      last = position;
    }
    expect(source).toContain("--confirm-host-migration");
    expect(source).toContain("--confirm-production");
    expect(source).toContain("The server must not start with a partially migrated schema.");
  });

  it("routes generic db:migrate and production startup through the complete workflow", async () => {
    const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
    expect(pkg.scripts["db:migrate"]).toBe("node scripts/migrate-all.mjs");
    expect(pkg.scripts.start).toContain("pnpm db:migrate");
    const dockerfile = await readFile(new URL("Dockerfile", root), "utf8");
    expect(dockerfile).toContain('CMD ["sh", "-c", "pnpm start"]');
  });

  it("executes the mining current-schema repair on both installer modes", async () => {
    const source = await readFile(new URL("installer/run-install.mjs", root), "utf8");
    expect((source.match(/scripts\/ensure-mining-current-schema\.mjs/g) || []).length).toBe(2);
    expect((source.match(/scripts\/verify-worker-schema\.mjs/g) || []).length).toBe(2);
  });
});
