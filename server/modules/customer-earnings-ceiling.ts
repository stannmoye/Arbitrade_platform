import Decimal from "decimal.js";

export type CustomerEarningsCeilingWindow = "rolling_24h" | "calendar_day";

export type CustomerEarningsCeilingPolicy = {
  amountMinor: number;
  referenceCurrency: string;
  window: CustomerEarningsCeilingWindow;
  timezone: string;
  policyVersion: number;
  configured: boolean;
};

export function validateCustomerEarningsCeilingPolicy(input: {
  amountMinor: number;
  referenceCurrency: string;
  window: CustomerEarningsCeilingWindow;
  timezone: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Customer earnings ceiling must be a positive safe integer in reference-currency minor units");
  const referenceCurrency = input.referenceCurrency.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{2,12}$/.test(referenceCurrency)) throw new Error("Customer earnings ceiling reference currency is invalid");
  if (input.window !== "rolling_24h" && input.window !== "calendar_day") throw new Error("Customer earnings ceiling window is invalid");
  if (!input.timezone.trim()) throw new Error("Customer earnings ceiling timezone is required");
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(); } catch { throw new Error("Customer earnings ceiling timezone is not a valid IANA timezone"); }
  return { ...input, referenceCurrency };
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

export function earningsWindow(now: Date, window: CustomerEarningsCeilingWindow, timezone: string) {
  if (window === "rolling_24h") return { key: `rolling:${now.toISOString()}`, start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now };
  const local = zonedParts(now, timezone);
  const dayStart = new Date(Date.UTC(local.year, local.month - 1, local.day));
  return { key: `calendar:${local.year.toString().padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}:${timezone}`, start: dayStart, end: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
}

export function convertMinorToReferenceMinor(amountMinor: number, sourceScale: number, sourceUsdRate: number, referenceScale: number, referenceUsdRate: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("Earnings amount is invalid");
  if (!Number.isInteger(sourceScale) || sourceScale < 0 || !Number.isFinite(sourceUsdRate) || sourceUsdRate <= 0 || !Number.isInteger(referenceScale) || referenceScale < 0 || !Number.isFinite(referenceUsdRate) || referenceUsdRate <= 0) throw new Error("Earnings currency conversion is unavailable");
  const converted = new Decimal(amountMinor).div(new Decimal(10).pow(sourceScale)).mul(sourceUsdRate).div(referenceUsdRate).mul(new Decimal(10).pow(referenceScale)).floor();
  if (!converted.isInteger() || converted.isNegative() || converted.gt(Number.MAX_SAFE_INTEGER)) throw new Error("Earnings currency conversion exceeds safe precision");
  return converted.toNumber();
}

export function canReserveCustomerEarnings(capMinor: number, realizedMinor: number, reservedMinor: number, requestedMinor: number) {
  for (const [label, value] of [["ceiling", capMinor], ["realized", realizedMinor], ["reserved", reservedMinor], ["requested", requestedMinor]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Customer earnings ${label} amount is invalid`);
  }
  return realizedMinor <= capMinor && reservedMinor <= capMinor - realizedMinor && requestedMinor <= capMinor - realizedMinor - reservedMinor;
}
