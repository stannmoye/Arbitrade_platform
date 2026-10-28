import { Activity, CalendarClock, Clock3, RefreshCw, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

const usd = (minor: number) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
}).format(minor / 100);

export function CustomerTradingEligibility() {
  const eligibilityQuery = trpc.customer.tradingEligibility.useQuery(undefined, { refetchInterval: 30_000 });
  const data = eligibilityQuery.data;
  const currentPackage = data?.currentPackage;
  const nextPackage = data?.nextPackage;

  return (
    <section className="customer-panel trading-packages-panel" aria-labelledby="trading-eligibility-heading">
      <div className="customer-panel-head">
        <div>
          <div className="eyebrow">Your Trading Journey</div>
          <h2 id="trading-eligibility-heading">Your package progress</h2>
          <p>Your eligibility updates automatically from qualifying credits made by an authorized administrator. You never need to select or activate a package.</p>
        </div>
        <button className="text-button" type="button" onClick={() => void eligibilityQuery.refetch()} disabled={eligibilityQuery.isFetching}>
          Refresh <RefreshCw size={14} />
        </button>
      </div>

      {eligibilityQuery.isLoading ? (
        <div className="empty-state">Checking your package progress…</div>
      ) : eligibilityQuery.isError ? (
        <div className="admin-ops-empty error" role="alert">
          Your Trading eligibility could not be verified right now. Please refresh shortly.
        </div>
      ) : (
        <div className="trading-package-qualification">
          {currentPackage ? (
            <article className="customer-panel" aria-labelledby="current-trading-package">
              <div className="eyebrow">Your current package</div>
              <h3 id="current-trading-package">{currentPackage.name}</h3>
              <div className="trading-package-benefits">
                <div>
                  <CalendarClock size={18} aria-hidden="true" />
                  <span>Duration</span>
                  <strong>{currentPackage.durationMonths} {currentPackage.durationMonths === 1 ? "month" : "months"}</strong>
                </div>
                <div>
                  <Target size={18} aria-hidden="true" />
                  <span>Daily opportunities</span>
                  <strong>{data?.dailyOpportunityAllowance ?? 0}</strong>
                </div>
              </div>
              <p className="trading-package-note"><ShieldCheck size={15} aria-hidden="true" /> Your package is assigned automatically. Opportunities depend on eligibility, schedule, and available wallet balance; an allowance is not a promise of a trade or profit.</p>
            </article>
          ) : (
            <article className="customer-panel" aria-labelledby="not-yet-qualified">
              <div className="eyebrow">Your first milestone</div>
              <h3 id="not-yet-qualified">You’re not yet qualified for a package</h3>
              <p>Your first package unlocks when your cumulative qualifying admin credits reach the minimum threshold below.</p>
            </article>
          )}

          {nextPackage ? (
            <article className="customer-panel trading-next-package" aria-labelledby="next-trading-package">
              <div className="eyebrow">{currentPackage ? "Your next milestone" : "Your first package"}</div>
              <h3 id="next-trading-package">{nextPackage.name}</h3>
              <div className="trading-next-threshold">
                <span>{currentPackage ? "Additional qualifying amount needed" : "Minimum qualifying amount"}</span>
                <strong>{usd(nextPackage.amountNeededUsdMinor)}</strong>
                <small>USD equivalent of qualifying credits submitted through the admin portal only.</small>
              </div>
              <div className="trading-package-benefits">
                <div>
                  <CalendarClock size={18} aria-hidden="true" />
                  <span>Package duration</span>
                  <strong>{nextPackage.durationMonths} {nextPackage.durationMonths === 1 ? "month" : "months"}</strong>
                </div>
                <div>
                  <Target size={18} aria-hidden="true" />
                  <span>Additional daily opportunities</span>
                  <strong>+{nextPackage.additionalDailyOpportunities}</strong>
                </div>
              </div>
              <p className="trading-package-note"><TrendingUp size={15} aria-hidden="true" /> Qualifying for this tier adds its configured daily opportunity allowance to your active tiers while they remain eligible.</p>
            </article>
          ) : (
            <article className="customer-panel" aria-live="polite">
              <div className="eyebrow">Package progress</div>
              <h3>{currentPackage ? "You’ve reached the highest currently available tier" : "No package is currently available"}</h3>
              <p>{currentPackage ? "There is no higher enabled tier available at this time. Check back after the administrator updates the tier catalogue." : "A higher package milestone will appear here when an administrator enables a qualifying tier."}</p>
            </article>
          )}

          <div className="trading-package-allowance" aria-live="polite">
            <Activity size={16} aria-hidden="true" />
            <span>Current combined daily opportunity allowance</span>
            <strong>{data?.dailyOpportunityAllowance ?? 0}</strong>
          </div>
          <small><Clock3 size={13} aria-hidden="true" /> Package qualification is processed automatically by the server. No customer package list, selection, purchase, or activation is available.</small>
        </div>
      )}
    </section>
  );
}
