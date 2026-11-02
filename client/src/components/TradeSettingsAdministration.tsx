import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Check, RefreshCw, ShieldAlert } from "lucide-react";

const globalFields = [
  ["tierPolicyMaster", "Tier policy master", "Allows the server to consider otherwise-valid enabled tiers."],
  ["popupDelivery", "Pop-up delivery", "Allows new informational customer pop-ups; it never enables financial execution."],
  ["companyRotation", "Company rotation", "Allows approved catalogue identities to appear when a valid identity is available."],
  ["randomizedTiming", "Randomized timing", "Uses the saved timing bounds; it never exceeds the configured maximum."],
  ["burstDelivery", "Burst delivery", "Allows only the bounded per-cycle delivery batch."],
  ["requirePreviousSettlement", "Require previous settlement", "Safety gate for future allocations; disabling requires a detailed reason."],
] as const;

type GlobalField = (typeof globalFields)[number][0];

export function AdminTradePackageConfiguration() {
  const query = trpc.adminOperations.tradeGlobalSettings.useQuery(undefined, { refetchInterval: 15000 });
  const save = trpc.adminOperations.updateTradeGlobalSettings.useMutation({ onSuccess: () => { void query.refetch(); setMessage("Global settings saved and verified from the database."); }, onError: error => setMessage(error.message) });
  const [draft, setDraft] = useState<Partial<Record<GlobalField, boolean>>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const settings = query.data?.settings;

  useEffect(() => {
    if (settings?.available) setDraft(Object.fromEntries(globalFields.map(([key]) => [key, Boolean(settings[key])])) as Partial<Record<GlobalField, boolean>>);
  }, [settings]);

  const update = (key: GlobalField) => setDraft(current => ({ ...current, [key]: !current[key] }));
  const saveDraft = () => save.mutate({ ...draft, reason: reason.trim() });

  return <div className="arb-page portal-page">
    <div className="portal-page-top"><div><div className="eyebrow">Trade Settings · single global owner</div><h1>Package Configuration</h1><p>Global masters apply across applicable packages. Existing trades, entitlements and settlements keep their saved snapshots.</p></div><button className="primary-button" type="button" onClick={saveDraft} disabled={!settings?.available || save.isPending || reason.trim().length < 5}><Check size={15}/>{save.isPending ? "Saving…" : "Save global settings"}</button></div>
    {query.isLoading && <div className="empty-state">Loading persisted global settings…</div>}
    {query.isError && <div className="admin-ops-empty error" role="alert">Global settings are unavailable. Nothing is assumed enabled. <button className="secondary-button" type="button" onClick={() => void query.refetch()}><RefreshCw size={14}/>Retry</button></div>}
    {settings && !settings.available && <div className="admin-ops-empty error" role="alert"><ShieldAlert size={16}/>The forward-only global migration is missing or malformed. Apply the reviewed migration before editing this page.</div>}
    {settings?.available && <>
      <div className="admin-control-card" style={{ marginBottom: 18 }}><div className="package-detail"><span>Migration status</span><b>Version {settings.migrationVersion} · fail-closed</b></div><small>Automatic financial execution is permanently locked OFF. Legacy safety pause: {settings.legacySafetyPaused ? "active" : "not reported"}.</small></div>
      <div className="policy-grid-admin">{globalFields.map(([key, label, explanation]) => <div className="policy-card-admin" key={key}><div><h2>{label}</h2><p>{explanation}</p><small>Global scope · future allocations/delivery only</small></div><button className={`toggle-switch ${draft[key] ? "on" : ""}`} type="button" onClick={() => update(key)} aria-label={`Toggle ${label}`}>{draft[key] ? "ON" : "OFF"}</button></div>)}</div>
      <label className="admin-control-card" style={{ display: "block", marginTop: 18 }}>Reason for change (required)<textarea rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the operational or safety reason."/><small>{reason.trim().length}/500 characters</small></label>
    </>}
    {message && <div className="test-notice" role="status">{message}</div>}
  </div>;
}

export function AdminTradePackageSettings() {
  const packages = trpc.adminOperations.tradingPackages.useQuery(undefined, { refetchInterval: 15000 });
  const policies = trpc.adminOperations.packagePolicies.useQuery(undefined, { refetchInterval: 15000 });
  const save = trpc.adminOperations.updatePackagePolicies.useMutation({ onSuccess: () => { void policies.refetch(); setMessage("Package fee policy saved and verified from the database."); }, onError: error => setMessage(error.message) });
  const [selected, setSelected] = useState("");
  const [minimum, setMinimum] = useState(1500);
  const [maximum, setMaximum] = useState(1500);
  const [rounding, setRounding] = useState<"up" | "down" | "half_up" | "half_even">("up");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const policy = useMemo(() => (policies.data ?? []).find((row: any) => row.packageName === selected) as any, [policies.data, selected]);

  useEffect(() => {
    const first = packages.data?.[0]?.name;
    if (!selected && first) setSelected(first);
  }, [packages.data, selected]);
  useEffect(() => {
    if (policy) { setMinimum(Number(policy.minimumPlatformFeeBps ?? 1500)); setMaximum(Number(policy.maximumPlatformFeeBps ?? 1500)); setRounding((policy.platformFeeRoundingMode ?? "up") as typeof rounding); }
  }, [policy]);

  const savePolicy = () => save.mutate({ reason: reason.trim(), policies: [{ packageName: selected, minimumPlatformFeeBps: minimum, maximumPlatformFeeBps: maximum, platformFeeRoundingMode: rounding }] });
  return <div className="arb-page portal-page">
    <div className="portal-page-top"><div><div className="eyebrow">Trade Settings · one package owner</div><h1>Package Settings</h1><p>Edit package terms here. Fee bounds apply only to future opportunities; the selected rate and policy version must be snapshotted before settlement.</p></div><button className="primary-button" type="button" onClick={savePolicy} disabled={!selected || save.isPending || reason.trim().length < 5}><Check size={15}/>{save.isPending ? "Saving…" : "Save package fee policy"}</button></div>
    {policies.isError && <div className="admin-ops-empty error" role="alert">Package policies are unavailable or incomplete. No defaults are created automatically.</div>}
    <div className="admin-control-card"><label>Package<select value={selected} onChange={event => setSelected(event.target.value)}>{(packages.data ?? []).map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><div className="settings-form-grid"><label>Minimum platform fee (basis points)<input type="number" min={0} max={10000} value={minimum} onChange={event => setMinimum(Number(event.target.value))}/></label><label>Maximum platform fee (basis points)<input type="number" min={0} max={10000} value={maximum} onChange={event => setMaximum(Number(event.target.value))}/></label><label>Rounding rule<select value={rounding} onChange={event => setRounding(event.target.value as typeof rounding)}><option value="up">Ceiling / round up</option><option value="down">Round down</option><option value="half_up">Half up</option><option value="half_even">Half even</option></select></label></div><p className="admin-policy-note">The fee base is realized positive gross profit only. Principal, loss, zero-profit and expected returns are never charged. “Round up” means ceiling at the currency minor-unit boundary.</p><label>Reason for change (required)<textarea rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the package-term change."/></label></div>
    {message && <div className="test-notice" role="status">{message}</div>}
  </div>;
}
