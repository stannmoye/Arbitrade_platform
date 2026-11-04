import { randomInt as cryptoRandomInt } from "node:crypto";

export type OpportunityGenerationTemplateCurrency = "USD" | "EUR" | "GBP" | "BTC" | "ETH";

/**
 * Reusable, administrator-reviewed company-specific offer terms. Package return
 * rates and trade durations are deliberately not template fields: each must be
 * selected from the saved policy for the package receiving the opportunity.
 */
export type OpportunityGenerationTemplate = {
  templateName: string;
  companyReferenceId: string;
  symbol: string;
  venueFrom: string;
  venueTo: string;
  currency: OpportunityGenerationTemplateCurrency;
  minimumMinor: number;
  sourceReference: string;
  reviewNotes: string;
};

export type OpportunityGenerationPackageBounds = {
  minimumPayoutRateBps: number | null;
  maximumPayoutRateBps: number | null;
  minimumTradeDurationSeconds: number | null;
  maximumTradeDurationSeconds: number | null;
};

export type OpportunityGenerationTerms = Omit<OpportunityGenerationTemplate, "companyReferenceId"> & {
  companyReferenceId: string | null;
  configuredPayoutRateBps: number;
  tradeDurationSeconds: number;
  payoutSemantics: "configured_payout_not_market_earned_profit";
};

export type InclusiveIntegerSampler = (minimum: number, maximumExclusive: number) => number;

const CURRENCIES = new Set<OpportunityGenerationTemplateCurrency>(["USD", "EUR", "GBP", "BTC", "ETH"]);
const defaultSampler: InclusiveIntegerSampler = (minimum, maximumExclusive) =>
  cryptoRandomInt(minimum, maximumExclusive);

function normalizedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateText(name: string, value: unknown, maximumLength: number): string {
  const normalized = normalizedString(value);
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`${name} must contain 1–${maximumLength} non-whitespace characters.`);
  }
  return normalized;
}

/** Validates and trims a complete reusable template without permitting package-specific terms. */
export function validateOpportunityGenerationTemplate(input: unknown): OpportunityGenerationTemplate {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Opportunity generation template payload is required.");
  }
  const value = input as Record<string, unknown>;
  const allowedFields = new Set([
    "templateName", "companyReferenceId", "symbol", "venueFrom", "venueTo", "currency",
    "minimumMinor", "sourceReference", "reviewNotes",
  ]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new Error("Templates cannot set or override package payout rates or trade durations; extra fields are not allowed.");
  }
  const templateName = validateText("Template name", value.templateName, 120);
  const companyReferenceId = validateText("Company reference ID", value.companyReferenceId, 32);
  if (!/^logo-brand-\d{4}$/.test(companyReferenceId)) {
    throw new Error("Company reference ID must be an existing stable Logo ID from the company catalogue.");
  }
  const symbol = validateText("Symbol", value.symbol, 40);
  const venueFrom = validateText("Opening venue", value.venueFrom, 80);
  const venueTo = validateText("Closing venue", value.venueTo, 80);
  const sourceReference = validateText("Source reference", value.sourceReference, 160);
  const reviewNotes = validateText("Review notes", value.reviewNotes, 2000);
  if (typeof value.currency !== "string" || !CURRENCIES.has(value.currency as OpportunityGenerationTemplateCurrency)) {
    throw new Error("Template currency must be USD, EUR, GBP, BTC, or ETH.");
  }
  if (!Number.isSafeInteger(value.minimumMinor) || (value.minimumMinor as number) <= 0) {
    throw new Error("Minimum amount must be a positive safe integer in native minor units.");
  }
  return {
    templateName,
    companyReferenceId,
    symbol,
    venueFrom,
    venueTo,
    currency: value.currency as OpportunityGenerationTemplateCurrency,
    minimumMinor: value.minimumMinor as number,
    sourceReference,
    reviewNotes,
  };
}

/**
 * Build default terms from a brand catalogue identity without inventing a ticker or venue.
 * BRAND is an internal display sentinel, not a market instrument. Package rules supply
 * the capital bounds, configured return range and duration.
 */
export function createCatalogueIdentityOpportunityTemplate(
  company: { id: string; name: string },
  minimumMinor: number,
  currency: OpportunityGenerationTemplateCurrency = "USD",
): OpportunityGenerationTemplate {
  const companyReferenceId = validateText("Company reference ID", company?.id, 32);
  if (!/^logo-brand-\d{4}$/.test(companyReferenceId)) {
    throw new Error("Company reference ID must be an existing stable Logo ID from the company catalogue.");
  }
  const companyName = validateText("Company name", company?.name, 240);
  if (!Number.isSafeInteger(minimumMinor) || minimumMinor <= 0) {
    throw new Error("Package minimum amount must be a positive safe integer in native minor units.");
  }
  if (!CURRENCIES.has(currency)) throw new Error("Catalogue opportunity currency is not supported.");
  return {
    templateName: companyName.slice(0, 107) + " opportunity",
    companyReferenceId,
    symbol: "BRAND",
    venueFrom: "Informational",
    venueTo: "Informational",
    currency,
    minimumMinor,
    sourceReference: "company-catalogue:" + companyReferenceId,
    reviewNotes: "Brand identity only. This record does not assert a market listing, ticker, exchange, live price, or actual trade.",
  };
}

/**
 * Creates a valid informational opportunity identity when the current approved
 * company-display pool is empty. This is not a synthetic company and carries no
 * company reference, ticker, exchange, market quote, or execution claim.
 */
export function createUnattributedCatalogueOpportunityTemplate(
  minimumMinor: number,
  currency: OpportunityGenerationTemplateCurrency = "USD",
): Omit<OpportunityGenerationTemplate, "companyReferenceId"> & { companyReferenceId: null } {
  if (!Number.isSafeInteger(minimumMinor) || minimumMinor <= 0) {
    throw new Error("Package minimum amount must be a positive safe integer in native minor units.");
  }
  if (!CURRENCIES.has(currency)) throw new Error("Catalogue opportunity currency is not supported.");
  return {
    templateName: "Informational opportunity",
    companyReferenceId: null,
    symbol: "BRAND",
    venueFrom: "Informational",
    venueTo: "Informational",
    currency,
    minimumMinor,
    sourceReference: "company-catalogue:no-approved-company",
    reviewNotes: "No currently approved company identity was available. This informational opportunity is not associated with a company, ticker, exchange, market quote, or actual trade.",
  };
}

function assertBound(name: keyof OpportunityGenerationPackageBounds, value: unknown, minimum: number, maximum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${name} must be a configured safe integer from ${minimum} through ${maximum}.`);
  }
}

function chooseInclusiveInteger(minimum: number, maximum: number, sampler: InclusiveIntegerSampler): number {
  const selected = sampler(minimum, maximum + 1);
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new RangeError("Random sampler returned a value outside the package bounds.");
  }
  return selected;
}

/**
 * Selects fresh terms for one package from its persisted policy bounds. The
 * payout is configured by policy; it is not market-earned profit or evidence
 * of execution. Persist this selection with the opportunity and never reroll it
 * on retry or restart.
 */
export function selectOpportunityGenerationTerms(
  templateInput: unknown,
  packageBounds: OpportunityGenerationPackageBounds | null | undefined,
  sampler: InclusiveIntegerSampler = defaultSampler,
): OpportunityGenerationTerms {
  const template = templateInput && typeof templateInput === "object" && !Array.isArray(templateInput)
    && (templateInput as Record<string, unknown>).companyReferenceId === null
    ? createUnattributedCatalogueOpportunityTemplate(
      Number((templateInput as Record<string, unknown>).minimumMinor),
      (templateInput as Record<string, unknown>).currency as OpportunityGenerationTemplateCurrency,
    )
    : validateOpportunityGenerationTemplate(templateInput);
  if (!packageBounds || typeof packageBounds !== "object") {
    throw new Error("Saved package payout and duration settings are required.");
  }
  const { minimumPayoutRateBps, maximumPayoutRateBps, minimumTradeDurationSeconds, maximumTradeDurationSeconds } = packageBounds;
  assertBound("minimumPayoutRateBps", minimumPayoutRateBps, 1, 5000);
  assertBound("maximumPayoutRateBps", maximumPayoutRateBps, 1, 5000);
  assertBound("minimumTradeDurationSeconds", minimumTradeDurationSeconds, 10, 86400);
  assertBound("maximumTradeDurationSeconds", maximumTradeDurationSeconds, 10, 86400);
  if (minimumPayoutRateBps > maximumPayoutRateBps) {
    throw new RangeError("Minimum payout rate cannot exceed maximum payout rate.");
  }
  if (minimumTradeDurationSeconds > maximumTradeDurationSeconds) {
    throw new RangeError("Minimum trade duration cannot exceed maximum trade duration.");
  }
  return {
    ...template,
    configuredPayoutRateBps: chooseInclusiveInteger(minimumPayoutRateBps, maximumPayoutRateBps, sampler),
    tradeDurationSeconds: chooseInclusiveInteger(minimumTradeDurationSeconds, maximumTradeDurationSeconds, sampler),
    payoutSemantics: "configured_payout_not_market_earned_profit",
  };
}
