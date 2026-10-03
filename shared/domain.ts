export const PRACTICE_MODES = ["PRACTICE", "SIMULATION", "RESEARCH"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const OPPORTUNITY_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "DISABLED", "EXPIRED"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const PURCHASE_STATUSES = ["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "EXPIRED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const INVESTMENT_STATUSES = ["ACTIVE", "PENDING_SETTLEMENT", "SETTLED_PROFIT", "SETTLED_ZERO", "SETTLED_LOSS", "FAILED_SETTLEMENT", "CANCELLED", "REVERSED"] as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number];

export const JOB_STATUSES = ["QUEUED", "PROCESSING", "SENT", "COMPLETED", "FAILED", "RETRYING", "SKIPPED", "SUPPRESSED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = ["FUNDING", "CONVERSION", "FEE", "INVESTMENT_PRINCIPAL", "SETTLEMENT_PRINCIPAL", "SETTLEMENT_PROFIT", "SETTLEMENT_LOSS", "ADJUSTMENT", "REVERSAL"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
