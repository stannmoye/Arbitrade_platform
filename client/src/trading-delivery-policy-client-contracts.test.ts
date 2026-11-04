import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatFeeBpsAsPercent,
  parseDeliveryIntervals,
  parseFeePercentToBps,
  parseFutureLocalDateTime,
  parseLocalDateTime,
  packageFeeExpectedVersion,
  resolvePackageFeePolicy,
  normalizeGlobalTradeTimingSettings,
  validateDeliveryRetryDraft,
  validatePackageFeeDraft,
} from "./trading-settings-client-contracts";

const feeEditorSource = readFileSync(new URL("./components/AdminPackageFeeEditor.tsx", import.meta.url), "utf8");
const retryEditorSource = readFileSync(new URL("./components/AdminDeliveryRetryPolicy.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const operationsUiSource = readFileSync(new URL("./components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("global Trade timing settings hydration", () => {
  it("preserves explicitly saved zero-second delay and cooldown values", () => {
    const form = normalizeGlobalTradeTimingSettings({
      settlementDelaySeconds: 900,
      creditDelaySeconds: 0,
      cooldownSeconds: 0,
      nextPopupFormulaDelaySeconds: 0,
      popupCooldownSeconds: 0,
      popupDisplaySeconds: 8,
      popupPreAlertSeconds: 0,
      popupJitterSeconds: 0,
      popupMaxPerHour: 12,
      marketRefreshIntervalMinutes: 120,
      blockUntilSettled: false,
    });
    expect(form).toMatchObject({
      settlementMinutes: 15,
      creditDelaySeconds: 0,
      cooldownSeconds: 0,
      nextPopupFormulaDelaySeconds: 0,
      popupCooldownSeconds: 0,
      popupPreAlertSeconds: 0,
      popupJitterSeconds: 0,
      blockUntilSettled: false,
    });
  });

  it("uses safe defaults only for missing or malformed values and is wired to the editor", () => {
    expect(normalizeGlobalTradeTimingSettings({ cooldownSeconds: "invalid" })).toMatchObject({
      settlementMinutes: 15,
      creditDelaySeconds: 0,
      cooldownSeconds: 30,
      nextPopupFormulaDelaySeconds: 30,
      popupCooldownSeconds: 45,
      popupDisplaySeconds: 8,
      popupPreAlertSeconds: 4,
      popupJitterSeconds: 90,
      popupMaxPerHour: 12,
      marketRefreshIntervalMinutes: 120,
      blockUntilSettled: true,
    });
    expect(operationsUiSource).toContain("normalizeGlobalTradeTimingSettings(q.data.trade)");
  });

  it("replaces out-of-range and fractional persisted values with safe defaults", () => {
    expect(normalizeGlobalTradeTimingSettings({
      settlementDelaySeconds: 899,
      creditDelaySeconds: -1,
      cooldownSeconds: 0.5,
      nextPopupFormulaDelaySeconds: 604801,
      popupCooldownSeconds: "invalid",
      popupDisplaySeconds: 0,
      popupPreAlertSeconds: 3601,
      popupJitterSeconds: -10,
      popupMaxPerHour: 0,
      marketRefreshIntervalMinutes: 10081,
    })).toMatchObject({
      settlementMinutes: 15,
      creditDelaySeconds: 0,
      cooldownSeconds: 30,
      nextPopupFormulaDelaySeconds: 30,
      popupCooldownSeconds: 45,
      popupDisplaySeconds: 8,
      popupPreAlertSeconds: 4,
      popupJitterSeconds: 90,
      popupMaxPerHour: 12,
      marketRefreshIntervalMinutes: 120,
    });
  });
});

describe("client Trading settings API contracts", () => {
  it("converts decimal percentage strings to bps exactly without rounding", () => {
    expect(parseFeePercentToBps("2.7")).toBe(270);
    expect(parseFeePercentToBps("15.00")).toBe(1500);
    expect(parseFeePercentToBps("100")).toBe(10_000);
    expect(parseFeePercentToBps("0.01")).toBe(1);
    for (const value of ["", "1.001", "100.01", "-1", "1e2", ".5", "1.2.3"]) expect(parseFeePercentToBps(value)).toBeNull();
    expect(formatFeeBpsAsPercent(270)).toBe("2.70");
  });

  it("parses delivery-specific whole-second intervals at the inclusive 5–3,600 bounds", () => {
    expect(parseDeliveryIntervals("")).toEqual([]);
    expect(parseDeliveryIntervals("5, 30, 3600")).toEqual([5, 30, 3600]);
    expect(parseDeliveryIntervals("4,30")).toBeNull();
    expect(parseDeliveryIntervals("3601")).toBeNull();
    expect(parseDeliveryIntervals("0,30")).toBeNull();
    expect(parseDeliveryIntervals("1.5")).toBeNull();
    expect(parseDeliveryIntervals("30, nope")).toBeNull();
  });

  it("rejects missing, invalid, equal-now, and past effective times", () => {
    const now = Date.parse("2026-11-03T13:00:00.000Z");
    expect(parseFutureLocalDateTime("", now)).toBeNull();
    expect(parseFutureLocalDateTime("not-a-date", now)).toBeNull();
    expect(parseFutureLocalDateTime("2026-11-03T13:00:00.000Z", now)).toBeNull();
    expect(parseFutureLocalDateTime("2026-11-03T12:59:00.000Z", now)).toBeNull();
    expect(parseFutureLocalDateTime("2026-11-03T13:01:00.000Z", now)).toBe("2026-11-03T13:01:00.000Z");
  });

  it("accepts a valid immediate or past effective time for delivery policy updates", () => {
    expect(parseLocalDateTime("2026-11-03T13:00:00.000Z")).toBe("2026-11-03T13:00:00.000Z");
    expect(parseLocalDateTime("2026-11-03T12:59:00.000Z")).toBe("2026-11-03T12:59:00.000Z");
    expect(parseLocalDateTime("not-a-date")).toBeNull();
    expect(parseLocalDateTime("")).toBeNull();
  });

  it("distinguishes latest fee mutation from the policy active now and a scheduled future version", () => {
    const now = Date.parse("2026-11-03T13:00:00.000Z");
    const response = {
      policies: [{
        packageId: 9,
        latestPolicyVersion: 3,
        latestPolicy: { packageId: 9, version: 3, feeRateBps: 1_500, roundingMode: "half_up", effectiveAt: "2026-11-04T00:00:00.000Z", changedBy: 71, changedAt: "2026-11-02T10:00:00.000Z", reason: "Scheduled update" },
        activePolicy: { packageId: 9, version: 2, feeRateBps: 1_200, roundingMode: "down", effectiveAt: "2026-10-01T00:00:00.000Z", changedBy: 62, changedAt: "2026-09-30T12:00:00.000Z", reason: "Active version" },
        upcomingPolicy: { packageId: 9, version: 3, feeRateBps: 1_500, roundingMode: "half_up", effectiveAt: "2026-11-04T00:00:00.000Z", changedBy: 71, changedAt: "2026-11-02T10:00:00.000Z", reason: "Scheduled update" },
      }],
    };
    const state = resolvePackageFeePolicy(response, 9, now);
    expect(state?.latestPolicyVersion).toBe(3);
    expect(state?.latestPolicy.feeRateBps).toBe(1_500);
    expect(state?.activePolicy?.version).toBe(2);
    expect(state?.activePolicy?.feeRateBps).toBe(1_200);
    expect(state?.upcomingPolicy?.version).toBe(3);
    expect(state?.latestPolicy.changedBy).toBe(71);
    expect(state?.latestPolicy.changedAt).toBe("2026-11-02T10:00:00.000Z");
  });

  it("does not classify a legacy flat future mutation version as active", () => {
    const now = Date.parse("2026-11-03T13:00:00.000Z");
    const state = resolvePackageFeePolicy([{ packageId: 4, version: 8, feeRateBps: 1_600, roundingMode: "half_even", effectiveAt: "2026-11-05T00:00:00.000Z", changedBy: "admin", changedAt: "2026-11-03T12:00:00.000Z", reason: "Scheduled" }], 4, now);
    expect(state?.latestPolicyVersion).toBe(8);
    expect(state?.activePolicy).toBeNull();
    expect(state?.upcomingPolicy?.version).toBe(8);
  });

  it("uses expected version zero only when initializing a package fee policy", () => {
    expect(packageFeeExpectedVersion(undefined)).toBe(0);
    expect(packageFeeExpectedVersion(null)).toBe(0);
    expect(packageFeeExpectedVersion({ packageId: 9, latestPolicy: { packageId: 9, version: 3, feeRateBps: 1_500, roundingMode: "half_up", effectiveAt: "2026-11-04T00:00:00.000Z", changedBy: null, changedAt: null, reason: null }, activePolicy: null, upcomingPolicy: null, latestPolicyVersion: 3 })).toBe(3);
  });

  it("requires a successful query and explicit rate, rounding, future time and reason for v1 setup", () => {
    expect(appSource).toContain("policyQueryLoaded={feePolicies.isSuccess}");
    expect(feeEditorSource).toContain("policyQueryLoaded && !policy");
    expect(feeEditorSource).toContain("Allocations for this package remain blocked until this setup is saved");
    expect(feeEditorSource).toContain('const [percent, setPercent] = useState("");');
    expect(feeEditorSource).toContain('const [rounding, setRounding] = useState<FeeRoundingMode | "">("");');
    expect(feeEditorSource).not.toContain("legacy global");
    expect(feeEditorSource).toContain("Select rounding mode");
    expect(feeEditorSource).toContain("expectedVersion = packageFeeExpectedVersion(policy)");
    expect(feeEditorSource).toContain("persisted.latestPolicyVersion === 1 && persisted.latestPolicy.version === 1");
    expect(feeEditorSource).toContain("Your draft is retained");
  });

  it("keeps fee application tied to allocation time and the changedBy/changedAt audit fields", () => {
    expect(feeEditorSource).toContain("allocation time");
    expect(feeEditorSource).toContain("new allocations created after its effective time");
    expect(feeEditorSource).toContain("changed by {row.changedBy");
    expect(feeEditorSource).toContain("row.changedAt");
    expect(feeEditorSource).not.toContain("row.updatedBy");
    expect(feeEditorSource).toContain("Your draft is retained");
  });

  it("uses the designated adminOperations tRPC fee and retry paths, with one editor owner", () => {
    expect(appSource).toContain("feeApi.packageFeePolicies.useQuery");
    expect(appSource).toContain("feeApi.createTradingPackage.useMutation");
    expect(appSource).toContain("resolvePackageFeePolicy(feePolicies.data");
    expect(feeEditorSource).toContain("api.packageFeeHistory.useQuery");
    expect(feeEditorSource).toContain("api.updatePackageFeePolicy.useMutation");
    expect(retryEditorSource).toContain("api.deliveryRetryPolicy.useQuery");
    expect(retryEditorSource).toContain("api.updateDeliveryRetryPolicy.useMutation");
    expect(appSource.match(/<AdminPackageFeeEditor /g)).toHaveLength(1);
    expect(appSource.match(/<AdminDeliveryRetryPolicy\/>/g)).toHaveLength(1);
    expect(retryEditorSource).toContain('placeholder="Enter a comma-separated sequence; none is prefilled"');
    expect(retryEditorSource).toContain('option value="temporary" disabled={!policy.configured}');
    expect(retryEditorSource).toContain("delivery retries only");
    expect(retryEditorSource).toContain("activate a replacement immediately");
    expect(retryEditorSource).not.toContain("allocateCapital");
    expect(retryEditorSource).not.toContain("settleTrade");
  });
});


describe("Trade settings draft validation", () => {
  it("explains every invalid package fee field before a save can be submitted", () => {
    expect(validatePackageFeeDraft({ feeRateBps: null, roundingMode: "", effectiveAt: null, reason: "  " })).toEqual([
      "Enter a fee rate from 0% to 100% in exact 0.01 percentage-point steps.",
      "Choose a fee rounding mode.",
      "Choose a valid effective time in the future.",
      "Enter a reason containing 5–500 characters.",
    ]);
    expect(validatePackageFeeDraft({ feeRateBps: 250, roundingMode: "half_up", effectiveAt: "2026-11-05T12:00:00.000Z", reason: "Approved fee change" })).toEqual([]);
  });

  it("requires one retry interval per retry attempt and explains no-retry constraints", () => {
    const base = { effectiveAt: "2026-11-05T12:00:00.000Z", reason: "Approved retry change", configured: true };
    expect(validateDeliveryRetryDraft({ ...base, policy: "temporary", maxAttempts: 4, intervalsSeconds: [30, 60], })).toContain(
      "Enter exactly one retry interval for each retry attempt (maximum attempts minus one).",
    );
    expect(validateDeliveryRetryDraft({ ...base, policy: "none", maxAttempts: 3, intervalsSeconds: [], })).toContain(
      "No-retry policy requires exactly one initial attempt and no retry intervals.",
    );
    expect(validateDeliveryRetryDraft({ ...base, policy: "temporary", maxAttempts: 3, intervalsSeconds: [30, 60], })).toEqual([]);
  });

  it("rejects malformed retry attempts, missing effective time, and missing audit reason", () => {
    expect(validateDeliveryRetryDraft({
      policy: "temporary", maxAttempts: 0, intervalsSeconds: [30], effectiveAt: null, reason: "", configured: false,
    })).toEqual([
      "Maximum delivery attempts must be a whole number from 1 to 20.",
      "Configure and confirm the shared retry policy before enabling temporary retries.",
      "Enter exactly one retry interval for each retry attempt (maximum attempts minus one).",
      "Choose a valid effective time.",
      "Enter a reason containing 5–500 characters.",
    ]);
  });

  it("renders accessible inline validation and confirmed-save feedback in both editors", () => {
    expect(feeEditorSource).toContain("Check these fee settings before saving:");
    expect(feeEditorSource).toContain('messageKind === "error" ? "admin-ops-empty error" : "test-notice"');
    expect(retryEditorSource).toContain("Check these retry settings before saving:");
    expect(retryEditorSource).toContain("validateDeliveryRetryDraft");
    expect(retryEditorSource).toContain('messageKind === "error" ? "admin-ops-empty error" : "test-notice"');
  });
});
