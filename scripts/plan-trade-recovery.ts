import { readFile } from "node:fs/promises";
import { z } from "zod";
import { buildTradeRecoveryPlan } from "../server/modules/trade-recovery-planner";
import { applyRecoveryContextSafety } from "../server/modules/trade-recovery-context";

const safeInteger = z.number().refine(Number.isSafeInteger, "Expected a safe integer.");
const positiveSafeInteger = safeInteger.refine((value) => value > 0, "Expected a positive safe integer.");
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
  tradeId: positiveSafeInteger,
  userId: positiveSafeInteger,
  currency: z.string().trim().min(1),
  walletMatchCount: nonNegativeSafeInteger,
  wallet: z.object({
    id: positiveSafeInteger,
    userId: positiveSafeInteger,
    currency: z.string().trim().min(1),
    availableMinor: nonNegativeSafeInteger,
    lockedMinor: nonNegativeSafeInteger,
    promotionalMinor: nonNegativeSafeInteger,
    earnedMinor: nonNegativeSafeInteger,
  }).nullable(),
  reservationCount: nonNegativeSafeInteger,
  rewardReservationStatus: z.string().nullable(),
  reservation: z.array(z.object({
    id: positiveSafeInteger,
    tradeId: positiveSafeInteger,
    status: z.string().trim().min(1),
    reservedMinor: nonNegativeSafeInteger,
    currency: z.string().trim().min(1),
  })),
  identityMismatchedLedgerRows: z.array(z.unknown()),
  scanCoverage: z.object({
    requestedLimit: positiveSafeInteger,
    selectedTradeCount: nonNegativeSafeInteger,
    totalTradeCount: nonNegativeSafeInteger,
    complete: z.boolean(),
  }),
}).passthrough();

const inputSchema = z.array(z.object({
  tradeId: z.union([z.string(), z.number()]),
  evidence: evidenceSchema,
  context: contextSchema,
}));

async function main() {
  const file = process.argv[2];
  if (!file || file === "--help" || file === "-h") {
    console.log("Usage: pnpm db:plan-trade-recovery <evidence.json>");
    console.log("Input must be a JSON array of collector records containing { tradeId, evidence, context }.");
    console.log("Full collector context is required and checked for wallet/reservation snapshots, identity mismatches, and scan completeness.");
    console.log("This tool performs no database access and proposes no database or wallet writes.");
    process.exitCode = file ? 0 : 2;
    return;
  }

  try {
    const parsedJson: unknown = JSON.parse(await readFile(file, "utf8"));
    const records = inputSchema.parse(parsedJson);
    const plans = records.map((record) => {
      const source = record.evidence;
      const hasCollectorGrossProfitLedger = source.grossProfitLedgerCount !== undefined;
      const evidence = {
        ...source,
        rewardLedgerCount: hasCollectorGrossProfitLedger
          ? source.grossProfitLedgerCount!
          : source.rewardLedgerCount!,
        // null means the collector found no matching entry; preserve it instead of
        // accidentally replacing it with an undefined legacy field via ??.
        rewardLedgerAmountMinor: hasCollectorGrossProfitLedger
          ? source.grossProfitLedgerAmountMinor!
          : source.rewardLedgerAmountMinor!,
      };
      const plan = buildTradeRecoveryPlan({
        tradeId: record.tradeId,
        evidence,
      });
      return applyRecoveryContextSafety(plan, record.context);
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
