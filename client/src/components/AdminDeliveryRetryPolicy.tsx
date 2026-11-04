import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { parseDeliveryIntervals, parseLocalDateTime, validateDeliveryRetryDraft, type DeliveryRetryPolicy } from "../trading-settings-client-contracts";

function asLocalInput(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
}
function exactInstant(actual: unknown, expected: string) {
  const a = new Date(actual as string | Date).getTime();
  const b = new Date(expected).getTime();
  return Number.isFinite(a) && a === b;
}
export default function AdminDeliveryRetryPolicy() {
  const api = trpc.adminOperations as any;
  const query = api.deliveryRetryPolicy.useQuery(undefined, { refetchInterval: 30_000, refetchOnWindowFocus: true });
  const saveMutation = api.updateDeliveryRetryPolicy.useMutation();
  const policy = query.data as DeliveryRetryPolicy | undefined;
  const [selectedPolicy, setSelectedPolicy] = useState<"none" | "temporary">("none");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [intervalText, setIntervalText] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  useEffect(() => {
    if (!policy || dirty) return;
    setSelectedPolicy(policy.policy);
    setMaxAttempts(policy.configured ? String(policy.maxAttempts) : "");
    setIntervalText(policy.configured ? (policy.intervalsSeconds ?? []).join(", ") : "");
    setEffectiveAt(asLocalInput(policy.effectiveAt));
  }, [policy, dirty]);
  const intervals = parseDeliveryIntervals(intervalText);
  const attempts = /^\d+$/.test(maxAttempts) ? Number(maxAttempts) : NaN;
  const effectiveIso = parseLocalDateTime(effectiveAt);
  const temporaryUnavailable = !policy?.configured && selectedPolicy === "temporary";
  const validationErrors = validateDeliveryRetryDraft({ policy: selectedPolicy, maxAttempts: attempts, intervalsSeconds: intervals, effectiveAt: effectiveIso, reason, configured: Boolean(policy?.configured) });
  const valid = Boolean(policy && validationErrors.length === 0);
  const updateField = <K extends "selectedPolicy" | "maxAttempts" | "intervalText" | "effectiveAt" | "reason",>(key: K, value: K extends "selectedPolicy" ? "none" | "temporary" : string) => {
    setDirty(true);
    setMessage("");
    if (key === "selectedPolicy") setSelectedPolicy(value as "none" | "temporary");
    else if (key === "maxAttempts") setMaxAttempts(value as string);
    else if (key === "intervalText") setIntervalText(value as string);
    else if (key === "effectiveAt") setEffectiveAt(value as string);
    else setReason(value as string);
  };
  const save = async () => {
    if (!policy) {
      setMessageKind("error");
      setMessage("The saved shared retry policy is unavailable. Refresh before attempting a save.");
      return;
    }
    if (!valid || intervals === null || !effectiveIso) {
      setMessageKind("error");
      setMessage(validationErrors[0] ?? "Correct the retry settings before saving.");
      return;
    }
    const input = { expectedVersion: Number(policy.version), policy: selectedPolicy, maxAttempts: attempts, intervalsSeconds: selectedPolicy === "none" ? [] : intervals, effectiveAt: effectiveIso, reason: reason.trim() };
    setMessage("");
    try {
      const saved = await saveMutation.mutateAsync(input);
      const refreshed = await query.refetch();
      const persisted = refreshed.data as DeliveryRetryPolicy | undefined;
      const confirmed = Boolean(!refreshed.isError && persisted && persisted.policy === input.policy && Number(persisted.maxAttempts) === input.maxAttempts && JSON.stringify(persisted.intervalsSeconds ?? []) === JSON.stringify(input.intervalsSeconds) && Number(persisted.version) > input.expectedVersion && exactInstant(persisted.effectiveAt, String(saved?.effectiveAt ?? "")) && Number(saved?.version ?? saved?.policyVersion) === Number(persisted.version));
      if (!confirmed) throw new Error("The retry policy request completed, but a fresh read did not confirm policy, limits, interval sequence, version and effective time. Your draft remains available.");
      setDirty(false);
      setReason("");
      setMessageKind("success");
      setMessage(`Delivery retry policy saved and verified (v${String(persisted?.version ?? "—")}).`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Delivery retry policy could not be saved or verified.");
    }
  };
  return <div className="arb-page portal-page trade-delivery-retry-policy">
    <header className="portal-page-top"><div><div className="eyebrow">Trade Settings · one shared delivery-retry owner</div><h1>Retries &amp; Carry-Forward</h1><p>Configure one shared policy for temporary delivery failures. These are delivery retries only; financial execution and settlement remain under their existing server-owned safeguards.</p></div><button className="secondary-button" type="button" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={14}/> Refresh</button></header>
    {query.isLoading && <div role="status">Loading saved global delivery retry policy…</div>}
    {query.isError && <div role="alert">Global delivery retry policy could not be read. Editing remains unavailable. {query.error.message}</div>}
    {policy && <section className="settings-card" aria-label="Shared delivery retry policy">
      {!policy.configured && <div className="admin-policy-note" role="status"><strong>Delivery retry policy is unconfigured.</strong> No retry interval has been saved. Temporary retry cannot be saved until a shared policy is configured and confirmed.</div>}
      <div className="package-detail"><span>Current state</span><b>{policy.configured ? `${policy.policy} · version ${policy.version}` : "Unconfigured · disabled"}</b></div>
      {policy.configured && <dl className="package-fee-current"><div><dt>Maximum attempts</dt><dd>{policy.maxAttempts}</dd></div><div><dt>Delivery intervals</dt><dd>{policy.policy === "temporary" ? (policy.intervalsSeconds ?? []).map(value => `${value}s`).join(", ") || "Unavailable" : "None"}</dd></div><div><dt>Effective at</dt><dd>{policy.effectiveAt ? new Date(policy.effectiveAt).toLocaleString() : "Unavailable"}</dd></div><div><dt>Updated by</dt><dd>{policy.updatedBy ?? "Unavailable"}</dd></div><div><dt>Updated at</dt><dd>{policy.updatedAt ? new Date(policy.updatedAt).toLocaleString() : "Unavailable"}</dd></div><div><dt>Reason</dt><dd>{policy.reason || "Unavailable"}</dd></div></dl>}
      <div className="form-two">
        <label>Shared delivery retry policy<select value={selectedPolicy} disabled={saveMutation.isPending} onChange={event => updateField("selectedPolicy", event.target.value as "none" | "temporary")}><option value="none">No retry</option><option value="temporary" disabled={!policy.configured}>Retry temporary delivery failures</option></select><small>Policy applies to delivery events; it never changes trade execution retry timing. Temporary retries stay unavailable until a shared policy has first been configured and verified.</small></label>
        <label>Maximum delivery attempts<input type="number" min={1} max={20} step={1} inputMode="numeric" value={maxAttempts} disabled={saveMutation.isPending} onChange={event => updateField("maxAttempts", event.target.value)} /></label>
      </div>
      <label>Delivery-specific retry intervals (seconds)<input type="text" inputMode="numeric" value={intervalText} disabled={selectedPolicy !== "temporary" || saveMutation.isPending} placeholder="Enter a comma-separated sequence; none is prefilled" onChange={event => updateField("intervalText", event.target.value)} /><small>Required for temporary retries. Enter one whole-second interval per retry attempt, from 5 to 3,600 seconds. No intervals are prefilled. Do not use the separate tradeRetryDelaySeconds value.</small></label>
      <label>Effective at (your local time)<input type="datetime-local" value={effectiveAt} disabled={saveMutation.isPending} onChange={event => updateField("effectiveAt", event.target.value)} /><small>Set this to now or earlier to activate a replacement immediately; the server records the exact save instant. A future-effective change can only be saved before any configured policy is active; the server rejects overwriting an active policy with a future schedule. Existing retry timestamps are not rescheduled.</small></label>

      <label>Reason for shared delivery retry policy (required)<textarea minLength={5} maxLength={500} value={reason} disabled={saveMutation.isPending} onChange={event => updateField("reason", event.target.value)} /></label>
      {validationErrors.length > 0 && <div className="admin-ops-empty error" role="alert" aria-live="polite"><strong>Check these retry settings before saving:</strong><ul>{validationErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      {message && <div className={messageKind === "error" ? "admin-ops-empty error" : "test-notice"} role={messageKind === "error" ? "alert" : "status"} aria-live="polite">{message}</div>}
      <button className="primary-button" type="button" disabled={!valid || saveMutation.isPending || query.isFetching} aria-busy={saveMutation.isPending} onClick={() => void save()}>{saveMutation.isPending ? "Saving shared retry policy…" : "Save shared retry policy"} <Save size={14}/></button>
    </section>}
    <p className="admin-policy-note" role="note">Per-tier maxPendingDeliveries remains under Per-tier Delivery Schedule. Per-tier delivery-attempt and expiry-retry controls are not configured here or in tier forms; this page is the only owner. Carry-forward remains disabled unless the backend explicitly reports a configured supported policy.</p>
  </div>;
}
