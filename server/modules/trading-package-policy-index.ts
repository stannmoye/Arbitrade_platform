/**
 * Match package policy rows using case-insensitive package identity semantics.
 * Ambiguous normalized identities fail closed rather than selecting an arbitrary row.
 */
export function normalizeTradingPackagePolicyKey(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("en-US");
}

export function indexTradingPackagePolicies<T extends { packageName: string }>(
  rows: readonly T[],
): Map<string, T> {
  const indexed = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const key = normalizeTradingPackagePolicyKey(row.packageName);
    if (!key || ambiguous.has(key)) continue;
    if (indexed.has(key)) {
      indexed.delete(key);
      ambiguous.add(key);
      continue;
    }
    indexed.set(key, row);
  }
  return indexed;
}
