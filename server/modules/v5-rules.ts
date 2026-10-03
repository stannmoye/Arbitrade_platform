import Decimal from "decimal.js";
import { FixedMoney, quantize, type PrecisionConfig } from "../../shared/money";

export type OpportunityRuleInput = {
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "DISABLED" | "EXPIRED";
  startsAt?: Date | null;
  expiresAt?: Date | null;
  maxPurchases?: number | null;
  currentPurchases: number;
  userAlreadySucceeded: boolean;
  activePackage: boolean;
  activeInvestments: number;
  maxActiveInvestments: number;
};

export function assertEligibleForPurchase(input: OpportunityRuleInput, now = new Date()) {
  if (!input.activePackage) throw new Error("An active package is required for this opportunity");
  if (input.status !== "ACTIVE") throw new Error("This opportunity is not active");
  if (input.startsAt && input.startsAt.getTime() > now.getTime()) throw new Error("This opportunity has not started");
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) throw new Error("This opportunity has expired");
  if (input.userAlreadySucceeded) throw new Error("This opportunity has already been purchased successfully by this customer");
  if (input.maxPurchases !== null && input.maxPurchases !== undefined && input.currentPurchases >= input.maxPurchases) throw new Error("This opportunity has reached its purchase limit");
  if (input.maxActiveInvestments > 0 && input.activeInvestments >= input.maxActiveInvestments) throw new Error("The active-investment limit for this package has been reached");
}

export type WalletCandidate = { walletId: number; assetCode: string; available: FixedMoney; priority: number; eligible: boolean };
export type FundingSource = { walletId: number; assetCode: string; amount: string };

export function buildFundingPlan(destination: FixedMoney, wallets: WalletCandidate[], convert: (source: FixedMoney, sourceAsset: string) => FixedMoney) {
  const sources: FundingSource[] = [];
  let remaining = destination;
  const ordered = wallets.filter(wallet => wallet.eligible).sort((a, b) => a.priority - b.priority);
  for (const wallet of ordered) {
    if (remaining.isZero()) break;
    const convertedAvailable = convert(wallet.available, wallet.assetCode);
    const converted = convertedAvailable.value.lessThan(remaining.value) ? convertedAvailable : remaining;
    if (converted.isZero()) continue;
    const sourceAmount = converted.value.eq(convertedAvailable.value) ? wallet.available : wallet.available.multiply(converted.value.div(convertedAvailable.value));
    sources.push({ walletId: wallet.walletId, assetCode: wallet.assetCode, amount: sourceAmount.toString() });
    remaining = remaining.subtract(converted);
  }
  if (!remaining.isZero()) throw new Error("Insufficient eligible funds");
  return sources;
}

export type FxQuoteInput = { quotedAt: Date; validUntil: Date; rate: string; tolerance: string; observedRate?: string; now?: Date };
export function assertFxQuoteSafe(input: FxQuoteInput) {
  const now = input.now ?? new Date();
  if (input.validUntil.getTime() <= now.getTime()) throw new Error("FX quote has expired; request a fresh quote");
  const rate = new Decimal(input.rate);
  if (!rate.gt(0)) throw new Error("FX quote rate is invalid");
  if (input.observedRate !== undefined) {
    const observed = new Decimal(input.observedRate);
    const movement = observed.minus(rate).abs().div(rate);
    if (movement.gt(new Decimal(input.tolerance))) throw new Error("FX rate movement exceeds the configured tolerance");
  }
}

export type SettlementInput = { principal: FixedMoney; grossProfit: FixedMoney; fees: FixedMoney };
export function calculateSettlement(input: SettlementInput) {
  const takeHomeProfit = input.grossProfit.subtract(input.fees);
  const totalReturned = input.principal.add(takeHomeProfit);
  const status = takeHomeProfit.isNegative() ? "SETTLED_LOSS" : takeHomeProfit.isZero() ? "SETTLED_ZERO" : "SETTLED_PROFIT";
  return { status, takeHomeProfit, totalReturned } as const;
}

export function defaultPrecision(code: string): PrecisionConfig {
  if (code === "BTC") return { code, scale: 8, minimumUnit: "0.00000001", roundingMode: "down" };
  if (code === "ETH") return { code, scale: 18, minimumUnit: "0.000000000000000001", roundingMode: "down" };
  return { code, scale: 2, minimumUnit: "0.01", roundingMode: "half_up" };
}

export function fixed(value: string, asset: string) { return quantize(value, defaultPrecision(asset)); }
