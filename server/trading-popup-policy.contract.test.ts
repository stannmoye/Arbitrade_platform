import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0086_trading_popup_policy_snapshots.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../client/src/admin-operations.css", import.meta.url), "utf8");
const walletFx = readFileSync(new URL("./modules/trading-wallet-fx.ts", import.meta.url), "utf8");

describe("administrator-configured Trading pop-up policy", () => {
  it("stores bounded rate, duration, badge, and per-pop-up snapshots in the canonical schema", () => {
    expect(schema).toContain('minimumPayoutRateBps: int("minimumPayoutRateBps")');
    expect(schema).toContain('maximumPayoutRateBps: int("maximumPayoutRateBps")');
    expect(schema).toContain('minimumTradeDurationSeconds: int("minimumTradeDurationSeconds")');
    expect(schema).toContain('maximumTradeDurationSeconds: int("maximumTradeDurationSeconds")');
    expect(schema).toContain('configuredProfitRateBps: int("configuredProfitRateBps")');
    expect(schema).toContain('configuredDurationSeconds: int("configuredDurationSeconds")');
    expect(schema).toContain('configuredPopupDisplaySeconds: int("configuredPopupDisplaySeconds")');
    expect(schema).toContain('packagePolicyVersionSnapshot: int("packagePolicyVersionSnapshot")');
    expect(schema).toContain('companyReferenceOnly: boolean("companyReferenceOnly")');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS `configuredProfitRateBps`');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS `trading_company_rotation_state`');
    expect(journal.entries.some((entry: { tag: string }) => entry.tag === "0086_trading_popup_policy_snapshots")).toBe(true);
  });

  it("validates the range on the server and persists selected values before automatic execution", () => {
    expect(router).toContain("minimumPayoutRateBps: z.number().int().min(0).max(5000).nullable()");
    expect(database).toContain("Set valid published reward-rate and duration bounds before enabling delivery");
    expect(database).toContain("configuredProfitRateBps:effectiveRateBps");
    expect(database).toContain("Saved pop-up duration is outside the tier's configured range");
    expect(database).toContain("popupSnapshot?.packagePolicyVersionSnapshot");
    expect(lifecycle).toContain("configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds");
    expect(lifecycle).toContain("packagePolicyVersionSnapshot");
    expect(database).toContain("calculateConfiguredProfitMinor(input.amountMinor,effectiveRateBps)");
  });

  it("rotates the brand-reference catalogue with a durable per-customer cursor and idempotent event key", () => {
    expect(lifecycle).toContain('"trading.companyRotation." + item.userId + "." + item.packageName');
    expect(lifecycle).toContain("SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE");
    expect(lifecycle).toContain("SELECT id FROM opportunity_popup_events WHERE eventKey=? LIMIT 1 FOR UPDATE");
    expect(lifecycle).toContain("await connection.commit()");
    expect(lifecycle).toContain("await connection.rollback()");
    expect(lifecycle).toContain("companyReferenceOnly");
    expect(database).toContain("planCrossWalletFunding");
    expect(database).toContain("trade_fx_conversion_debit");
    expect(database).toContain("trade_fx_conversion_credit");
    expect(database).toContain("getFreshTradingFxRate");
    expect(walletFx).toContain("Insufficient combined spendable wallet balance");
  });

  it("exposes admin controls with confirmation, help text, responsive spacing, and focus states", () => {
    expect(policyEditor).toContain("Minimum configured return rate (%)");
    expect(policyEditor).toContain("Maximum configured return rate (%)");
    expect(policyEditor).toContain("Minimum trade duration (seconds)");
    expect(policyEditor).toContain("Maximum trade duration (seconds)");
    expect(policyEditor).toContain("Badge label");
    expect(policyEditor).toContain("Reason for changing Trading tier policies (required for audit)");
    expect(policyEditor).toContain("onClick={onSave}");
    expect(adminApp).toContain("Requirement not met: A reason for changing Trading tier policies is required for audit.");
    expect(adminApp).toContain("Trading policy saved successfully. The saved settings have been reloaded");
    expect(adminCss).toContain(".package-policy-section");
    expect(adminApp).toContain("trading-tier-card--${index % 6}");
    expect(adminApp).toContain("trading-tier-badge");
    expect(adminCss).toContain(".trading-tier-card--5");
    expect(adminCss).toContain(".trading-tier-badge");
    expect(adminCss).toContain("@media (max-width: 620px)");
    expect(adminCss).toContain(":focus-visible");
  });
});
