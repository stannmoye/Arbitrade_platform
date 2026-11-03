import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync(new URL("./components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");

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
    ["Expanded pop-up display duration (seconds)", ["supported range is 1–86,400 seconds", "server rejects longer values", "Display only", "does not close an active item", "countdown"]],
    ["Completed card display duration (seconds)", ["1–3,600 seconds", "Controls display only", "settlement", "wallet-credit timing"]],
    ["Interval after completion (seconds)", ["0–604,800", "0 = no extra wait", "delivery cooldown", "not trade duration"]],
    ["Maximum pending deliveries", ["stored per-tier pending-delivery setting", "0–1,000", "policy validation rejects a positive daily target when this value is zero", "current delivery worker does not use it to gate work", "does not currently limit pending deliveries"]],
    ["Maximum delivery attempts", ["1–20 whole attempts", "server saves and range-checks", "does not consume it", "does not alter current retry behavior", "carry-forward"]],
    ["Maximum trade attempts per day", ["customer-wide daily attempt ceiling", "0–10,000", "0 = no extra daily cap", "technical retries"]],
    ["Trade retry delay (seconds)", ["5–3,600 whole seconds", "already scheduled retry time", "does not reset", "enable financial execution"]],
    ["Maximum successful trades per day", ["customer-wide daily ceiling", "0–10,000", "0 = no extra cap", "UTC-day"]],
    ["Maximum concurrent active trades", ["customer-wide active-trade limit", "1–1,000", "not the number of informational pop-ups"]],
    ["Previous-settlement prerequisite", ["Global, read-only safety guard", "not a per-tier switch", "already scheduled settlement"]],
    ["Minimum settlement delay (seconds)", ["900–604,800 whole seconds", "15 minutes–7 days", "not exceed the maximum", "existing trades remain unchanged"]],
    ["Maximum settlement delay (seconds)", ["900–604,800 whole seconds", "at least the minimum", "trade duration", "wallet-credit delay"]],
    ["Badge label", ["visual label", "40 characters", "never changes eligibility", "already delivered pop-up"]],
    ["Badge style", ["Visual style", "built-in styles", "cannot grant eligibility"]],
    ["Minimum configured return rate (%)", ["0.01%–50.00%", "basis points", "Set both bounds", "not market profit"]],
    ["Maximum configured return rate (%)", ["0.01%–50.00%", "basis points", "at least the minimum", "not derived from market performance"]],
    ["Minimum trade duration (seconds)", ["10–86,400 whole seconds", "10 seconds–24 hours", "server-owned trade countdown", "not package entitlement lifetime"]],
    ["Maximum trade duration (seconds)", ["10–86,400 whole seconds", "at least the minimum", "new pop-up", "original timing snapshot"]],
    ["Minimum eligible reward rate (basis points)", ["0–10,000 whole basis points", "0%–100%", "eligibility floor", "not the configured return rate"]],
    ["Maximum daily reward cap (currency minor units)", ["0–2,147,483,647", "0 = no additional cap", "not capital", "configured rate"]],
    ["Maximum reward per trade (currency minor units)", ["0–2,147,483,647", "0 = no additional cap", "caps reward amount", "rather than capital"]],
    ["Card close policy", ["presentation rule", "after completion", "after its final status display", "Pending, retrying and awaiting-settlement cards remain accessible"]],
  ])("explains %s in plain language", (label, expectedHelp) => {
    const help = fieldHelp(label);
    for (const phrase of expectedHelp) expect(help.toLowerCase()).toContain(phrase.toLowerCase());
  });

  it("states the key separations and the snapshot/effective-time rule", () => {
    expect(editorSource).toContain("per-tier operational delivery ceilings that can reduce that entitlement but never increase it");
    expect(editorSource).toContain("Per-tier policy and pop-up delivery switches are controlled in the shared Trading controls panel");
    expect(editorSource).toContain("no global switch is edited here");
    expect(editorSource).toContain("It never changes eligibility or financial terms");
    expect(editorSource).toContain("not market profit or a guarantee");
    expect(editorSource).toContain("Each newly delivered pop-up stores its selected rate, duration and policy version");
    expect(editorSource).toContain("already delivered pop-ups and allocated trades keep their snapshots");
    expect(editorSource).toContain("display controls affect presentation only");
  });

  it("preserves existing server-aligned input bounds and step sizes", () => {
    expect(fieldBlock("Hard daily pop-up ceiling")).toContain('min="1" max="1000" step="1"');
    expect(fieldBlock("Maximum visible offers at once")).toContain('min="1" max="10000" step="1"');
    expect(fieldBlock("Minimum required capital (USD units)")).toContain('min="1" max="2147483647" step="1"');
    expect(fieldBlock("Minimum interval between deliveries (seconds)")).toContain('min="0" max="604800" step="1"');
    expect(fieldBlock("Expanded pop-up display duration (seconds)")).toContain('min="1" max="86400" step="1"');
    expect(fieldBlock("Maximum delivery attempts")).toContain('min="1" max="20" step="1"');
    expect(fieldBlock("Trade retry delay (seconds)")).toContain('min="5" max="3600" step="1"');
    expect(fieldBlock("Minimum settlement delay (seconds)")).toContain('min="900" max="604800" step="1"');
    expect(fieldBlock("Minimum configured return rate (%)")).toContain('min="0.01" max="50" step="0.01"');
    expect(fieldBlock("Minimum trade duration (seconds)")).toContain('min="10" max="86400" step="1"');
  });
});
