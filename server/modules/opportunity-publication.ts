export type OpportunityPublicationCurrency = "USD" | "EUR" | "GBP" | "BTC" | "ETH";

export type OpportunityOfferPublicationInput = {
  symbol: string;
  venueFrom: string;
  venueTo: string;
  currency: OpportunityPublicationCurrency;
  minimumMinor: number;
  expectedRewardBps: number;
  durationSeconds: number;
  sourceReference: string;
  reviewNotes: string;
  opensAt?: Date;
  closesAt?: Date;
  rewardAt?: Date;
};

export type ValidatedOpportunityOfferPublication = Omit<OpportunityOfferPublicationInput, "opensAt" | "closesAt" | "rewardAt"> & {
  opensAt?: Date;
  closesAt?: Date;
  rewardAt?: Date;
};

export type OpportunityOfferClosureInput = { offerId: number; reason: string };

export function validateOpportunityOfferClosure(input: OpportunityOfferClosureInput): OpportunityOfferClosureInput {
  if (!input || typeof input !== "object") throw new Error("Opportunity closure payload is required.");
  if (!Number.isSafeInteger(input.offerId) || input.offerId <= 0) throw new Error("Opportunity ID must be a positive safe integer.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 2000) throw new Error("Closure reason must contain 1–2,000 characters.");
  return { offerId: input.offerId, reason };
}

const CURRENCIES = new Set<OpportunityPublicationCurrency>(["USD", "EUR", "GBP", "BTC", "ETH"]);

export function validateOpportunityOfferPublication(input: OpportunityOfferPublicationInput): ValidatedOpportunityOfferPublication {
  if (!input || typeof input !== "object") throw new Error("Opportunity publication payload is required.");
  const symbol = typeof input.symbol === "string" ? input.symbol.trim() : "";
  const venueFrom = typeof input.venueFrom === "string" ? input.venueFrom.trim() : "";
  const venueTo = typeof input.venueTo === "string" ? input.venueTo.trim() : "";
  const sourceReference = typeof input.sourceReference === "string" ? input.sourceReference.trim() : "";
  const reviewNotes = typeof input.reviewNotes === "string" ? input.reviewNotes.trim() : "";
  if (!symbol || symbol.length > 40) throw new Error("Symbol must contain 1–40 characters.");
  if (!venueFrom || venueFrom.length > 80) throw new Error("Opening venue must contain 1–80 characters.");
  if (!venueTo || venueTo.length > 80) throw new Error("Closing venue must contain 1–80 characters.");
  if (!CURRENCIES.has(input.currency)) throw new Error("Opportunity currency is not supported.");
  if (!Number.isSafeInteger(input.minimumMinor) || input.minimumMinor <= 0) throw new Error("Minimum amount must be a positive safe integer in native minor units.");
  if (!Number.isSafeInteger(input.expectedRewardBps) || input.expectedRewardBps < 1 || input.expectedRewardBps > 5000) {
    throw new Error("Expected reward basis points must be from 1 through 5,000.");
  }
  if (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 10 || input.durationSeconds > 86400) {
    throw new Error("Opportunity duration must be from 10 through 86,400 seconds.");
  }
  if (!sourceReference || sourceReference.length > 160) throw new Error("Source reference must contain 1–160 characters.");
  if (!reviewNotes || reviewNotes.length > 2000) throw new Error("Review notes must contain 1–2,000 characters.");

  const opensAt = validateOptionalDate(input.opensAt, "Opening time");
  const closesAt = validateOptionalDate(input.closesAt, "Expiry time");
  const rewardAt = validateOptionalDate(input.rewardAt, "Reward time");
  if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
    throw new Error("Opportunity expiry must be later than its opening time.");
  }
  if (closesAt && rewardAt && rewardAt.getTime() < closesAt.getTime()) {
    throw new Error("Reward time must not precede opportunity expiry.");
  }

  return {
    symbol,
    venueFrom,
    venueTo,
    currency: input.currency,
    minimumMinor: input.minimumMinor,
    expectedRewardBps: input.expectedRewardBps,
    durationSeconds: input.durationSeconds,
    sourceReference,
    reviewNotes,
    ...(opensAt ? { opensAt } : {}),
    ...(closesAt ? { closesAt } : {}),
    ...(rewardAt ? { rewardAt } : {}),
  };
}

function validateOptionalDate(value: Date | undefined, label: string): Date | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return value;
}
