export type OpportunityPackageRuleSnapshot = {
  packageId: number;
  packageName: string;
  policyVersion: number;
  minimumTradeMinor: number;
  maximumTradeMinor: number;
  minimumPayoutRateBps: number | null;
  maximumPayoutRateBps: number | null;
  minimumTradeDurationSeconds: number | null;
  maximumTradeDurationSeconds: number | null;
};

export type OpportunityPackageCompatibility = {
  checkedPackages: number;
  compatiblePackages: Array<{ packageId: number; packageName: string; policyVersion: number }>;
  incompatiblePackages: Array<{ packageId: number; packageName: string; policyVersion: number; reasons: string[] }>;
};

/**
 * Compares only administrator-published offer terms with persisted tier bounds.
 * It never fills, chooses, or synthesizes offer terms.
 */
export function assessOpportunityPackageCompatibility(offer: {
  minimumMinor: number;
  expectedRewardBps: number;
  durationSeconds: number;
}, packages: OpportunityPackageRuleSnapshot[]): OpportunityPackageCompatibility {
  const compatiblePackages: OpportunityPackageCompatibility["compatiblePackages"] = [];
  const incompatiblePackages: OpportunityPackageCompatibility["incompatiblePackages"] = [];
  for (const rule of packages) {
    const reasons: string[] = [];
    if (!Number.isSafeInteger(rule.minimumTradeMinor) || !Number.isSafeInteger(rule.maximumTradeMinor)
      || rule.minimumTradeMinor < 1 || rule.maximumTradeMinor < rule.minimumTradeMinor) {
      reasons.push("Package capital bounds are invalid.");
    } else if (offer.minimumMinor > rule.maximumTradeMinor) {
      reasons.push("Offer minimum exceeds the package maximum capital.");
    }
    if (rule.minimumPayoutRateBps === null || rule.maximumPayoutRateBps === null
      || offer.expectedRewardBps < rule.minimumPayoutRateBps || offer.expectedRewardBps > rule.maximumPayoutRateBps) {
      reasons.push("Published reward rate is outside the package payout-rate bounds.");
    }
    if (rule.minimumTradeDurationSeconds === null || rule.maximumTradeDurationSeconds === null
      || offer.durationSeconds < rule.minimumTradeDurationSeconds || offer.durationSeconds > rule.maximumTradeDurationSeconds) {
      reasons.push("Published duration is outside the package trade-duration bounds.");
    }
    if (reasons.length) incompatiblePackages.push({ packageId: rule.packageId, packageName: rule.packageName, policyVersion: rule.policyVersion, reasons });
    else compatiblePackages.push({ packageId: rule.packageId, packageName: rule.packageName, policyVersion: rule.policyVersion });
  }
  return { checkedPackages: packages.length, compatiblePackages, incompatiblePackages };
}
