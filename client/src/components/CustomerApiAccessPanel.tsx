import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, Check, CheckCircle2, ChevronDown, Clipboard, Code2, KeyRound, LockKeyhole, Plus, RefreshCw, ShieldCheck, Trash2, Webhook } from "lucide-react";
import "./CustomerApiAccessPanel.css";

type ApiScope =
  | "balances:read"
  | "transactions:read"
  | "withdrawals:read"
  | "platform:status";

const scopeOptions: Array<{ id: ApiScope; label: string; description: string }> = [
  { id: "balances:read", label: "Wallet balances", description: "Read balances and balance availability." },
  { id: "transactions:read", label: "Transaction history", description: "Read account activity and transaction records." },
  { id: "withdrawals:read", label: "Withdrawal status", description: "Read withdrawal requests and their current status." },
  { id: "platform:status", label: "Platform status", description: "Read public service status and maintenance information." },
];

export default function CustomerApiAccessPanel() {
  const keys = trpc.customer.apiKeys.useQuery(undefined, { refetchOnWindowFocus: true });
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["balances:read", "transactions:read", "platform:status"]);
  const [createdSecret, setCreatedSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const create = trpc.customer.createApiKey.useMutation({
    onSuccess: (result) => {
      setCreatedSecret(result.secret);
      setName("");
      setNotice("API key created. Copy the secret now; it will not be shown again.");
      setError("");
      setShowCreate(false);
      void utils.customer.apiKeys.invalidate();
    },
    onError: (reason) => setError(reason.message),
  });
  const revoke = trpc.customer.revokeApiKey.useMutation({
    onSuccess: () => {
      setNotice("API key revoked. It can no longer be used.");
      setError("");
      void utils.customer.apiKeys.invalidate();
    },
    onError: (reason) => setError(reason.message),
  });
  const rows = keys.data?.keys ?? [];
  const activeCount = rows.filter((key) => key.status === "active").length;
  const toggleScope = (scope: ApiScope) => setScopes((current) =>
    current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
  );
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(createdSecret);
      setNotice("API key copied to clipboard. Store it in a secure password manager.");
    } catch {
      setNotice("Clipboard access was blocked. Select and copy the key manually, then store it securely.");
    }
  };

  return <main className="arb-page portal-page settings-page customer-api-access">
    <div className="portal-page-top">
      <div>
        <div className="eyebrow">Developer workspace · Customer-owned credentials</div>
        <h1>API Access Centre</h1>
        <p>Create unique API credentials, control read permissions, and prepare integrations from one guided workspace.</p>
      </div>
      <span className="admin-live-chip"><span className="pulse" /> Key management</span>
    </div>

    <section className="api-access-hero">
      <div className="api-access-hero-copy">
        <span className="api-access-kicker"><ShieldCheck size={14} /> YOUR ACCOUNT · YOUR CREDENTIALS</span>
        <h2>Connect your tools without sharing your password.</h2>
        <p>Each key belongs to your account and has its own permissions. Keys are stored as one-way hashes; the secret is shown only once when created.</p>
        <div className="api-access-hero-stats">
          <span><strong>{activeCount}</strong><small>Active keys</small></span>
          <span><strong>{keys.data?.maxActiveKeys ?? 5}</strong><small>Maximum active keys</small></span>
          <span><strong>Read-only</strong><small>Initial permissions</small></span>
        </div>
      </div>
      <div className="api-access-hero-art" aria-hidden="true"><div className="api-access-orbit orbit-one"/><div className="api-access-orbit orbit-two"/><div className="api-access-key-plate"><KeyRound size={34}/><span>ARB API</span><i/></div><div className="api-access-art-chip"><LockKeyhole size={14}/> Customer-scoped</div></div>
    </section>

    {error && <div className="test-notice api-access-error" role="alert"><AlertTriangle size={16}/><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="test-notice api-access-notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

    {createdSecret && <section className="api-access-secret" aria-label="New API key secret">
      <div><div className="eyebrow">Copy now · shown once</div><h2>Your new API secret</h2><p>Anyone with this secret may access the permissions attached to this key. Never share it in support tickets, screenshots or public repositories.</p></div>
      <code>{createdSecret}</code>
      <div className="api-access-secret-actions"><button type="button" className="primary-button" onClick={() => void copySecret()}><Clipboard size={15}/> Copy secret</button><button type="button" className="secondary-button" onClick={() => setCreatedSecret("")}>I have saved it</button></div>
    </section>}

    <div className="api-access-section-heading"><div><div className="eyebrow">Credentials</div><h2>My API keys</h2><p>Use separate keys for separate applications so you can revoke one integration without affecting the others.</p></div><button className="primary-button" type="button" onClick={() => { setShowCreate((open) => !open); setError(""); }} disabled={activeCount >= (keys.data?.maxActiveKeys ?? 5)}><Plus size={15}/>{showCreate ? "Close form" : "Create API key"}</button></div>

    {showCreate && <section className="api-access-create settings-card">
      <div className="api-access-form-title"><div className="api-access-icon"><KeyRound size={18}/></div><div><h2>Create a credential</h2><p>Give it a name you will recognize later. Choose only the permissions this application needs.</p></div></div>
      <label className="api-access-name-label">Key name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} minLength={3} placeholder="e.g. Personal account dashboard" autoComplete="off"/></label>
      <div className="api-access-scope-heading"><strong>Permissions</strong><span>{scopes.length} selected</span></div>
      <div className="api-access-scopes">{scopeOptions.map((scope) => <label className={scopes.includes(scope.id) ? "api-access-scope selected" : "api-access-scope"} key={scope.id}><input type="checkbox" checked={scopes.includes(scope.id)} onChange={() => toggleScope(scope.id)}/><span className="api-access-scope-check">{scopes.includes(scope.id) ? <Check size={13}/> : null}</span><span><strong>{scope.label}</strong><small>{scope.description}</small></span></label>)}</div>
      <div className="api-access-form-footer"><span><LockKeyhole size={14}/> Read permissions only. No key can initiate a withdrawal.</span><button className="primary-button" type="button" disabled={create.isPending || name.trim().length < 3 || scopes.length === 0} onClick={() => create.mutate({ name: name.trim(), scopes })}>{create.isPending ? <><RefreshCw size={14} className="api-access-spin"/> Creating…</> : <><Plus size={14}/> Generate secure key</>}</button></div>
    </section>}

    <section className="api-access-key-list" aria-label="API key list">
      {keys.isLoading ? <div className="settings-card api-access-empty" role="status"><RefreshCw size={18} className="api-access-spin"/> Loading your API credentials…</div>
      : keys.isError ? <div className="settings-card api-access-empty"><AlertTriangle size={18}/><strong>Could not load your keys</strong><p>Retry to load the current state before making changes.</p><button className="secondary-button" onClick={() => void keys.refetch()}><RefreshCw size={14}/> Retry</button></div>
      : rows.length === 0 ? <div className="settings-card api-access-empty"><div className="api-access-empty-icon"><Code2 size={24}/></div><h3>No API keys yet</h3><p>Create your first key when you are ready to connect an application. You can revoke it at any time.</p><button className="primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={14}/> Create your first key</button></div>
      : rows.map((key) => <article className="api-access-key-row settings-card" key={key.id}>
        <div className="api-access-key-symbol"><KeyRound size={19}/></div>
        <div className="api-access-key-main"><div className="api-access-key-title"><h3>{key.name}</h3><span className={key.status === "active" ? "api-access-status active" : "api-access-status revoked"}><i/>{key.status}</span></div><code>{key.prefix}••••••••••••</code><div className="api-access-key-meta"><span>Created {new Date(key.createdAt).toLocaleDateString()}</span><span>{key.scopes.length} permission{key.scopes.length === 1 ? "" : "s"}</span><span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Not used yet"}</span></div><div className="api-access-key-scopes">{key.scopes.map((scope) => <span key={scope}>{scope}</span>)}</div></div>
        {key.status === "active" && <button className="api-access-revoke" type="button" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke “${key.name}”? Any integration using this key will lose access.`)) revoke.mutate({ keyId: key.id }); }}><Trash2 size={14}/> Revoke</button>}
      </article>)}
    </section>

    <section className="api-access-planned-features settings-card"><div className="eyebrow">Next integrations</div><h2>Additional permissions will unlock as data sources are verified</h2><div className="api-access-planned-grid"><span><strong>Deposit monitoring</strong><small>Requires a verified deposit provider lifecycle</small></span><span><strong>Fees and statements</strong><small>Requires authoritative fee records and report generation</small></span><span><strong>WhatsApp delivery</strong><small>Requires an approved messaging provider and verified recipient</small></span></div></section>

    <section className="api-access-docs-grid">
      <article className="settings-card"><div className="api-access-doc-icon"><Code2 size={18}/></div><div className="eyebrow">Quick start</div><h2>How API access works</h2><ol><li>Create a key and copy the secret once.</li><li>Store it in your app's server-side secret store or environment configuration.</li><li>Send it in the HTTP <code>Authorization: Bearer</code> header when using a supported API endpoint.</li><li>Grant only the permissions your integration needs and revoke keys you no longer use.</li></ol></article>
      <article className="settings-card"><div className="api-access-doc-icon"><Webhook size={18}/></div><div className="eyebrow">Integrations</div><h2>Provider connections are staged</h2><p>WhatsApp delivery and wallet-provider connections will be configured by an administrator later. This page does not claim that a provider is connected until its setup and health checks are complete.</p><div className="api-access-provider-status"><span className="api-access-status pending"><i/> Not configured</span><span>WhatsApp messaging</span></div><div className="api-access-provider-status"><span className="api-access-status pending"><i/> Not configured</span><span>Wallet / deposit provider</span></div></article>
    </section>
    <div className="test-notice api-access-bottom-note"><Activity size={15}/><span>API keys currently establish credential ownership and permissions. External endpoint availability will be shown explicitly as each read-only endpoint is implemented and enabled.</span><ChevronDown size={15}/></div>
  </main>;
}
