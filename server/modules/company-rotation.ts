export type ListedCompany = {
  id: number;
  name: string;
  ticker: string;
  exchangeCode: string;
  countryCode: string;
  sector: string | null;
  listingStatus: "active" | "suspended" | "delisted" | "unverified";
  lastVerifiedAt: Date | string | null;
};

export type RotationFilters = {
  countryCodes?: string[];
  sectors?: string[];
  excludedCompanyIds?: number[];
  verificationMaxAgeDays?: number;
};

const DEFAULT_VERIFICATION_MAX_AGE_DAYS = 180;

/** Filter only verified, actively listed companies. Missing metadata never qualifies. */
export function eligibleCompanies(companies: ListedCompany[], filters: RotationFilters = {}, now = new Date()) {
  const maxAgeDays = filters.verificationMaxAgeDays ?? DEFAULT_VERIFICATION_MAX_AGE_DAYS;
  const countryCodes = filters.countryCodes?.length ? new Set(filters.countryCodes.map(v => v.toUpperCase())) : null;
  const sectors = filters.sectors?.length ? new Set(filters.sectors.map(v => v.toLowerCase())) : null;
  const excluded = new Set(filters.excludedCompanyIds ?? []);
  return companies.filter(company => {
    if (!Number.isSafeInteger(company.id) || company.id <= 0 || excluded.has(company.id)) return false;
    if (company.listingStatus !== "active" || !company.ticker || !company.exchangeCode) return false;
    if (countryCodes && !countryCodes.has(company.countryCode.toUpperCase())) return false;
    if (sectors && (!company.sector || !sectors.has(company.sector.toLowerCase()))) return false;
    if (!company.lastVerifiedAt) return false;
    const verifiedAt = new Date(company.lastVerifiedAt).getTime();
    if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime()) return false;
    if (now.getTime() - verifiedAt > maxAgeDays * 86_400_000) return false;
    return true;
  });
}

/** Fisher–Yates shuffle; callers persist the resulting order/cycle for durable rotation. */
export function shuffledRotation<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error("Random source must return a value in [0, 1)");
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Creates a full cycle without repeats; filters out unavailable companies before selection. */
export function createRotationCycle(companies: ListedCompany[], filters: RotationFilters = {}, random: () => number = Math.random, now = new Date()) {
  const eligible = eligibleCompanies(companies, filters, now);
  if (!eligible.length) throw new Error("No currently verified active companies match the rotation filters.");
  return shuffledRotation(eligible, random);
}
