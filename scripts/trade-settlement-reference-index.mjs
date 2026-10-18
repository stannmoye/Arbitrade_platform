export const TRADE_SETTLEMENT_REFERENCE_INDEX_NAME = "uq_trade_settlement_reference";

export async function ensureTradeSettlementReferenceUniqueIndex(connection) {
  const [indexes] = await connection.query(
    "SHOW INDEX FROM trade_positions WHERE Key_name=?",
    [TRADE_SETTLEMENT_REFERENCE_INDEX_NAME],
  );
  if (indexes.length) {
    return { created: false, reason: "index already exists" };
  }

  const [duplicates] = await connection.query(
    "SELECT settlementReference FROM trade_positions WHERE settlementReference IS NOT NULL GROUP BY settlementReference HAVING COUNT(*)>1 LIMIT 1",
  );
  if (duplicates.length) {
    throw new Error(
      "Cannot enforce unique trade settlement references: duplicate settlement references require manual reconciliation before migration.",
    );
  }

  await connection.query(
    "ALTER TABLE trade_positions ADD UNIQUE INDEX uq_trade_settlement_reference (settlementReference)",
  );
  return { created: true, reason: "index created" };
}
