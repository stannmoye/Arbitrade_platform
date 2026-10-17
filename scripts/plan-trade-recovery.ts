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

const inputSchema = z.array(z.object({
  tradeId: z.union([z.string(), z.number()]),
  evidence: evidenceSchema,
}));

async function main() {
  const file = process.argv[2];
  if (!file || file === "--help" || file === "-h") {
    console.log("Usage: pnpm db:plan-trade-recovery <evidence.json>");
    console.log("Input must be a JSON array of { tradeId, evidence } records.");
    console.log("This tool performs no database access and proposes no database or wallet writes.");
    process.exitCode = file ? 0 : 2;
    return;
  }

  try {
    const parsedJson: unknown = JSON.parse(await readFile(file, "utf8"));
    const records = inputSchema.parse(parsedJson);
    const plans = records.map(record => buildTradeRecoveryPlan({
      tradeId: record.tradeId,
      evidence: record.evidence,
    }));
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
