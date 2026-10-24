import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("server-side trading package eligibility", () => {
  it("blocks automatic opportunity delivery without a matching active subscription", () => {
    const start = source.indexOf("export async function listCustomerOpportunities(");
    const end = source.indexOf("export async function runAutoTradeCycle(", start);
    const implementation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain("eq(packages.name,packageName)");
    expect(implementation).toContain("packageNotActive:true");
  });

  it("rechecks active package eligibility inside the trade-allocation transaction", () => {
    const start = source.indexOf("export async function createTrade(");
    const end = source.indexOf("\nexport async function ", start + 5);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("db.transaction(async tx=>");
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain('.limit(1).for("update")');
    expect(implementation).toContain('if(!activePackageSubscription) throw new Error("An eligible active trading package subscription is required")');
  });
});
