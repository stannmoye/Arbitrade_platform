import {
  Activity,
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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import "./CustomerTradingEligibility.css";

const usdEquivalent = (minor: number) => new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(minor / 100);

const durationLabel = (months: number) => `${months} ${months === 1 ? "month" : "months"}`;

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
          <div className="trading-journey-eyebrow"><Sparkles size={14} aria-hidden="true" /> Your Trading Journey</div>
          <h2 className="trading-journey-title" id="trading-eligibility-heading">Your package progress</h2>
          <div className={`trading-bot-status ${eligibilityQuery.isLoading ? "is-loading" : eligibilityQuery.isError ? "is-error" : currentPackage ? "is-active" : "is-inactive"}`} role="status" aria-live="polite">
            <span className="trading-bot-status-icon" aria-hidden="true">
              {eligibilityQuery.isLoading ? <Clock3 size={15} /> : eligibilityQuery.isError ? <Info size={15} /> : currentPackage ? <Activity size={15} /> : <Clock3 size={15} />}
            </span>
            <span>
              {eligibilityQuery.isLoading
                ? "Checking package status…"
                : eligibilityQuery.isError
                  ? "Package status unavailable — try again."
                  : currentPackage
                    ? `Automatic Trading Bot is active — ${currentPackage.name} allocated.`
                    : "Automatic Trading Bot is not yet active — No package is currently allocated."}
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
          <RefreshCw size={14} aria-hidden="true" className={eligibilityQuery.isFetching ? "animate-spin" : undefined} />
          {eligibilityQuery.isFetching ? "Updating…" : "Refresh"}
        </button>
      </header>

      {eligibilityQuery.isLoading ? (
        <div className="trading-package-loading" role="status" aria-live="polite">
          Checking your package progress and next milestone…
        </div>
      ) : eligibilityQuery.isError ? (
        <div className="trading-package-error" role="alert">
          Your package progress could not be verified right now. Your eligibility has not been changed. Please refresh shortly.
        </div>
      ) : (
        <div className="trading-journey-content">
          {currentPackage ? (
            <article className="trading-tier-card trading-tier-card-current" aria-labelledby="current-trading-package">
              <div className="trading-tier-card-head">
                <div className="trading-tier-heading">
                  <div className="trading-tier-kicker"><CheckCircle2 size={14} aria-hidden="true" /> Your current package</div>
                  <h3 className="trading-tier-name" id="current-trading-package">{currentPackage.name}</h3>
                </div>
                <span className="trading-tier-state"><ShieldCheck size={13} aria-hidden="true" /> Automatically assigned</span>
              </div>

              <div className="trading-tier-metrics">
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><CalendarClock size={17} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Package duration</span>
                  <strong className="trading-tier-metric-value">{durationLabel(currentPackage.durationMonths)}</strong>
                </div>
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><Target size={17} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Opportunities from this package per day</span>
                  <strong className="trading-tier-metric-value">{currentPackage.opportunitiesPerDay}</strong>
                </div>
              </div>
              <p className="trading-tier-explainer"><Info size={14} aria-hidden="true" />Your daily opportunity allowance updates automatically.</p>
            </article>
          ) : (
            <article className="trading-tier-card trading-tier-card-current" aria-labelledby="not-yet-qualified">
              <div className="trading-tier-kicker"><WalletCards size={14} aria-hidden="true" /> Your first milestone</div>
              <h3 className="trading-tier-name" id="not-yet-qualified">You’re not yet qualified for a package</h3>
              <p className="trading-tier-explainer"><Info size={14} aria-hidden="true" />Reach the threshold to unlock your first package.</p>
            </article>
          )}

          {nextPackage ? (
            <article className="trading-tier-card trading-tier-card-next" aria-labelledby="next-trading-package">
              <div className="trading-tier-card-head">
                <div className="trading-tier-heading">
                  <div className="trading-tier-kicker"><TrendingUp size={14} aria-hidden="true" /> {currentPackage ? "Your next milestone" : "Your first package"}</div>
                  <h3 className="trading-tier-name" id="next-trading-package">{nextPackage.name}</h3>
                </div>
                <span className="trading-tier-state"><ArrowUpRight size={13} aria-hidden="true" /> Next level</span>
              </div>

              <div className="trading-threshold-panel">
                <span className="trading-threshold-label">
                  {currentPackage ? "Additional qualifying amount needed" : "Minimum qualifying amount"}
                </span>
                <div className="trading-threshold-value-row"><strong className="trading-threshold-amount">{usdEquivalent(nextPackage.amountNeededUsdMinor)}</strong><span className="trading-threshold-unit">USD equivalent</span></div>
                <p className="trading-threshold-context">USD equivalent of qualifying admin wallet credits, valued at the rate recorded when credited.</p>
                <div className="trading-progress-block">
                  <div className="trading-progress-copy">
                    <span>Progress toward this milestone</span>
                    <strong>{progressPercent}%</strong>
                  </div>
                  <div
                    className="trading-progress-track"
                    role="progressbar"
                    aria-label="Progress toward the next package qualification threshold"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                  >
                    <div className="trading-progress-value" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="trading-tier-metrics">
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><CalendarClock size={17} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Next package duration</span>
                  <strong className="trading-tier-metric-value">{durationLabel(nextPackage.durationMonths)}</strong>
                </div>
                <div className="trading-tier-metric">
                  <span className="trading-tier-metric-icon"><Target size={17} aria-hidden="true" /></span>
                  <span className="trading-tier-metric-label">Additional daily opportunities</span>
                  <strong className="trading-tier-metric-value">+{nextPackage.additionalDailyOpportunities}</strong>
                </div>
              </div>
              <p className="trading-tier-explainer"><Info size={14} aria-hidden="true" />Unlocks additional daily opportunities.</p>
            </article>
          ) : (
            <div className="trading-no-next" aria-live="polite">
              <span className="trading-no-next-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
              <div className="trading-no-next-copy">
                <h3>{currentPackage ? "You’ve reached the highest currently available package" : "No package milestone is available right now"}</h3>
                <p>{currentPackage
                  ? "There is no higher enabled package at this time. Your current package details remain available above."
                  : "A first qualifying milestone will appear here when an administrator enables a package."}</p>
              </div>
            </div>
          )}

          {currentPackage && (
            <div className="trading-total-allowance" aria-live="polite">
              <span className="trading-total-allowance-icon"><Activity size={18} aria-hidden="true" /></span>
              <span className="trading-total-allowance-copy">
                <strong className="trading-total-allowance-label">Your total daily opportunity allowance</strong>
                <span className="trading-total-allowance-note">Combined allowance across your currently active packages</span>
              </span>
              <strong className="trading-total-allowance-value">{data?.dailyOpportunityAllowance ?? 0}</strong>
            </div>
          )}

        </div>
      )}
    </section>
  );
}
