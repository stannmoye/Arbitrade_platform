export type FeeRoundingMode = "half_up" | "half_even" | "down" | "up";

export type PackageFeePolicyVersion = {
  packageId: number;
  feeRateBps: number;
  roundingMode: FeeRoundingMode;
  version: number;
  effectiveAt: string | Date | null;
  changedBy: number | string | null;
  changedAt: string | Date | null;
  reason: string | null;
  [field: string]: unknown;
};

/**
 * Backward-compatible fee response shape: legacy flat fields describe the
 * latest mutation version; additive activePolicy/upcomingPolicy fields describe
 * the policy selected by allocation time. The two meanings must not be mixed.
 */
export type PackageFeePolicy = PackageFeePolicyVersion & {
  latestPolicy?: PackageFeePolicyVersion | null;
  latestPolicyVersion?: number;
  activePolicy?: PackageFeePolicyVersion | null;
  upcomingPolicy?: PackageFeePolicyVersion | null;
  versions?: PackageFeePolicyVersion[];
};

export type PackageFeePolicyState = {
  packageId: number;
  latestPolicy: PackageFeePolicyVersion;
  activePolicy: PackageFeePolicyVersion | null;
  upcomingPolicy: PackageFeePolicyVersion | null;
  latestPolicyVersion: number;
};

/** A missing fee-policy row is initialized through the version-zero contract. */
export function packageFeeExpectedVersion(policy?: PackageFeePolicyState | null): number {
  return policy?.latestPolicyVersion ?? 0;
}

export type PackageFeePolicyUpdate = {
  packageId: number;
  expectedVersion: number;
  feeRateBps: number;
  roundingMode: FeeRoundingMode;
  effectiveAt: string;
  reason: string;
};

export type DeliveryRetryPolicy = {
  policy: "none" | "temporary";
  maxAttempts: number;
  intervalsSeconds: number[];
  version: number;
  effectiveAt: string | Date | null;
  updatedBy: number | string | null;
  updatedAt: string | Date | null;
  reason: string | null;
  configured: boolean;
  [field: string]: unknown;
};

export type DeliveryRetryPolicyUpdate = {
  expectedVersion: number;
  policy: "none" | "temporary";
  maxAttempts: number;
  intervalsSeconds: number[];
  effectiveAt: string;
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFeeVersion(value: unknown, packageId: number): PackageFeePolicyVersion | null {
  if (!isRecord(value)) return null;
  const row = value as unknown as PackageFeePolicyVersion;
  if (!Number.isSafeInteger(Number(row.version)) || !Number.isSafeInteger(Number(row.feeRateBps)) || !row.roundingMode) return null;
  return { ...row, packageId: Number(row.packageId ?? packageId), version: Number(row.version), feeRateBps: Number(row.feeRateBps) };
}

/** Resolve both the latest mutation version and the policy active/upcoming by effective time. */
export function resolvePackageFeePolicy(input: unknown, packageId: number, now = Date.now()): PackageFeePolicyState | null {
  const policyRows = Array.isArray(input)
    ? input.filter((item) => isRecord(item) && Number(item.packageId) === packageId)
    : isRecord(input) && Array.isArray(input.policies)
      ? input.policies.filter((item) => isRecord(item) && Number(item.packageId) === packageId)
      : [];
  const root = policyRows.length
    ? policyRows.reduce((best, row) => {
        const version = Number((row as Record<string, unknown>).latestPolicyVersion ?? ((row as Record<string, unknown>).latestPolicy as Record<string, unknown> | undefined)?.version ?? (row as Record<string, unknown>).version ?? 0);
        const bestVersion = Number((best as Record<string, unknown>).latestPolicyVersion ?? ((best as Record<string, unknown>).latestPolicy as Record<string, unknown> | undefined)?.version ?? (best as Record<string, unknown>).version ?? 0);
        return version > bestVersion ? row : best;
      })
    : input;
  if (!isRecord(root)) return null;
  if (root.packageId !== undefined && Number(root.packageId) !== packageId) return null;

  const explicitLatest = asFeeVersion(root.latestPolicy, packageId);
  const rootAsVersion = asFeeVersion(root, packageId);
  const versionRows = [
    ...policyRows.flatMap((row) => {
      const record = row as Record<string, unknown>;
      return [
        ...(Array.isArray(record.versions) ? record.versions.map((version) => asFeeVersion(version, packageId)) : []),
        asFeeVersion(record.latestPolicy, packageId),
        asFeeVersion(record, packageId),
      ].filter((version): version is PackageFeePolicyVersion => Boolean(version));
    }),
    ...(Array.isArray(root.versions) ? root.versions.map((row) => asFeeVersion(row, packageId)).filter((row): row is PackageFeePolicyVersion => Boolean(row)) : []),
  ];
  const candidates = [...versionRows, ...(rootAsVersion && !versionRows.some((row) => row.version === rootAsVersion.version) ? [rootAsVersion] : [])];
  const latestPolicy = explicitLatest ?? candidates.reduce<PackageFeePolicyVersion | null>((best, row) => !best || row.version > best.version ? row : best, null);
  if (!latestPolicy) return null;

  const latestPolicyVersion = Number(root.latestPolicyVersion ?? latestPolicy.version);
  if (!Number.isSafeInteger(latestPolicyVersion) || latestPolicyVersion < latestPolicy.version) return null;

  const activeExplicit = Object.prototype.hasOwnProperty.call(root, "activePolicy");
  const upcomingExplicit = Object.prototype.hasOwnProperty.call(root, "upcomingPolicy");
  const activePolicy = activeExplicit
    ? asFeeVersion(root.activePolicy, packageId)
    : candidates
      .filter((row) => {
        const time = row.effectiveAt ? new Date(row.effectiveAt).getTime() : NaN;
        return Number.isFinite(time) && time <= now;
      })
      .sort((a, b) => new Date(b.effectiveAt as string | Date).getTime() - new Date(a.effectiveAt as string | Date).getTime() || b.version - a.version)[0] ?? null;
  const upcomingPolicy = upcomingExplicit
    ? asFeeVersion(root.upcomingPolicy, packageId)
    : candidates
      .filter((row) => {
        const time = row.effectiveAt ? new Date(row.effectiveAt).getTime() : NaN;
        return Number.isFinite(time) && time > now;
      })
      .sort((a, b) => new Date(a.effectiveAt as string | Date).getTime() - new Date(b.effectiveAt as string | Date).getTime() || b.version - a.version)[0] ?? null;

  return { packageId, latestPolicy, activePolicy, upcomingPolicy, latestPolicyVersion };
}

/** Parse a local datetime input only when it resolves to a future instant. */
export function parseFutureLocalDateTime(input: string, now = Date.now()): string | null {
  if (!input.trim()) return null;
  const timestamp = new Date(input).getTime();
  return Number.isFinite(timestamp) && timestamp > now ? new Date(timestamp).toISOString() : null;
}

/** Parse an exact local datetime for delivery policy edits; active policies may be replaced immediately. */
export function parseLocalDateTime(input: string): string | null {
  if (!input.trim()) return null;
  const timestamp = new Date(input).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Parse a decimal percentage into integer basis points without binary float arithmetic or rounding. */
export function parseFeePercentToBps(input: string): number | null {
  const value = input.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const whole = Number(match[1]);
  const fractionalBps = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + fractionalBps;
  return bps <= 10_000 ? bps : null;
}

export function formatFeeBpsAsPercent(bps: number | null | undefined): string {
  if (!Number.isSafeInteger(bps) || Number(bps) < 0) return "";
  return `${Math.floor(Number(bps) / 100)}.${String(Number(bps) % 100).padStart(2, "0")}`;
}

/** Delivery retry intervals are whole seconds from 5 through 3,600, one value per retry attempt. */
export function parseDeliveryIntervals(input: string): number[] | null {
  if (!input.trim()) return [];
  const pieces = input.split(",").map((part) => part.trim());
  if (pieces.some((part) => !/^\d+$/.test(part))) return null;
  const seconds = pieces.map(Number);
  if (seconds.length > 20 || seconds.some((value) => !Number.isSafeInteger(value) || value < 5 || value > 3_600)) return null;
  return seconds;
}
