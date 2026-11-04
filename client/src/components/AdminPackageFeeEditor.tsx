import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  formatFeeBpsAsPercent,
  packageFeeExpectedVersion,
  parseFeePercentToBps,
  parseFutureLocalDateTime,
  resolvePackageFeePolicy,
  validatePackageFeeDraft,
  type FeeRoundingMode,
  type PackageFeePolicyState,
} from "../trading-settings-client-contracts";

function localInput(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
}
function sameTime(actual: unknown, expected: string) {
  const a = new Date(actual as string | Date).getTime();
  const b = new Date(expected).getTime();
  return Number.isFinite(a) && a === b;
}

export default function AdminPackageFeeEditor({ packageId, policy, policyQueryLoaded, refreshPolicies }: {
  packageId: number;
  policy?: PackageFeePolicyState;
  policyQueryLoaded: boolean;
  refreshPolicies: () => Promise<{ data?: unknown; isError?: boolean }>;
}) {
  const api = trpc.adminOperations as any;
  const history = api.packageFeeHistory.useQuery({ packageId }, { enabled: packageId > 0, refetchOnWindowFocus: true });
  const update = api.updatePackageFeePolicy.useMutation();
  const latest = policy?.latestPolicy;
  const isInitialSetup = policyQueryLoaded && !policy;
  const canEdit = policyQueryLoaded && (!policy || Boolean(latest));
  const [percent, setPercent] = useState("");
  const [rounding, setRounding] = useState<FeeRoundingMode | "">("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  useEffect(() => {
    if (!dirty && latest) {
      setPercent(formatFeeBpsAsPercent(latest.feeRateBps));
      setRounding(latest.roundingMode);
      setEffectiveAt(localInput(latest.effectiveAt));
    }
  }, [latest, dirty]);
  const rateBps = parseFeePercentToBps(percent);
  const effectiveIso = parseFutureLocalDateTime(effectiveAt);
  const validationErrors = validatePackageFeeDraft({ feeRateBps: rateBps, roundingMode: rounding, effectiveAt: effectiveIso, reason });
  const save = async () => {
    if (!canEdit || (policy && !latest)) {
      setMessageKind("error");
      setMessage("Package fee settings are unavailable until the saved policy has loaded successfully.");
      return;
    }
    if (validationErrors.length) {
      setMessageKind("error");
      setMessage(validationErrors[0]);
      return;
    }
    if (!effectiveIso) {
      setMessageKind("error");
      setMessage("Choose a valid effective time in the future.");
      return;
    }
    setMessage("");
    setMessageKind("success");
    try {
      const expectedVersion = packageFeeExpectedVersion(policy);
      const saved = await update.mutateAsync({ packageId, expectedVersion, feeRateBps: rateBps, roundingMode: rounding, effectiveAt: effectiveIso, reason: reason.trim() });
      const refreshed = await refreshPolicies();
      const persisted = resolvePackageFeePolicy(refreshed.data, packageId);
      const mutationVersion = Number(saved?.version ?? saved?.policyVersion ?? saved?.latestPolicyVersion);
      const confirmed = Boolean(
        !refreshed.isError && persisted &&
        Number(persisted.latestPolicy.feeRateBps) === rateBps &&
        persisted.latestPolicy.roundingMode === rounding &&
        sameTime(persisted.latestPolicy.effectiveAt, effectiveIso) &&
        (isInitialSetup
          ? persisted.latestPolicyVersion === 1 && persisted.latestPolicy.version === 1 && mutationVersion === 1
          : persisted.latestPolicyVersion > expectedVersion && mutationVersion === persisted.latestPolicyVersion)
      );
      if (!confirmed) throw new Error(isInitialSetup
        ? "The fee setup completed, but a fresh read did not confirm the exact version-1 rate, rounding and effective time. Your draft is retained."
        : "The fee update completed, but a fresh read did not confirm the latest rate, rounding, mutation version and effective time. Your draft is retained.");
      setDirty(false);
      setReason("");
      setMessageKind("success");
      setMessage(isInitialSetup
        ? "Version-1 fee policy saved and verified. This package can use the configured fee for qualifying allocations after its effective time."
        : `Fee policy saved and verified as latest mutation v${persisted?.latestPolicyVersion}. It becomes active for qualifying new allocations only after its effective time.`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Fee policy could not be saved or verified.");
    }
  };
  const historyRows: any[] = Array.isArray(history.data) ? history.data : Array.isArray(history.data?.entries) ? history.data.entries : [];
  const localMinimum = localInput(new Date(Date.now() + 60_000));
  return <section className="settings-card package-fee-editor" aria-labelledby={`package-fee-${packageId}`}>
    <div className="eyebrow">Package fee policy · new allocations</div>
    <h3 id={`package-fee-${packageId}`}>Platform fee</h3>
    <p>Each allocation snapshots the fee policy selected using its allocation time. A change applies only to new allocations created after its effective time; it does not reprice an existing allocation based on a later settlement date.</p>
    {policy ? <dl className="package-fee-current">
      <div><dt>Latest mutation version</dt><dd>v{policy.latestPolicyVersion} · {formatFeeBpsAsPercent(latest?.feeRateBps)}% ({latest?.feeRateBps} bps)</dd></div>
      <div><dt>Active policy for new allocations now</dt><dd>{policy.activePolicy ? `v${policy.activePolicy.version} · ${formatFeeBpsAsPercent(policy.activePolicy.feeRateBps)}% · effective ${policy.activePolicy.effectiveAt ? new Date(policy.activePolicy.effectiveAt).toLocaleString() : "Unavailable"}` : "No active fee policy was returned"}</dd></div>
      <div><dt>Upcoming scheduled policy</dt><dd>{policy.upcomingPolicy ? `v${policy.upcomingPolicy.version} · ${formatFeeBpsAsPercent(policy.upcomingPolicy.feeRateBps)}% · effective ${policy.upcomingPolicy.effectiveAt ? new Date(policy.upcomingPolicy.effectiveAt).toLocaleString() : "Unavailable"}` : "None scheduled"}</dd></div>
      <div><dt>Latest change actor</dt><dd>{latest?.changedBy ?? "Unavailable"}</dd></div>
      <div><dt>Latest changed at</dt><dd>{latest?.changedAt ? new Date(latest.changedAt).toLocaleString() : "Unavailable"}</dd></div>
      <div><dt>Latest change reason</dt><dd>{latest?.reason || "Unavailable"}</dd></div>
    </dl> : isInitialSetup
      ? <p role="status"><strong>No package fee policy exists.</strong> Set up version 1 explicitly below; no fee rate is prefilled or copied from a global setting. Allocations for this package remain blocked until this setup is saved.</p>
      : <p role="status">Package fee policy editing is unavailable until the policy query successfully loads.</p>}
    {history.isError && <p role="alert">Fee history could not be loaded: {history.error.message}</p>}
    <details><summary>Version history ({historyRows.length})</summary>{history.isLoading ? <p role="status">Loading fee history…</p> : historyRows.length ? <ol>{historyRows.map((row: any, index: number) => <li key={String(row.id ?? row.version ?? index)}><strong>v{row.version ?? "—"}</strong> · {formatFeeBpsAsPercent(Number(row.feeRateBps))}% · {row.roundingMode ?? "—"} · effective {row.effectiveAt ? new Date(row.effectiveAt).toLocaleString() : "Unavailable"} · changed by {row.changedBy ?? "Unavailable"} · changed at {row.changedAt ? new Date(row.changedAt).toLocaleString() : "Unavailable"} · {row.reason ?? "No reason recorded"}</li>)}</ol> : <p>No fee versions returned.</p>}</details>
    <div className="form-two">
      <label>Draft fee rate (%)<input inputMode="decimal" type="text" value={percent} disabled={!canEdit || update.isPending} aria-describedby={`fee-help-${packageId}`} onChange={event => { setDirty(true); setMessage(""); setPercent(event.target.value); }} /><small id={`fee-help-${packageId}`}>Enter 0–100% in exact 0.01 percentage-point steps; no rounding is applied.</small></label>
      <label>Rounding mode<select value={rounding} disabled={!canEdit || update.isPending} onChange={event => { setDirty(true); setMessage(""); setRounding(event.target.value as FeeRoundingMode | ""); }}><option value="">Select rounding mode</option><option value="half_up">Half up</option><option value="half_even">Half even</option><option value="down">Down</option><option value="up">Up</option></select></label>
    </div>
    <label>Effective at (your local time)<input type="datetime-local" min={localMinimum} value={effectiveAt} disabled={!canEdit || update.isPending} onChange={event => { setDirty(true); setMessage(""); setEffectiveAt(event.target.value); }} /><small>Required future time, entered in your local time and saved as an exact UTC instant. After this instant, only subsequently created allocations use this fee policy; an allocation already created keeps its fee snapshot even if it settles later.</small></label>
    <label>Reason for this package fee change (required)<textarea maxLength={500} minLength={5} value={reason} disabled={!canEdit || update.isPending} onChange={event => { setDirty(true); setMessage(""); setReason(event.target.value); }} /></label>
    {validationErrors.length > 0 && <div className="admin-ops-empty error" role="alert" aria-live="polite"><strong>Check these fee settings before saving:</strong><ul>{validationErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    {message && <div className={messageKind === "error" ? "admin-ops-empty error" : "test-notice"} role={messageKind === "error" ? "alert" : "status"} aria-live="polite">{message}</div>}
    <button type="button" className="primary-button" disabled={!canEdit || update.isPending || validationErrors.length > 0} aria-busy={update.isPending} onClick={() => void save()}>{update.isPending ? "Saving package fee…" : isInitialSetup ? "Set up version 1 fee policy" : "Save package fee"} <Check size={14}/></button>
    <button type="button" className="secondary-button" onClick={() => void history.refetch()} disabled={history.isFetching}><RefreshCw size={14}/> Refresh history</button>
  </section>;
}
