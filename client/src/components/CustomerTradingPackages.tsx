import { useState } from "react";
import { CheckCircle2, Clock3, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatUsdMinor(amount: number) {
  return "USD " + (Number(amount || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function activationBlockReason(reason: string | null, minimum: number) {
  if (reason === "insufficient_balance") {
    return "Your available balance is not sufficient to activate this package. Minimum qualifying balance: " + formatUsdMinor(minimum) + ".";
  }
  if (reason === "same_package_owned") return "This package is already active under the current repeat-purchase policy.";
  if (reason === "max_copies_reached") return "The configured maximum number of copies of this package has been reached.";
  if (reason === "activation_cooldown") return "Package activation is temporarily unavailable while the activation cooldown is active.";
  return null;
}

export function CustomerTradingPackages() {
  const packagesQuery = trpc.customer.tradingPackages.useQuery(undefined, { refetchInterval: 30_000 });
  const [notice, setNotice] = useState<string | null>(null);
  const activation = trpc.customer.activateTradingPackage.useMutation({
    onSuccess: async result => {
      setNotice(result.automaticTradeCount > 0
        ? "Package activated. " + result.automaticTradeCount + " eligible opportunity allocation(s) were recorded automatically."
        : "Package activated. The server will evaluate eligible opportunities automatically; no trade is created without an eligible opportunity and sufficient spendable funds.");
      await packagesQuery.refetch();
    },
    onError: error => setNotice(error.message),
  });

  const data = packagesQuery.data;
  const subscriptions = data?.subscriptions ?? [];
  const packages = data?.packages ?? [];

  return (
    <section className="customer-panel trading-packages-panel">
      <div className="customer-panel-head">
        <div>
          <div className="eyebrow">Package eligibility</div>
          <h2>Trading packages</h2>
          <p>Activation is free. The qualifying balance is an eligibility threshold, not a subscription payment or an automatic trade amount.</p>
        </div>
        <button className="text-button" type="button" onClick={() => void packagesQuery.refetch()} disabled={packagesQuery.isFetching}>
          Refresh <RefreshCw size={14} />
        </button>
      </div>

      {data && (
        <div className="trading-package-qualification">
          <div>
            <span>Qualifying wallet balance</span>
            <strong>{formatUsdMinor(data.qualifyingBalanceUsdMinor)}</strong>
          </div>
          <small>Eligible currencies: {data.qualifyingCurrencies.join(", ")} · {data.combineEligibleWallets ? "Eligible wallets may be combined" : "Each eligible wallet qualifies separately"}</small>
          {data.cooldownRemainingSeconds > 0 && (
            <small><Clock3 size={13} /> Package activation cooldown: {Math.ceil(data.cooldownRemainingSeconds / 60)} minute(s) remaining.</small>
          )}
        </div>
      )}

      {notice && <div className={activation.error ? "admin-ops-empty error" : "test-notice"} role="status">{notice}</div>}
      {packagesQuery.isLoading ? <div className="empty-state">Loading configured package terms…</div>
        : packagesQuery.isError ? <div className="admin-ops-empty error">Trading packages could not be loaded. No activation was attempted.</div>
        : packages.length === 0 ? <div className="empty-state">No trading packages are currently available.</div>
        : <div className="trading-package-grid">
          {packages.map(pkg => {
            const reason = activationBlockReason(pkg.blockReason, Number(pkg.minimumQualifyingBalanceUsdMinor));
            const busy = activation.isPending && activation.variables?.packageId === pkg.id;
            return (
              <article className="trading-package-card" key={pkg.id}>
                <div className="trading-package-card-head">
                  <div><span className="eyebrow">Package</span><h3>{pkg.name}</h3></div>
                  <PackageCheck size={20} />
                </div>
                <div className="trading-package-requirement">
                  <span>Minimum qualifying balance</span>
                  <strong>{formatUsdMinor(Number(pkg.minimumQualifyingBalanceUsdMinor))}</strong>
                </div>
                <div className="trading-package-terms">
                  <div><span>Duration</span><strong>{pkg.durationMonths} calendar month(s)</strong></div>
                  <div><span>Opportunities quota</span><strong>{pkg.opportunitiesPerDay} per day</strong></div>
                  <div><span>Terms version</span><strong>{pkg.termsVersion}</strong></div>
                </div>
                {reason && <p className="trading-package-block-reason">{reason}</p>}
                <button
                  className="primary-button wide"
                  type="button"
                  disabled={!pkg.canActivate || activation.isPending}
                  onClick={() => {
                    setNotice(null);
                    activation.mutate({ packageId: pkg.id, idempotencyKey: crypto.randomUUID() });
                  }}
                >
                  {busy ? "Activating…" : "Activate free package"}
                </button>
              </article>
            );
          })}
        </div>}

      {subscriptions.length > 0 && (
        <div className="trading-active-subscriptions">
          <div className="customer-panel-head"><div><div className="eyebrow">Current entitlements</div><h3>Active packages</h3></div><ShieldCheck size={16} /></div>
          {subscriptions.map(subscription => (
            <div className="trading-active-subscription" key={subscription.id}>
              <strong>{subscription.packageName}</strong>
              <span>Activated {new Date(subscription.activatedAt).toLocaleDateString()}</span>
              <span>Expires {subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : "No expiry configured"}</span>
            </div>
          ))}
        </div>
      )}
      <p className="trading-package-note"><CheckCircle2 size={14} /> A package activation does not itself debit trade capital. The trading worker allocates only when an eligible opportunity occurs and the server confirms sufficient spendable funds.</p>
    </section>
  );
}
