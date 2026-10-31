export type NamedPolicyRow = { packageName: string };

/**
 * Build field-scoped policy updates from the last server snapshot.
 *
 * Only fields the administrator actually changed are sent. The database then
 * merges those fields against its row-locked current value, so another admin's
 * unrelated update is not overwritten by a stale browser snapshot.
 */
export function buildChangedPolicyPatches<T extends NamedPolicyRow>(
  baseline: readonly T[],
  current: readonly T[],
): Array<Partial<T> & Pick<T, "packageName">> {
  const baselineByName = new Map(baseline.map((row) => [row.packageName, row]));
  return current.flatMap((row) => {
    const previous = baselineByName.get(row.packageName);
    if (!previous) {
      throw new Error(`Cannot patch Trading policy "${row.packageName}" without a loaded baseline`);
    }
    const before = previous as unknown as Record<string, unknown>;
    const after = row as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = { packageName: row.packageName };
    for (const key of Object.keys(after)) {
      if (key === "packageName") continue;
      if (!Object.is(before[key], after[key])) patch[key] = after[key];
    }
    return Object.keys(patch).length > 1
      ? [patch as Partial<T> & Pick<T, "packageName">]
      : [];
  });
}
