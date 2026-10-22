/**
 * Fail closed when a conditional SQL mutation did not update exactly one row.
 *
 * Drizzle's mysql2 driver returns a tuple whose first item is the MySQL
 * ResultSetHeader. Requiring an explicit affectedRows value avoids silently
 * accepting a lost conditional update during financial state transitions.
 */
export function assertExactlyOneAffectedRow(result: unknown, operation: string): void {
  const header = Array.isArray(result) ? result[0] : result;
  const affectedRows =
    header && typeof header === "object" && "affectedRows" in header
      ? Number((header as { affectedRows: unknown }).affectedRows)
      : Number.NaN;

  if (!Number.isSafeInteger(affectedRows) || affectedRows !== 1) {
    const actual = Number.isFinite(affectedRows) ? String(affectedRows) : "unknown";
    throw new Error(`${operation} expected exactly one affected row; got ${actual}`);
  }
}
