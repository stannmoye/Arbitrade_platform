import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const editorSource = readFileSync(new URL("./components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const retrySource = readFileSync(new URL("./components/AdminDeliveryRetryPolicy.tsx", import.meta.url), "utf8");
function fieldBlock(label: string) {
  const start = editorSource.indexOf(`<label>${label}<`);
  expect(start, `field label exists: ${label}`).toBeGreaterThanOrEqual(0);
  if (start < 0) return "";
  const end = editorSource.indexOf("</label>", start);
  expect(end, `field label closes: ${label}`).toBeGreaterThan(start);
  return editorSource.slice(start, end < 0 ? editorSource.length : end + "</label>".length);
}
function fieldHelp(label: string) {
  const block = fieldBlock(label);
  const match = block.match(/<small>([\s\S]*?)<\/small>/);
  expect(match, `${label} has visible field help`).toBeTruthy();
  return match?.[1] ?? "";
}
describe("tier policy field explanation contract", () => {
  it.each([
    ["Hard daily pop-up ceiling", ["Per-tier operational ceiling", "1–1,000", "never raise", "later delivery eligibility"]],
    ["Maximum visible offers at once", ["concurrent", "1–10,000", "not a daily quota"]],
    ["Optional daily target cap (0 = no extra cap)", ["0–10,000", "0 = no extra cap", "never increase"]],
    ["Delivery counting window", ["rolling 24 hours", "UTC calendar day", "operational deliveries"]],
    ["Minimum required capital (USD units)", ["whole USD units", "1–2,147,483,647", "available balance separately", "not the qualifying threshold"]],
    ["Maximum required capital (USD units)", ["whole USD units", "1–2,147,483,647", "at least the minimum", "existing offer/trade snapshots"]],
    ["Minimum interval between deliveries (seconds)", ["0–604,800", "must not exceed the maximum", "later delivery eligibility"]],
    ["Maximum interval between deliveries (seconds)", ["0–604,800", "at least the minimum", "shared Trading controls panel"]],
    ["Post-completion card display delay (seconds)", ["1–3,600 seconds", "only separate presentation delay", "does not extend", "selected opportunity duration"]],
    ["Interval after completion (seconds)", ["0–604,800", "0 = no extra wait", "delivery cooldown", "not trade duration"]],
    ["Maximum pending deliveries", ["Per-customer/per-package cap", "queued, in-progress and retry-wait", "0–1,000", "delivered, dismissed, failed and expired rows do not count", "0 blocks new pending deliveries"]],
    ["Maximum trade attempts per day", ["customer-wide daily attempt ceiling", "0–10,000", "0 = no extra daily cap", "technical retries"]],
    ["Trade retry delay (seconds)", ["5–3,600 whole seconds", "already scheduled retry time", "does not reset", "enable financial execution"]],
    ["Maximum successful trades per day", ["customer-wide daily ceiling", "0–10,000", "0 = no extra cap", "UTC-day"]],
    ["Maximum concurrent active trades", ["customer-wide active-trade limit", "1–1,000", "not the number of informational pop-ups"]],
    ["Minimum settlement delay (seconds)", ["900–604,800 whole seconds", "15 minutes–7 days", "not exceed the maximum", "existing trades remain unchanged"]],
    ["Maximum settlement delay (seconds)", ["900–604,800 whole seconds", "at least the minimum", "trade duration", "wallet-credit delay"]],
    ["Badge label", ["visual label", "40 characters", "never changes eligibility", "already delivered pop-up"]],
    ["Badge style", ["Visual style", "built-in styles", "cannot grant eligibility"]],
    ["Minimum configured return rate (%)", ["0.01%–50.00%", "basis points", "Set both bounds", "not market profit"]],
    ["Maximum configured return rate (%)", ["0.01%–50.00%", "basis points", "at least the minimum", "not derived from market performance"]],
    ["Minimum opportunity / pop-up duration (seconds)", ["10–86,400 whole seconds", "each new opportunity gets one fresh value", "popup countdown and server expiry"]],
    ["Maximum opportunity / pop-up duration (seconds)", ["10–86,400 whole seconds", "at least the minimum", "selected value", "original expiry snapshot"]],
    ["Minimum eligible reward rate (basis points)", ["0–10,000 whole basis points", "0%–100%", "eligibility floor", "not the configured return rate"]],
    ["Maximum daily reward cap (currency minor units)", ["0–2,147,483,647", "0 = no additional cap", "not capital", "configured rate"]],
    ["Maximum reward per trade (currency minor units)", ["0–2,147,483,647", "0 = no additional cap", "caps reward amount", "rather than capital"]],
    ["Card close policy", ["presentation rule", "after completion", "after its final status display", "Pending, retrying and awaiting-settlement cards remain accessible"]],
  ])("explains %s in plain language", (label, expectedHelp) => {
    const help = fieldHelp(label);
    for (const phrase of expectedHelp) expect(help.toLowerCase()).toContain(phrase.toLowerCase());
  });
  it("documents previous settlement as a global owner rather than a per-tier field", () => {
    expect(editorSource).toContain("Previous-settlement prerequisite is global.");
    expect(editorSource).toContain("Trade Settings → Package Configuration");
    expect(editorSource).not.toContain("<label>Previous-settlement prerequisite");
  });
  it("states the key separations and the snapshot/effective-time rule", () => {
    expect(editorSource).toContain("per-tier operational delivery ceilings that can reduce that entitlement but never increase it");
    expect(editorSource).toContain("Per-tier policy and pop-up delivery switches are controlled in the shared Trading controls panel");
    expect(editorSource).toContain("no global switch is edited here");
    expect(editorSource).toContain("It never changes eligibility or financial terms");
    expect(editorSource).toContain("not market profit or a guarantee");
    expect(editorSource).toContain("Each newly delivered pop-up stores its selected rate, duration and policy version");
    expect(editorSource).toContain("already delivered pop-ups and allocated trades keep their snapshots");
    expect(editorSource).toContain("post-completion display delay affects presentation only");
  });
  it("keeps delivery retry editing in the one shared Retry & Carry-Forward owner", () => {
    expect(editorSource).not.toContain("Maximum delivery attempts");
    expect(editorSource).not.toContain('"maxDeliveryAttempts"');
    expect(retrySource).toContain("one shared delivery-retry owner");
    expect(retrySource).toContain("one whole-second interval per retry attempt, from 5 to 3,600 seconds");
    expect(retrySource).toContain("No intervals are prefilled");
    expect(retrySource).toContain('placeholder="Enter a comma-separated sequence; none is prefilled"');
    expect(retrySource).toContain('option value="temporary" disabled={!policy.configured}');
    expect(retrySource).toContain("Temporary retry cannot be saved until a shared policy is configured and confirmed.");
    expect(retrySource).not.toContain('max={604800}');
  });
  it("preserves existing per-tier bounds and checks shared retry validation separately", () => {
    expect(fieldBlock("Hard daily pop-up ceiling")).toContain('min="1" max="1000" step="1"');
    expect(fieldBlock("Maximum visible offers at once")).toContain('min="1" max="10000" step="1"');
    expect(fieldBlock("Minimum required capital (USD units)")).toContain('min="1" max="2147483647" step="1"');
    expect(fieldBlock("Minimum interval between deliveries (seconds)")).toContain('min="0" max="604800" step="1"');
    expect(fieldBlock("Post-completion card display delay (seconds)")).toContain('min="1" max="3600" step="1"');
    expect(fieldBlock("Trade retry delay (seconds)")).toContain('min="5" max="3600" step="1"');
    expect(fieldBlock("Minimum settlement delay (seconds)")).toContain('min="900" max="604800" step="1"');
    expect(fieldBlock("Minimum configured return rate (%)")).toContain('min="0.01" max="50" step="0.01"');
    expect(fieldBlock("Minimum opportunity / pop-up duration (seconds)")).toContain('min="10" max="86400" step="1"');
    expect(retrySource).toContain("from 5 to 3,600 seconds");
  });
});
