import { readFile } from "node:fs/promises";
import { z } from "zod";
import { buildTradeRecoveryPlan } from "../server/modules/trade-recovery-planner";
import { applyRecoveryContextSafety } from "../server/modules/trade-recovery-context";

const evidenceSchema = z.object({
  tradeStatus: z.string(),
  settlementStatus: z.string(),
  principalMinor: z.number(),
  rewardCreditedMinor: z.number(),
  settlementReference: z.string().nullable(),
  principalLedgerCount: z.number(),
  principalLedgerAmountMinor: z.number().nullable(),
  // Accept the original planner fixture and the collector's current output.
  rewardLedgerCount: z.number().optional(),
  rewardLedgerAmountMinor: z.number().nullable().optional(),
  grossProfitLedgerCount: z.number().optional(),
  grossProfitLedgerAmountMinor: z.number().nullable().optional(),
  realizedGrossProfitMinor: z.number().optional(),
  platformFeeMinor: z.number().optional(),
  netProfitMinor: z.number().optional(),
  platformFeeLedgerCount: z.number().optional(),
  platformFeeLedgerAmountMinor: z.number().nullable().optional(),
  realizedLossLedgerCount: z.number().optional(),
  realizedLossLedgerAmountMinor: z.number().nullable().optional(),
  settlementOutcome: z.string().optional(),
  feePolicyVersion: z.number().optional(),
  platformFeeRateBps: z.number().optional(),
  platformFeeRoundingMode: z.string().optional(),
  rewardReservationStatus: z.string().nullable(),
  lifecycleEventCount: z.number(),
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
  walletMatchCount: z.number().int().nonnegative(),
  reservationCount: z.number().int().nonnegative(),
  identityMismatchedLedgerRows: z.array(z.unknown()),
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
