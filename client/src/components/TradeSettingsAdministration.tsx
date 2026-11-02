import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

type RoundingMode = "up" | "down" | "half_up" | "half_even";
type PackageDraft = {
  name: string;
  minimumQualifyingBalanceUsdMinor: number | "";
  durationMonths: number | "";
  opportunitiesPerDay: number | "";
  maxPopupsPerDay: number | "";
  maxActiveInvestments: number | "";
  startsAt: string;
  expiresAt: string;
  enabled: boolean;
  minimumPlatformFeeBps: number | "";
  maximumPlatformFeeBps: number | "";
  platformFeeRoundingMode: RoundingMode;
};

const toInputDateTime = (value: unknown) => value ? new Date(String(value)).toISOString().slice(0, 16) : "";
const packageDraftFrom = (item: any, policy: any): PackageDraft => ({
  name: String(item?.name ?? ""),
  minimumQualifyingBalanceUsdMinor: Number(item?.minimumQualifyingBalanceUsdMinor ?? 0),
  durationMonths: Number(item?.durationMonths ?? 1),
  opportunitiesPerDay: Number(item?.opportunitiesPerDay ?? 1),
  maxPopupsPerDay: Number(item?.maxPopupsPerDay ?? 0),
  maxActiveInvestments: Number(item?.maxActiveInvestments ?? 0),
  startsAt: toInputDateTime(item?.startsAt),
  expiresAt: toInputDateTime(item?.expiresAt),
  enabled: Boolean(item?.enabled),
  minimumPlatformFeeBps: Number(policy?.minimumPlatformFeeBps ?? 1500),
  maximumPlatformFeeBps: Number(policy?.maximumPlatformFeeBps ?? 1500),
  platformFeeRoundingMode: (policy?.platformFeeRoundingMode ?? "up") as RoundingMode,
});

export function AdminTradePackageSettings() {
  const packages = trpc.adminOperations.tradingPackages.useQuery(undefined, { refetchInterval: 15000 });
  const policies = trpc.adminOperations.packagePolicies.useQuery(undefined, { refetchInterval: 15000 });
  const updateSettings = trpc.adminOperations.updateTradingPackageSettings.useMutation();
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<PackageDraft | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const policy = useMemo(() => (policies.data ?? []).find((row: any) => row.packageName === selected) as any, [policies.data, selected]);
  const packageRow = useMemo(() => (packages.data ?? []).find((row: any) => row.name === selected) as any, [packages.data, selected]);

  useEffect(() => {
    const first = packages.data?.[0]?.name;
    if (!selected && first) setSelected(first);
  }, [packages.data, selected]);
  useEffect(() => {
    if (packageRow) setDraft(packageDraftFrom(packageRow, policy));
  }, [packageRow, policy]);

  const patch = (key: keyof PackageDraft, value: unknown) => setDraft(current => current ? ({ ...current, [key]: value } as PackageDraft) : current);
  const invalid = !draft || !selected || !reason.trim() || reason.trim().length < 5 || !draft.name.trim() || !Number.isSafeInteger(Number(draft.minimumQualifyingBalanceUsdMinor)) || Number(draft.minimumQualifyingBalanceUsdMinor) <= 0 || !Number.isInteger(Number(draft.durationMonths)) || Number(draft.durationMonths) < 1 || Number(draft.durationMonths) > 1200 || !Number.isInteger(Number(draft.opportunitiesPerDay)) || Number(draft.opportunitiesPerDay) < 1 || Number(draft.opportunitiesPerDay) > 10000 || !Number.isInteger(Number(draft.maxPopupsPerDay)) || Number(draft.maxPopupsPerDay) < 0 || Number(draft.maxPopupsPerDay) > 10000 || !Number.isInteger(Number(draft.maxActiveInvestments)) || Number(draft.maxActiveInvestments) < 0 || Number(draft.maxActiveInvestments) > 10000 || (draft.startsAt && draft.expiresAt && new Date(draft.expiresAt).getTime() <= new Date(draft.startsAt).getTime()) || !Number.isInteger(Number(draft.minimumPlatformFeeBps)) || !Number.isInteger(Number(draft.maximumPlatformFeeBps)) || Number(draft.minimumPlatformFeeBps) < 0 || Number(draft.maximumPlatformFeeBps) > 10000 || Number(draft.minimumPlatformFeeBps) > Number(draft.maximumPlatformFeeBps);

  const saveDraft = async () => {
    if (!draft || invalid || !packageRow) return;
    setMessage("");
    try {
      await updateSettings.mutateAsync({ id: Number(packageRow.id), name: draft.name.trim(), minimumQualifyingBalanceUsdMinor: Number(draft.minimumQualifyingBalanceUsdMinor), durationMonths: Number(draft.durationMonths), opportunitiesPerDay: Number(draft.opportunitiesPerDay), maxPopupsPerDay: Number(draft.maxPopupsPerDay), maxActiveInvestments: Number(draft.maxActiveInvestments), startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null, expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null, enabled: draft.enabled, minimumPlatformFeeBps: Number(draft.minimumPlatformFeeBps), maximumPlatformFeeBps: Number(draft.maximumPlatformFeeBps), platformFeeRoundingMode: draft.platformFeeRoundingMode, reason: reason.trim() });
      const [packagesRead, policiesRead] = await Promise.all([packages.refetch(), policies.refetch()]);
      const saved = (packagesRead.data ?? []).find((row: any) => Number(row.id) === Number(packageRow.id)) as any;
      const savedFee = (policiesRead.data ?? []).find((row: any) => row.packageName === selected) as any;
      const confirmed = saved && Number(saved.minimumQualifyingBalanceUsdMinor) === Number(draft.minimumQualifyingBalanceUsdMinor) && Number(saved.durationMonths) === Number(draft.durationMonths) && Number(saved.opportunitiesPerDay) === Number(draft.opportunitiesPerDay) && Number(saved.maxPopupsPerDay) === Number(draft.maxPopupsPerDay) && Number(saved.maxActiveInvestments) === Number(draft.maxActiveInvestments) && Boolean(saved.enabled) === draft.enabled && Number(savedFee?.minimumPlatformFeeBps) === Number(draft.minimumPlatformFeeBps) && Number(savedFee?.maximumPlatformFeeBps) === Number(draft.maximumPlatformFeeBps);
      if (!confirmed) throw new Error("Package Settings were submitted, but a fresh database read did not confirm every saved term. Your draft remains on screen.");
      setMessage(`Package Settings saved atomically and verified from the database for ${saved.name}. Existing customer snapshots remain unchanged.`);
      setReason("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Package Settings could not be saved.";
      setMessage(`Package Settings were not saved: ${detail}`);
      void packages.refetch();
      void policies.refetch();
    }
  };

  return <div className="arb-page portal-page">
    <div className="portal-page-top"><div><div className="eyebrow">Trade Settings · one package owner</div><h1>Package Settings</h1><p>One tier’s identity, eligibility, capital bounds, fee terms, quota, dates and lifecycle status. Changes apply to future assignments and deliveries; existing snapshots are preserved.</p></div><button className="primary-button" type="button" onClick={() => void saveDraft()} disabled={invalid || updateSettings.isPending}><Check size={15}/>{updateSettings.isPending ? "Saving atomically…" : "Save package settings"}</button></div>
    {(packages.isLoading || policies.isLoading) && <div className="empty-state">Loading persisted package terms…</div>}
    {(packages.isError || policies.isError) && <div className="admin-ops-empty error" role="alert">Package terms are unavailable or incomplete. No defaults are created automatically. <button className="secondary-button" type="button" onClick={() => { void packages.refetch(); void policies.refetch(); }}><RefreshCw size={14}/>Retry</button></div>}
    {draft && <>
      <div className="admin-control-card"><label>Package<select value={selected} onChange={event => setSelected(event.target.value)}>{(packages.data ?? []).map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><div className="settings-form-grid"><label>Package name<input value={draft.name} onChange={event => patch("name", event.target.value)} /></label><label>Lifecycle status<select value={draft.enabled ? "enabled" : "paused"} onChange={event => patch("enabled", event.target.value === "enabled")}><option value="enabled">Enabled for future eligibility</option><option value="paused">Paused</option></select></label></div><small>Identity and lifecycle scope: one package. Pausing does not delete existing entitlements, opportunities or trade snapshots.</small></div>
      <div className="admin-control-card"><h2>Eligibility, amounts and quota</h2><div className="settings-form-grid"><label>Qualifying threshold (USD minor units)<input type="number" min={1} step={1} value={draft.minimumQualifyingBalanceUsdMinor} onChange={event => patch("minimumQualifyingBalanceUsdMinor", event.target.value === "" ? "" : Number(event.target.value))}/><small>Positive integer minor units; applies to future assignments.</small></label><label>Entitlement duration (calendar months)<input type="number" min={1} max={1200} value={draft.durationMonths} onChange={event => patch("durationMonths", event.target.value === "" ? "" : Number(event.target.value))}/></label><label>Daily opportunity entitlement<input type="number" min={1} max={10000} value={draft.opportunitiesPerDay} onChange={event => patch("opportunitiesPerDay", event.target.value === "" ? "" : Number(event.target.value))}/></label><label>Hard daily pop-up ceiling<input type="number" min={0} max={10000} value={draft.maxPopupsPerDay} onChange={event => patch("maxPopupsPerDay", event.target.value === "" ? "" : Number(event.target.value))}/><small>0 means no additional package ceiling.</small></label><label>Maximum active investments<input type="number" min={0} max={10000} value={draft.maxActiveInvestments} onChange={event => patch("maxActiveInvestments", event.target.value === "" ? "" : Number(event.target.value))}/><small>0 means no tier-specific cap.</small></label></div></div>
      <div className="admin-control-card"><h2>Effective dates</h2><div className="settings-form-grid"><label>Starts at (UTC)<input type="datetime-local" value={draft.startsAt} onChange={event => patch("startsAt", event.target.value)} /></label><label>Expires at (UTC)<input type="datetime-local" value={draft.expiresAt} onChange={event => patch("expiresAt", event.target.value)} /></label></div><small>Changes affect future assignments. Existing customer entitlement and opportunity snapshots retain their saved terms.</small></div>
      <div className="admin-control-card"><h2>Fee and return terms</h2><div className="settings-form-grid"><label>Minimum platform fee (basis points)<input type="number" min={0} max={10000} value={draft.minimumPlatformFeeBps} onChange={event => patch("minimumPlatformFeeBps", event.target.value === "" ? "" : Number(event.target.value))}/></label><label>Maximum platform fee (basis points)<input type="number" min={0} max={10000} value={draft.maximumPlatformFeeBps} onChange={event => patch("maximumPlatformFeeBps", event.target.value === "" ? "" : Number(event.target.value))}/></label><label>Rounding rule<select value={draft.platformFeeRoundingMode} onChange={event => patch("platformFeeRoundingMode", event.target.value as RoundingMode)}><option value="up">Ceiling / round up</option><option value="down">Round down</option><option value="half_up">Half up</option><option value="half_even">Half even</option></select></label></div><p className="admin-policy-note">The fee base is realized positive gross profit only. Principal, loss, zero-profit and expected returns are never charged. “Round up” means ceiling at the currency minor-unit boundary. Selected fee rate and policy version are snapshotted before settlement.</p></div>
      <label className="admin-control-card" style={{ display: "block" }}>Reason for change (required)<textarea rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the package-term change."/><small>{reason.trim().length}/500 characters</small></label>
    </>}
    {message && <div className="test-notice" role="status">{message}</div>}
  </div>;
}
