export function assertExactlyOneSettlementClaim(affectedRows: unknown, reference: string): void {
  const count = Number(affectedRows);
  if (count !== 1) {
    const observed = Number.isFinite(count) ? String(count) : "unknown";
    throw new Error(
      `Mining settlement claim ${reference} expected exactly one pending-row update; received ${observed}. The surrounding transaction must roll back.`,
    );
  }
}
