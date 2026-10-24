export type EligibleWalletBalance = {
  currency: string;
  availableMinor: number;
  scale: number;
  usdRate: number;
};

export type PackageQualificationPolicy = {
  eligibleCurrencies: string[];
  combineEligibleWallets: boolean;
  repeatAllowed: boolean;
  maxCopies: number;
  repeatRestriction: "active_only" | "all_history";
  cooldownSeconds: number;
};

export function parsePackageQualificationPolicy(values: Record<string, string | undefined>): PackageQualificationPolicy {
  let parsedCurrencies: unknown = ["USD"];
  try {
    parsedCurrencies = JSON.parse(values["trading.packageQualification.eligibleCurrencies"] ?? '["USD"]');
  } catch {
    throw new Error("Eligible package-qualification currencies setting is invalid JSON");
  }
  if (!Array.isArray(parsedCurrencies) || parsedCurrencies.some(value => typeof value !== "string" || !/^[A-Za-z0-9._-]{2,32}$/.test(value.trim()))) {
    throw new Error("Eligible package-qualification currencies must be a list of currency codes");
  }
  const eligibleCurrencies = [...new Set(parsedCurrencies.map(value => String(value).trim().toUpperCase()))];
  if (!eligibleCurrencies.length) throw new Error("At least one eligible package-qualification currency must be configured");

  const combineRaw = values["trading.packageQualification.combineEligibleWallets"] ?? "false";
  const repeatRaw = values["trading.packagePurchase.repeatAllowed"] ?? "false";
  if (!["true", "false"].includes(combineRaw) || !["true", "false"].includes(repeatRaw)) {
    throw new Error("Package activation boolean settings must be true or false");
  }
  const maxCopies = Number(values["trading.packagePurchase.maxCopies"] ?? "0");
  const cooldownSeconds = Number(values["trading.packagePurchase.cooldownSeconds"] ?? "21600");
  const repeatRestriction = (values["trading.packagePurchase.repeatRestriction"] ?? "active_only") as PackageQualificationPolicy["repeatRestriction"];
  if (!Number.isSafeInteger(maxCopies) || maxCopies < 0) throw new Error("Package max copies must be a non-negative integer");
  if (!Number.isSafeInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 31536000) throw new Error("Package activation cooldown must be between 0 and 31536000 seconds");
  if (!["active_only", "all_history"].includes(repeatRestriction)) throw new Error("Package repeat restriction must be active_only or all_history");

  return {
    eligibleCurrencies,
    combineEligibleWallets: combineRaw === "true",
    repeatAllowed: repeatRaw === "true",
    maxCopies,
    repeatRestriction,
    cooldownSeconds,
  };
}

export function calculateQualifyingBalanceUsdMinor(
  wallets: EligibleWalletBalance[],
  policy: Pick<PackageQualificationPolicy, "eligibleCurrencies" | "combineEligibleWallets">,
): number {
  const allowed = new Set(policy.eligibleCurrencies.map(currency => currency.toUpperCase()));
  const balances = wallets.filter(wallet => allowed.has(wallet.currency.toUpperCase())).map(wallet => {
    if (!Number.isSafeInteger(wallet.availableMinor) || wallet.availableMinor < 0 ||
        !Number.isInteger(wallet.scale) || wallet.scale < 0 || wallet.scale > 18 ||
        !Number.isFinite(wallet.usdRate) || wallet.usdRate <= 0) {
      throw new RangeError("Wallet qualification balance, currency scale, or USD rate is invalid");
    }
    const usdMinor = Math.floor((wallet.availableMinor / (10 ** wallet.scale)) * wallet.usdRate * 100 + 1e-9);
    if (!Number.isSafeInteger(usdMinor) || usdMinor < 0) throw new RangeError("Converted qualifying balance exceeds safe integer precision");
    return usdMinor;
  });
  const total = policy.combineEligibleWallets ? balances.reduce((sum, amount) => sum + amount, 0) : Math.max(0, ...balances);
  if (!Number.isSafeInteger(total)) throw new RangeError("Combined qualifying balance exceeds safe integer precision");
  return total;
}

/** Add calendar months while clamping to the last valid day of the target month. */
export function addCalendarMonths(from: Date, months: number): Date {
  if (!Number.isFinite(from.getTime()) || !Number.isSafeInteger(months) || months < 1 || months > 1200) {
    throw new RangeError("A valid activation time and duration of 1–1200 calendar months are required");
  }
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
