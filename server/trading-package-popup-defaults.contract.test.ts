import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0106_package_popup_defaults.sql", import.meta.url), "utf8");
const journal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const globalDefaults = readFileSync(new URL("../drizzle/0105_default_on_global_information_delivery.sql", import.meta.url), "utf8");
const generationDefaults = readFileSync(new URL("../drizzle/0103_automatic_opportunity_generation_templates.sql", import.meta.url), "utf8");

describe("persisted package popup defaults", () => {
  it("creates a policy for every package that does not already have one", () => {
    expect(migration).toContain("FROM `packages` package");
    expect(migration).toContain("LEFT JOIN `opportunity_package_policies` existing");
    expect(migration).toContain("WHERE existing.`id` IS NULL");
    expect(migration).toContain("GREATEST(1, package.`opportunitiesPerDay`)");
  });

  it("repairs only untouched policy rows and preserves valid saved financial bounds", () => {
    expect(migration).toContain("WHERE policy.`updatedBy` IS NULL");
    expect(migration).toContain("THEN policy.`minimumPayoutRateBps` ELSE 200 END");
    expect(migration).toContain("THEN policy.`maximumPayoutRateBps` ELSE 300 END");
    expect(migration).toContain("THEN policy.`minimumTradeDurationSeconds` ELSE 300 END");
    expect(migration).toContain("THEN policy.`maximumTradeDurationSeconds` ELSE 900 END");
  });

  it("assigns the requested package-by-package interval progression", () => {
    expect(migration).toContain("180 + ((ranked.`packageOrder` - 1) * 120)");
    expect(migration).toContain("policy.`minIntervalSeconds` = 45 AND policy.`maxIntervalSeconds` = 3600");
    expect(migration).toContain("`popupDisplayTargetSeconds`, `completionDisplaySeconds`");
    expect(migration).toContain("FALSE, 120, 60, 60, 3");
  });

  it("does not enable legacy per-package masters or automatic financial execution", () => {
    expect(migration).toContain("FALSE, 'avoid_until_exhausted'");
    expect(migration).toContain("FALSE, FALSE, FALSE, FALSE");
    expect(migration).not.toContain("UPDATE `packages`");
    expect(migration).not.toContain("UPDATE `customer_package_subscriptions`");
  });

  it("keeps global informational delivery and generation enabled through existing migrations", () => {
    expect(globalDefaults).toContain("$.informationalPopupDeliveryEnabled");
    expect(globalDefaults).toContain("$.tierPolicyMasterEnabled");
    expect(generationDefaults).toContain("JSON_OBJECT('enabled',TRUE,'version',1");
    expect(journal).toContain('"tag": "0106_package_popup_defaults"');
  });

  it("records provisioned package policy values in the audit stream", () => {
    expect(migration).toContain("trade_package_popup_defaults_seeded");
    expect(migration).toContain("trade-package-popup-defaults-0106:");
  });
});
