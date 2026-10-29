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
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import "./CustomerTradingEligibility.css";
import "./CustomerTradingEligibility.polish.css";

const usdEquivalent = (minor: number) => new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(minor / 100);

const durationLabel = (months: number) => `${months} ${months === 1 ? "month" : "months"}`;

const candleSticks = [
  { height: 25, shift: 3, up: true },
  { height: 38, shift: -4, up: true },
  { height: 29, shift: 2, up: false },
  { height: 48, shift: -7, up: true },
  { height: 35, shift: 4, up: false },
  { height: 55, shift: -5, up: true },
  { height: 43, shift: 3, up: true },
  { height: 62, shift: -6, up: true },
  { height: 47, shift: 4, up: false },
];

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
                {eligibilityQuery.isLoading ? "CHECKING" : eligibilityQuery.isError ? "RETRY NEEDED" : currentPackage ? "TIER ACTIVE" : "NO PACKAGE ASSIGNED"}
              </strong>
              <span className="trading-status-message">
                {eligibilityQuery.isLoading
                  ? "Checking your latest progress."
                  : eligibilityQuery.isError
                    ? "Your status could not load. Refresh to retry."
                    : currentPackage
                      ? `${currentPackage.name} is assigned automatically.`
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

      {!eligibilityQuery.isLoading && !eligibilityQuery.isError && (
        <div className={`trading-package-hero ${currentPackage ? "has-current-package" : "has-no-package"}`} aria-live="polite">
          <div className="trading-package-hero-emblem" aria-hidden="true">
            {currentPackage ? <ShieldCheck size={70} strokeWidth={1.7} /> : <WalletCards size={70} strokeWidth={1.7} />}
          </div>
          <div className="trading-package-hero-copy">
            <span className="trading-package-hero-eyebrow">PACKAGE PROGRESS</span>
            <h3>{currentPackage ? currentPackage.name : "No Package Assigned"}</h3>
            <p>{currentPackage ? "Your package is assigned automatically. Your daily opportunity allowance is shown below." : "Your account has not been assigned a trading package yet. You will be automatically assigned when you qualify."}</p>
          </div>
          <div className="trading-package-hero-chart" aria-hidden="true">
            <div className="trading-package-hero-chart-line" />
            {candleSticks.map((candle, index) => (
              <span className={`trading-hero-candle ${candle.up ? "is-up" : "is-down"}`} key={index} style={{ "--hero-candle-height": `${candle.height}%`, "--hero-candle-shift": `${candle.shift}px` } as React.CSSProperties}><i /></span>
            ))}
          </div>
        </div>
      )}

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
                  <div className="trading-tier-kicker"><CheckCircle2 size={19} strokeWidth={2.5} aria-hidden="true" /> Current Package</div>
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
                  <span className="sr-only">You’re not yet qualified for a package</span>
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
                  <div className="trading-tier-kicker"><TrendingUp size={20} strokeWidth={2.5} aria-hidden="true" /> {currentPackage ? "Milestone Package" : "Next Milestone Package"}</div>
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
                  <span className="sr-only">USD equivalent of qualifying admin wallet credits, valued at the rate recorded when credited.</span>
                </div>
                <div className="trading-candle-chart" aria-hidden="true">
                  <div className="trading-candle-chart-heading"><span>MARKET MOVEMENT</span><span className="trading-candle-chart-live"><i /> LIVE</span></div>
                  <div className="trading-candle-chart-grid">
                    {candleSticks.map((candle, index) => (
                      <span className={`trading-candle ${candle.up ? "is-up" : "is-down"} candle-${index + 1}`} key={index} style={{ "--candle-height": `${candle.height}%`, "--candle-shift": `${candle.shift}px` } as React.CSSProperties}>
                        <i />
                      </span>
                    ))}
                  </div>
                  <div className="trading-candle-chart-foot"><span>VISUAL INDICATOR</span><Activity size={14} strokeWidth={2.5} /></div>
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
              <p className="trading-tier-explainer"><Info size={17} strokeWidth={2.5} aria-hidden="true" />Unlocks extra daily opportunities.</p>
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

          {currentPackage && (
            <div className="trading-total-allowance" aria-live="polite">
              <span className="trading-total-allowance-icon"><Activity size={25} strokeWidth={2.5} aria-hidden="true" /></span>
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
