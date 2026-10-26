import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0072_wallet_ledger_reconciliation_indexes.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const start = source.indexOf("export async function listWalletLedgerReconciliation(");
const end = source.indexOf("\nexport async function manuallySettleTrade(", start);
const implementation = source.slice(start, end);
const integrityStart = source.indexOf("export async function listTradeSettlementIntegrityIssues(");
const integrityEnd = source.indexOf("\nexport async function listWalletLedgerReconciliation(", integrityStart);
const integrity = source.slice(integrityStart, integrityEnd);

describe("wallet and settlement reconciliation read-only contract", () => {
  it("groups wallet, signed ledger, active trade and pending payout evidence independently", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("groupBy(customerBalances.userId, customerBalances.currency)");
    expect(implementation).toContain("groupBy(balanceLedger.userId, balanceLedger.currency)");
    expect(implementation).toContain("groupBy(tradePositions.userId, tradePositions.currency)");
    expect(implementation).toContain("groupBy(payoutRequests.userId, payoutRequests.currency)");
    expect(implementation).toContain("inspectWalletLedgerSnapshot");
    expect(implementation).toContain("inspectSettlementLedgerPostings");
  });

  it("does not mutate financial state and reports bounded scan metadata", () => {
    expect(implementation).not.toContain("tx.update(");
    expect(implementation).not.toContain("tx.insert(");
    expect(implementation).not.toContain("tx.delete(");
    expect(implementation).toContain("limit(safeLimit + 1)");
    expect(implementation).toContain("hasMoreWalletGroups");
    expect(implementation).toContain("nextBeforeTradeId");
    expect(implementation).toContain("ledgerEntriesTruncated");
    expect(implementation).toContain("walletScan");
    expect(implementation).toContain("settlementScan");
  });

  it("pages the existing settlement integrity scan rather than hiding the result limit", () => {
    expect(integrity).toContain("limit(safeLimit + 1)");
    expect(integrity).toContain("nextBeforeTradeId");
    expect(integrity).toContain("hasMore");
    expect(integrity).toContain(".filter((row) => row.issues.length > 0)");
    expect(integrity).not.toContain("tx.update(");
    expect(integrity).not.toContain("tx.insert(");
    expect(integrity).not.toContain("tx.delete(");
    expect(integrity).toContain('eq(tradePositions.status, "settled")');
  });

  it("registers query indexes in a forward migration without concealing duplicate wallet rows", () => {
    expect(schema).toContain("customer_balances_user_currency_idx");
    expect(schema).toContain("balance_ledger_user_currency_idx");
    expect(schema).toContain("balance_ledger_reference_idx");
    expect(schema).toContain("trade_positions_status_settlement_user_currency_idx");
    expect(schema).toContain("trade_positions_settlement_reference_idx");
    expect(migration).toContain("ADD INDEX");
    expect(migration).toContain("customer_balances_user_currency_idx");
    expect(migration).toContain("balance_ledger_reference_idx");
    expect(journal.entries).toContainEqual(expect.objectContaining({
      idx: 41,
      tag: "0072_wallet_ledger_reconciliation_indexes",
    }));
  });
  
  it("keeps the evidence-backed recovery case table aligned with its migration", () => {
    const recoveryMigration = readFileSync(new URL("../drizzle/0073_trade_settlement_recovery_cases.sql", import.meta.url), "utf8");
    expect(schema).toContain('mysqlTable("trade_settlement_recovery_cases"');
    for (const field of [
      "tradeId", "userId", "currency", "settlementReference", "correctionMode",
      "amountMinor", "evidenceReference", "evidenceSummary", "reason", "idempotencyKey",
      "status", "proposedBy", "approvedBy", "resolvedBy", "recoveryLedgerReference",
    ]) {
      expect(schema).toContain(field);
      expect(recoveryMigration).toContain('`' + field + '`');
    }
    expect(recoveryMigration).toContain("trade_settlement_recovery_idempotency_unique");
    expect(recoveryMigration).toContain("trade_settlement_recovery_ledger_reference_unique");
    expect(recoveryMigration).toContain("'pending_approval'");
    expect(journal.entries).toContainEqual(expect.objectContaining({
      idx: 42,
      tag: "0073_trade_settlement_recovery_cases",
    }));
  });

});