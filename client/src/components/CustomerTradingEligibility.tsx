import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import "./CustomerTradingEligibility.css";
import "./CustomerTradingEligibility.polish.css";

const usdEquivalent = (minor: number) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(minor / 100);

const durationLabel = (months: number) => `${months} ${months === 1 ? "month" : "months"}`;

// The visible inactive label is now "NO PACKAGE ASSIGNED" instead of the older "AWAITING TIER" wording.
export function CustomerTradingEligibility() {
  const eligibilityQuery = trpc.customer.tradingEligibility.useQuery(undefined, { refetchInterval: 30_000 });
  const data = eligibilityQuery.data;
  const currentPackage = data?.currentPackage;
  const nextPackage = data?.nextPackage;
  const qualifyingTotal = Number(data?.qualifyingDepositUsdMinor ?? 0);
  const nextThreshold = Number(nextPackage?.minimumQualifyingBalanceUsdMinor ?? 0);
  const progressPercent = nextThreshold > 0
    ? Math.min(100, Math.max(0, Math.round((qualifyingTotal / nextThreshold) * 100)))
    : 0;

  return (
    <section className="customer-panel trading-packages-panel" aria-labelledby="trading-eligibility-heading">
      <header className="trading-journey-header">
        <div className="trading-journey-intro">
          <div className="trading-journey-eyebrow"><Sparkles size={18} strokeWidth={2.5} aria-hidden="true" /> Your Trading Journey</div>
          <h2 className="trading-journey-title" id="trading-eligibility-heading">Package progress</h2>
          <div className={`trading-bot-status ${eligibilityQuery.isLoading ? "is-loading" : eligibilityQuery.isError ? "is-error" : currentPackage ? "is-active" : "is-inactive"}`} role="status" aria-live="polite">
            <span className="trading-bot-status-icon" aria-hidden="true">
              {eligibilityQuery.isLoading ? <Clock3 size={19} strokeWidth={2.5} /> : eligibilityQuery.isError ? <Info size={19} strokeWidth={2.5} /> : currentPackage ? <CheckCircle2 size={19} strokeWidth={2.5} /> : <WalletCards size={19} strokeWidth={2.5} />}
            </span>
            <span className="trading-status-copy">
              <strong className="trading-status-label">
                {eligibilityQuery.isLoading ? "CHECKING" : eligibilityQuery.isError ? "RETRY NEEDED" : currentPackage ? "PACKAGE ACTIVE" : "NO PACKAGE ASSIGNED"}
              </strong>
              <span className="trading-status-message">
                {eligibilityQuery.isLoading
                  ? "Checking your latest progress."
                  : eligibilityQuery.isError
                    ? "Your status could not load. Refresh to retry."
                    : currentPackage
                      ? `${currentPackage.name} is active. Your daily opportunity allowance is ready.`
                      : "Your package will be assigned automatically when you qualify."}
              </span>
            </span>
            {!eligibilityQuery.isLoading && !eligibilityQuery.isError && currentPackage && <span className="trading-bot-live-dot" aria-hidden="true" />}
          </div>
        </div>
        <button
          className="trading-journey-refresh"
          type="button"
          onClick={() => void eligibilityQuery.refetch()}
          disabled={eligibilityQuery.isFetching}
          aria-label="Refresh Trading package progress"
        >
          <RefreshCw size={16} strokeWidth={2.5} aria-hidden="true" className={eligibilityQuery.isFetching ? "animate-spin" : undefined} />
          {eligibilityQuery.isFetching ? "Updating…" : "Refresh"}
        </button>
      </header>

      {eligibilityQuery.isLoading ? (
        <div className="trading-package-loading" role="status" aria-live="polite">Loading package details…</div>
      ) : eligibilityQuery.isError ? (
        <div className="trading-package-error" role="alert">Couldn’t load package details. Refresh to retry.</div>
      ) : (
        <div className="trading-journey-content">
          {currentPackage ? (
            <article className="trading-tier-card trading-tier-card-current trading-current-package-layout" aria-labelledby="current-trading-package">
              <div className="trading-package-emblem trading-current-emblem" aria-hidden="true"><Sparkles size={54} strokeWidth={1.8} /></div>
              <div className="trading-current-package-main">
              <div className="trading-tier-card-head">
                <div className="trading-tier-heading">
                  <div className="trading-tier-kicker"><CheckCircle2 size={19} strokeWidth={2.5} aria-hidden="true" /> Milestone Package</div>
                  <h3 className="trading-tier-name" id="current-trading-package">{currentPackage.name}</h3>
                </div>
                <span className="trading-tier-state"><ShieldCheck size={17} strokeWidth={2.5} aria-hidden="true" /> Automatically assigned</span>
              </div>
              <div className="trading-tier-metrics">
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><CalendarClock size={21} strokeWidth={2.5} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Package duration</span>
                  <strong className="trading-tier-metric-value">{durationLabel(currentPackage.durationMonths)}</strong>
                </div>
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><Target size={21} strokeWidth={2.5} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Opportunities per day</span>
                  <strong className="trading-tier-metric-value trading-current-number">{currentPackage.opportunitiesPerDay}</strong>
                </div>
              </div>
              <p className="trading-tier-explainer"><Info size={17} strokeWidth={2.5} aria-hidden="true" />Your daily opportunity allowance updates automatically.</p>
              </div>
            </article>
          ) : (
            <article className="trading-tier-card trading-tier-card-current trading-no-package-card" aria-labelledby="not-yet-qualified">
              <div className="trading-tier-kicker"><WalletCards size={22} strokeWidth={2.5} aria-hidden="true" /> Milestone Package</div>
              <div className="trading-no-package-content">
                <span className="trading-no-package-icon" aria-hidden="true"><ShieldCheck size={34} strokeWidth={2.2} /></span>
                <div>
                  <h3 className="trading-tier-name" id="not-yet-qualified">No Package Assigned</h3>
                  
                  <p className="trading-tier-explainer"><Info size={17} strokeWidth={2.5} aria-hidden="true" />Your package will be assigned automatically when the qualifying threshold is met.</p>
                </div>
              </div>
            </article>
          )}

          {nextPackage ? (
            <article className="trading-tier-card trading-tier-card-next trading-next-package-layout" aria-labelledby="next-trading-package">
              <div className="trading-package-emblem trading-next-emblem" aria-hidden="true"><Sparkles size={54} strokeWidth={1.8} /></div>
              <div className="trading-next-package-main">
              <div className="trading-tier-card-head">
                <div className="trading-tier-heading">
                  <div className="trading-tier-kicker"><TrendingUp size={20} strokeWidth={2.5} aria-hidden="true" /> {currentPackage ? "Next Milestone Package" : "Milestone Package"}</div>
                  <h3 className="trading-tier-name" id="next-trading-package">{nextPackage.name}</h3>
                </div>
                <span className="trading-tier-state"><ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" /> Next level</span>
              </div>

              <div className="trading-threshold-panel">
                <div
                  className="trading-milestone-ring"
                  role="progressbar"
                  aria-label="Progress toward the next package qualification threshold"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  style={{ background: `conic-gradient(from -90deg, #4aa8ff 0%, #36e3d0 ${progressPercent}%, #203b4e ${progressPercent}%, #203b4e 100%)` }}
                >
                  <span>{progressPercent}%</span>
                </div>
                <div className="trading-threshold-details">
                  <span className="trading-threshold-label">
                    {currentPackage ? "Additional amount needed" : "Minimum amount needed"}
                    {currentPackage && <span className="sr-only">Additional qualifying amount needed</span>}
                  </span>
                  <div className="trading-threshold-value-row">
                    <strong className="trading-threshold-amount">{usdEquivalent(nextPackage.amountNeededUsdMinor)}</strong>
                  </div>
                  <span className="trading-threshold-unit">USD equivalent</span>
                  <div className="trading-progress-caption">
                    <span>Qualifying credits</span>
                    <strong>{usdEquivalent(qualifyingTotal)} <span aria-hidden="true">/</span> {usdEquivalent(nextThreshold)}</strong>
                  </div>
                  <div className="trading-progress-track" aria-hidden="true">
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className="trading-progress-note">Only qualifying credits manually issued by an administrator count. Your package is assigned automatically when you qualify.</span>
                  <span className="sr-only">Qualifying admin wallet credits are valued in USD at the rate recorded when credited.</span>
                </div>

              </div>

              <div className="trading-tier-metrics">
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><CalendarClock size={21} strokeWidth={2.5} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Next duration</span>
                  <strong className="trading-tier-metric-value">{durationLabel(nextPackage.durationMonths)}</strong>
                </div>
                <div className="trading-tier-metric trading-next-opportunities">
                  <span className="trading-tier-metric-icon"><Zap size={21} strokeWidth={2.5} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Extra daily opportunities</span>
                  <strong className="trading-tier-metric-value trading-next-number">+{nextPackage.additionalDailyOpportunities}</strong>
                </div>
              </div>
              <p className="trading-tier-explainer"><Info size={17} strokeWidth={2.5} aria-hidden="true" />Qualify for this milestone and your package will be assigned automatically, adding +{nextPackage.additionalDailyOpportunities} extra opportunities every day.</p>
              </div>
            </article>
          ) : (
            <div className="trading-no-next" aria-live="polite">
              <span className="trading-no-next-icon"><CheckCircle2 size={23} strokeWidth={2.5} aria-hidden="true" /></span>
              <div className="trading-no-next-copy">
                <h3>{currentPackage ? "You’ve reached the highest currently available package" : "No package milestone is available right now"}</h3>
                <p>{currentPackage ? "No higher package is available right now." : "Your first milestone will appear when a package is available."}</p>
              </div>
            </div>
          )}

          {(
            <div className="trading-total-allowance" aria-live="polite">
              <span className="trading-total-allowance-icon"><Sparkles size={25} strokeWidth={2.5} aria-hidden="true" /></span>
              <span className="trading-total-allowance-copy">
                <strong className="trading-total-allowance-label">Total Daily Opportunity Allowance</strong>
                <span className="trading-total-allowance-note">Combined across active packages</span>
              </span>
              <strong className="trading-total-allowance-value">{data?.dailyOpportunityAllowance ?? 0}</strong>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
