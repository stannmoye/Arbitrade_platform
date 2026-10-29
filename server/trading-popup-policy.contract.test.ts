import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0086_trading_popup_policy_snapshots.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../client/src/admin-operations.css", import.meta.url), "utf8");
const walletFx = readFileSync(new URL("./modules/trading-wallet-fx.ts", import.meta.url), "utf8");

describe("administrator-configured Trading pop-up policy", () => {
  it("stores bounded rate, duration, badge, and per-pop-up snapshots in the canonical schema", () => {
    expect(schema).toContain('maximumRewardBps: int("maximumRewardBps")');
    expect(schema).toContain('minimumTradeDurationSeconds: int("minimumTradeDurationSeconds")');
    expect(schema).toContain('maximumTradeDurationSeconds: int("maximumTradeDurationSeconds")');
    expect(schema).toContain('configuredProfitRateBps: int("configuredProfitRateBps")');
    expect(schema).toContain('configuredDurationSeconds: int("configuredDurationSeconds")');
    expect(schema).toContain('configuredPopupDisplaySeconds: int("configuredPopupDisplaySeconds")');
    expect(schema).toContain('companyReferenceOnly: boolean("companyReferenceOnly")');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS `maximumRewardBps`');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS `trading_company_rotation_state`');
    expect(journal.entries.at(-1).tag).toBe("0086_trading_popup_policy_snapshots");
  });

  it("validates the range on the server and persists selected values before automatic execution", () => {
    expect(router).toContain("maximumRewardBps: z.number().int().min(0).max(10000).optional()");
    expect(database).toContain("Profit percentage range is invalid");
    expect(database).toContain("configuredProfitRateBps:configuredRateBps");
    expect(database).toContain("configuredDurationSeconds,packagePolicyVersionSnapshot");
    expect(database).toContain("calculateConfiguredProfitMinor(input.amountMinor,configuredRateBps)");
    expect(lifecycle).toContain("configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds");
  });

  it("rotates the brand-reference catalogue with a durable per-customer cursor and idempotent event key", () => {
    expect(lifecycle).toContain("trading_company_rotation_state");
    expect(lifecycle).toContain("WHERE userId=? FOR UPDATE");
    expect(lifecycle).toContain("SELECT id FROM opportunity_popup_events WHERE eventKey=? LIMIT 1");
    expect(lifecycle).toContain("await connection.commit()");
    expect(lifecycle).toContain("await connection.rollback()");
    expect(lifecycle).toContain("companyReferenceOnly");
    expect(database).toContain("companyLogoUrl:row.companyLogoUrl||null");
    expect(database).toContain("planCrossWalletFunding");
    expect(database).toContain("trade_fx_conversion_debit");
    expect(database).toContain("trade_fx_conversion_credit");
    expect(database).toContain("getFreshTradingFxRate");
    expect(walletFx).toContain("Insufficient combined spendable wallet balance");
  });

  it("exposes admin controls with confirmation, help text, responsive spacing, and focus states", () => {
    expect(adminApp).toContain("Minimum profit rate (%)");
    expect(adminApp).toContain("Maximum profit rate (%)");
    expect(adminApp).toContain("Minimum trade duration (seconds)");
    expect(adminApp).toContain("Maximum trade duration (seconds)");
    expect(adminApp).toContain("Package badge label");
    expect(adminApp).toContain("window.confirm(\"Save the Trading pop-up and package policy settings?");
    expect(adminCss).toContain(".package-policy-section");
    expect(adminCss).toContain("@media (max-width: 620px)");
    expect(adminCss).toContain(":focus-visible");
  });
});
