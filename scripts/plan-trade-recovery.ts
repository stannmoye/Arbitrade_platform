import { readFile } from "node:fs/promises";
import { z } from "zod";
import { buildTradeRecoveryPlan } from "../server/modules/trade-recovery-planner";

const evidenceSchema = z.object({
  tradeStatus: z.string(),
  settlementStatus: z.string(),
  principalMinor: z.number(),
  rewardCreditedMinor: z.number(),
  settlementReference: z.string().nullable(),
  principalLedgerCount: z.number(),
  principalLedgerAmountMinor: z.number().nullable(),
  rewardLedgerCount: z.number(),
  rewardLedgerAmountMinor: z.number().nullable(),
  rewardReservationStatus: z.string().nullable(),
  lifecycleEventCount: z.number(),
  walletUpdatedAtPresent: z.boolean(),
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
      const plan = buildTradeRecoveryPlan({
        tradeId: record.tradeId,
        evidence: record.evidence,
      });
      const context = record.context;
      if (!context) return plan;

      const contextReasons: string[] = [];
      if (context.walletMatchCount !== 1) {
        contextReasons.push("Expected exactly one wallet row for the trade user and currency; inspect wallet identity and schema evidence.");
      }
      if (context.reservationCount > 1) {
        contextReasons.push("Duplicate reward reservation rows exist for this trade.");
      }
      if (context.identityMismatchedLedgerRows.length > 0) {
        contextReasons.push("Ledger rows share a settlement reference but do not match the trade user and currency.");
      }
      if (contextReasons.length === 0) return plan;

      return {
        ...plan,
        classification: "MANUAL_FINANCIAL_REVIEW" as const,
        nextStep: "STOP_AND_RECONCILE_WALLET_AND_LEDGER" as const,
        reasons: [...plan.reasons, ...contextReasons],
        automatedMutationAllowed: false as const,
        plannedMutations: [] as [],
        requiresHumanReview: true as const,
      };
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
