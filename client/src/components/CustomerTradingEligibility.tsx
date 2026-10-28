import { Activity, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function CustomerTradingEligibility() {
  const eligibilityQuery = trpc.customer.tradingEligibility.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <section className="customer-panel trading-packages-panel" aria-labelledby="trading-eligibility-heading">
      <div className="customer-panel-head">
        <div>
          <div className="eyebrow">Automatic eligibility</div>
          <h2 id="trading-eligibility-heading">Trading eligibility</h2>
          <p>Your eligibility and daily opportunity allowance are calculated automatically from qualifying manual administrator wallet credits. No tier selection or activation is required.</p>
        </div>
        <button className="text-button" type="button" onClick={() => void eligibilityQuery.refetch()} disabled={eligibilityQuery.isFetching}>
          Refresh <RefreshCw size={14} />
        </button>
      </div>

      {eligibilityQuery.isLoading ? (
        <div className="empty-state">Checking trading eligibility…</div>
      ) : eligibilityQuery.isError ? (
        <div className="admin-ops-empty error" role="alert">
          Trading eligibility could not be verified. No eligibility change was made. Please try again later.
        </div>
      ) : (
        <div className="trading-package-qualification">
          <div>
            <span>Eligibility status</span>
            <strong><ShieldCheck size={16} /> {eligibilityQuery.data?.eligible ? "Eligible" : "Not yet eligible"}</strong>
          </div>
          <div>
            <span>Daily opportunity allowance</span>
            <strong><Activity size={16} /> {eligibilityQuery.data?.dailyOpportunityAllowance ?? 0}</strong>
          </div>
          <small><Clock3 size={13} /> Opportunities are processed automatically when eligible opportunities occur. An allowance is not a promise that a trade or profit will occur.</small>
        </div>
      )}
    </section>
  );
}
