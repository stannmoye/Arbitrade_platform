export const WALLET_UNIQUE_INDEX_NAME = "uq_customer_balance_user_currency";

export async function ensureCustomerBalanceUniqueIndex(connection) {
  const [walletIndexes] = await connection.query(
    "SHOW INDEX FROM customer_balances WHERE Key_name=?",
    [WALLET_UNIQUE_INDEX_NAME],
  );
  if (walletIndexes.length) {
    return { created: false, reason: "index already exists" };
  }

  const [duplicates] = await connection.query(
    "SELECT userId,currency FROM customer_balances GROUP BY userId,currency HAVING COUNT(*)>1 LIMIT 1",
  );
  if (duplicates.length) {
    throw new Error(
      "Cannot create one-row-per-currency wallet protection: duplicate customer wallet rows require manual reconciliation first.",
    );
  }

  await connection.query(
    "ALTER TABLE customer_balances ADD UNIQUE INDEX uq_customer_balance_user_currency (userId,currency)",
  );
  return { created: true, reason: "index created" };
}
