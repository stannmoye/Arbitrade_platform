import { readFile } from "node:fs/promises";
import { z } from "zod";
import { buildTradeRecoveryPlan } from "../server/modules/trade-recovery-planner";
import { applyRecoveryContextSafety } from "../server/modules/trade-recovery-context";

const safeInteger = z.number().refine(Number.isSafeInteger, "Expected a safe integer.");
const nonNegativeSafeInteger = safeInteger.refine((value) => value >= 0, "Expected a non-negative safe integer.");

const evidenceSchema = z.object({
  tradeStatus: z.string(),
  settlementStatus: z.string(),
  principalMinor: nonNegativeSafeInteger,
  rewardCreditedMinor: nonNegativeSafeInteger,
  settlementReference: z.string().nullable(),
  principalLedgerCount: nonNegativeSafeInteger,
  principalLedgerAmountMinor: nonNegativeSafeInteger.nullable(),
  // Accept the original planner fixture and the collector's current output.
  rewardLedgerCount: nonNegativeSafeInteger.optional(),
  rewardLedgerAmountMinor: nonNegativeSafeInteger.nullable().optional(),
  grossProfitLedgerCount: nonNegativeSafeInteger.optional(),
  grossProfitLedgerAmountMinor: safeInteger.nullable().optional(),
  realizedGrossProfitMinor: safeInteger.optional(),
  platformFeeMinor: nonNegativeSafeInteger.optional(),
  netProfitMinor: safeInteger.optional(),
  platformFeeLedgerCount: nonNegativeSafeInteger.optional(),
  platformFeeLedgerAmountMinor: safeInteger.nullable().optional(),
  realizedLossLedgerCount: nonNegativeSafeInteger.optional(),
  realizedLossLedgerAmountMinor: safeInteger.nullable().optional(),
  settlementOutcome: z.string().optional(),
  feePolicyVersion: nonNegativeSafeInteger.optional(),
  platformFeeRateBps: nonNegativeSafeInteger.optional(),
  platformFeeRoundingMode: z.string().optional(),
  rewardReservationStatus: z.string().nullable(),
  lifecycleEventCount: nonNegativeSafeInteger,
  walletUpdatedAtPresent: z.boolean(),
}).superRefine((evidence, ctx) => {
  if (evidence.rewardLedgerCount === undefined && evidence.grossProfitLedgerCount === undefined) {
    ctx.addIssue({ code: "custom", message: "Missing rewardLedgerCount or grossProfitLedgerCount." });
  }
  if (evidence.rewardLedgerCount !== undefined && evidence.grossProfitLedgerCount !== undefined) {
    ctx.addIssue({ code: "custom", message: "Supply either legacy reward ledger fields or collector gross-profit ledger fields, not both." });
  }
});

const contextSchema = z.object({
  walletMatchCount: nonNegativeSafeInteger,
  reservationCount: nonNegativeSafeInteger,
  identityMismatchedLedgerRows: z.array(z.unknown()),
  scanCoverage: z.object({
    requestedLimit: nonNegativeSafeInteger,
    selectedTradeCount: nonNegativeSafeInteger,
    totalTradeCount: nonNegativeSafeInteger,
    complete: z.boolean(),
  }).optional(),
}).passthrough();

const inputSchema = z.array(z.object({
  tradeId: z.union([z.string(), z.number()]),
  evidence: evidenceSchema,
  context: contextSchema.optional(),
}));

async function main() {
  const file = process.argv[2];
  if (!file || file === "--help" || file === "-h") {
    console.log("Usage: pnpm db:plan-trade-recovery <evidence.json>");
    console.log("Input must be a JSON array of { tradeId, evidence } records.");
    console.log("Collector context is also checked for missing/duplicate wallets, duplicate reservations, and ledger identity mismatches.");
    console.log("This tool performs no database access and proposes no database or wallet writes.");
    process.exitCode = file ? 0 : 2;
    return;
  }

  try {
    const parsedJson: unknown = JSON.parse(await readFile(file, "utf8"));
    const records = inputSchema.parse(parsedJson);
    const plans = records.map((record) => {
      const source = record.evidence;
      const evidence = {
        ...source,
        rewardLedgerCount: source.grossProfitLedgerCount ?? source.rewardLedgerCount!,
        rewardLedgerAmountMinor: source.grossProfitLedgerAmountMinor ?? source.rewardLedgerAmountMinor!,
      };
      const plan = buildTradeRecoveryPlan({
        tradeId: record.tradeId,
        evidence,
      });
      return record.context ? applyRecoveryContextSafety(plan, record.context) : plan;
    });
    console.log(JSON.stringify({
      mode: "READ_ONLY_PLAN",
      databaseAccess: false,
      automatedMutationAllowed: false,
      plannedMutations: [],
      recordCount: plans.length,
      plans,
    }, null, 2));
  } catch (error) {
    console.error("Could not create trade recovery plan:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
