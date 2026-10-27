import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("customer Trading package catalogue diagnostics", () => {
  const start = source.indexOf("export async function listCustomerTradingPackages(");
  const end = source.indexOf("\nexport async function activateCustomerTradingPackage(", start);
  const implementation = source.slice(start, end);

  it("identifies each database-dependent phase without logging customer identifiers", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    for (const phase of [
      "database_connection",
      "read_activation_settings",
      "read_qualifying_wallet_balances",
      "calculate_qualifying_balance",
      "read_enabled_package_catalogue",
      "read_customer_subscription_history",
    ]) {
      expect(implementation).toContain(`phase = "${phase}"`);
    }
    expect(implementation).toContain('[Trading] Customer package catalogue dependency unavailable');
    expect(implementation).toContain("errorCode:");
    expect(implementation).toContain("sqlState:");

    const diagnosticStart = implementation.indexOf('console.error("[Trading] Customer package catalogue dependency unavailable"');
    const diagnosticEnd = implementation.indexOf("\n    });", diagnosticStart);
    expect(diagnosticStart).toBeGreaterThanOrEqual(0);
    expect(diagnosticEnd).toBeGreaterThan(diagnosticStart);
    const diagnosticFields = implementation.slice(diagnosticStart, diagnosticEnd);
    expect(diagnosticFields).not.toContain("userId");
    expect(implementation).toContain('throw new Error("Trading package catalogue unavailable (phase: ');
  });

  it("keeps catalogue reads read-only and does not attempt activation", () => {
    expect(implementation).toContain("Trading package catalogue unavailable (phase: ");
    expect(implementation).not.toContain("db.update(customerPackageSubscriptions)");
    expect(implementation).not.toContain('phase = "expire_stale_subscriptions"');
    expect(implementation).not.toContain("activateCustomerTradingPackage(");
    expect(implementation).not.toContain("SQL query failed");
  });

  it("returns the configured package terms but blocks activation when eligibility data cannot be verified", () => {
    expect(implementation).toContain("const catalog=await db.select({");
    expect(implementation).toContain("minimumQualifyingBalanceUsdMinor:packages.minimumQualifyingBalanceUsdMinor");
    expect(implementation).not.toContain("db.select().from(packages)");
    expect(implementation).toContain("Trading package catalogue unavailable (phase: ");
    expect(implementation).toContain("eligibilityAvailable=Boolean(policy)&&walletBalanceAvailable&&subscriptionHistoryAvailable");
    expect(implementation).toContain("eligibilityWarning:");
    expect(implementation).toContain('blockReason=!eligibilityAvailable?"eligibility_unavailable"');
    expect(implementation).toContain("canActivate:eligibilityAvailable&&!blockReason");
    expect(implementation).toContain("logPhaseError(phase,error)");
  });
});
