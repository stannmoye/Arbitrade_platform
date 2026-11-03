import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guide = readFileSync(resolve(process.cwd(), "client/public/trade-admin-guide.html"), "utf8");

describe("Trade Settings standalone admin guide", () => {
  it("is a self-contained HTML page with inline styling and no external assets", () => {
    expect(guide).toContain("<!doctype html>");
    expect(guide).toContain("<style>");
    expect(guide).toContain("</style>");
    expect(guide).not.toMatch(/<link[^>]+stylesheet/i);
    expect(guide).not.toMatch(/<script[^>]+src=/i);
  });

  it("documents the Trading admin controls and customer-facing behaviour", () => {
    for (const heading of [
      'id="tiers"',
      'id="quotas"',
      'id="opportunity"',
      'id="policy"',
      'id="timing"',
      'id="fees"',
      'id="monitor"',
      'id="worker"',
      'id="customer"',
      'id="recommended"',
    ]) {
      expect(guide).toContain(heading);
    }
    expect(guide).toContain("admin_manual_deposit_credit");
    expect(guide).toContain("Insufficient balance");
    expect(guide).toContain("carry-forward is not currently enabled");
    expect(guide).toContain("Minimize/Maximize");
  });

  it("keeps global masters in Package Configuration and per-tier legacy placeholders inert", () => {
    expect(guide).toContain("Package Configuration</strong> is the single UI owner for global eligibility");
    expect(guide).toContain("legacy per-tier master columns are inert OFF compatibility placeholders");
    expect(guide).toContain("Set global masters only through Package Configuration");
    expect(guide).toContain("Set the global rotation master in Package Configuration");
    expect(guide).toContain("Automatic financial execution remains hard-disabled");
    expect(guide).not.toContain("persistent Trading controls panel");
    expect(guide).not.toMatch(/new tier package is enabled by default/i);
    expect(guide).not.toMatch(/initialized with valid display defaults/i);
    expect(guide).not.toMatch(/newly created tier starts enabled/i);
    expect(guide).not.toMatch(/new tiers are enabled by default/i);
  });
});
