import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, Check, CheckCircle2, Clipboard, Code2, KeyRound, LockKeyhole, Plus, RefreshCw, ShieldCheck, Trash2, Webhook, BellRing, Phone, Clock3, Play, FileText } from "lucide-react";
import "./CustomerApiAccessPanel.css";

type ApiScope =
  | "balances:read" | "transactions:read" | "withdrawals:read" | "deposits:read" | "fees:read"
  | "statements:read" | "tax-support:read" | "notifications:read" | "analytics:read"
  | "exchange-rates:read" | "platform:status" | "incidents:read" | "webhooks:manage";
type ApiEvent =
  | "deposit.confirmed" | "deposit.delayed" | "deposit.failed" | "withdrawal.status" | "trade.completed"
  | "daily.activity" | "daily.statement" | "tax.report.ready" | "fee.recorded" | "fee.summary"
  | "report.ready" | "platform.status" | "security.alert" | "api.key.created" | "api.key.revoked";
type PreferenceDraft = {
  whatsappNumber: string; whatsappOptIn: boolean; whatsappEvents: ApiEvent[];
  inAppEnabled: boolean; dailySummaryEnabled: boolean; dailyStatementEnabled: boolean;
  feeSummaryEnabled: boolean; securityAlertsEnabled: boolean; timezone: string; dailyReportTime: string;
};
const eventOptions: Array<{id:ApiEvent;label:string;description:string}> = [
  {id:"deposit.confirmed",label:"Deposit confirmed",description:"When a connected provider verifies a deposit."},
  {id:"deposit.delayed",label:"Deposit delayed",description:"When a configured provider flags a delayed deposit."},
  {id:"deposit.failed",label:"Deposit failed",description:"When a provider confirms a deposit failure."},
  {id:"withdrawal.status",label:"Withdrawal status",description:"When your existing withdrawal request changes state."},
  {id:"trade.completed",label:"Trade record update",description:"When a trade lifecycle event is connected."},
  {id:"daily.activity",label:"Daily activity summary",description:"A scheduled summary notice."},
  {id:"daily.statement",label:"Daily statement notice",description:"A notice about statement information currently available."},
  {id:"tax.report.ready",label:"Tax-support report",description:"A tax-support summary notice; not tax advice."},
  {id:"fee.recorded",label:"Fee record",description:"When a verified fee ledger becomes connected."},
  {id:"fee.summary",label:"Fee summary",description:"A scheduled fee-summary notice when source records exist."},
  {id:"report.ready",label:"Report ready",description:"When a report service has produced an available report."},
  {id:"platform.status",label:"Platform status",description:"Administrator-published status and maintenance incidents."},
  {id:"security.alert",label:"Security alert",description:"Security-sensitive account or API key updates."},
  {id:"api.key.created",label:"API key created",description:"When a new customer API key is created."},
  {id:"api.key.revoked",label:"API key revoked",description:"When a customer API key is revoked."},
];
const scopeOptions: Array<{id:ApiScope;label:string;description:string}> = [
  {id:"balances:read",label:"Wallet balances",description:"Read balances and balance availability."},
  {id:"transactions:read",label:"Trade history",description:"Read records for your account only."},
  {id:"withdrawals:read",label:"Withdrawal status",description:"Read your withdrawal requests and their status."},
  {id:"deposits:read",label:"Deposit monitoring",description:"Available only after a verified deposit provider is connected."},
  {id:"fees:read",label:"Fees and published fee schedule",description:"Published schedule; customer fee history needs a fee ledger."},
  {id:"statements:read",label:"Daily statement data",description:"Read-only partial data summary for a date."},
  {id:"tax-support:read",label:"Tax-support summary",description:"Available records only; not a tax calculation."},
  {id:"notifications:read",label:"Notification history",description:"See notification delivery status."},
  {id:"analytics:read",label:"Account analytics",description:"Summaries derived from your own stored account data."},
  {id:"exchange-rates:read",label:"Stored exchange rates",description:"Read currency rates available in the application."},
  {id:"platform:status",label:"Platform status",description:"Read declared status and maintenance information."},
  {id:"incidents:read",label:"Incident history",description:"Read public platform incident history."},
  {id:"webhooks:manage",label:"Manage signed webhooks",description:"Create and revoke event subscriptions for your own account."},
];
const endpoints = [
  {label:"Wallet balances",path:"/api/v1/account/balances"},
  {label:"Trade history",path:"/api/v1/account/trades?limit=20"},
  {label:"Withdrawal status",path:"/api/v1/account/withdrawals"},
  {label:"Deposit status (provider required)",path:"/api/v1/account/deposits"},
  {label:"Fee history (ledger required)",path:"/api/v1/account/fees"},
  {label:"Published fee schedule",path:"/api/v1/platform/fee-schedule"},
  {label:"Daily statement data",path:"/api/v1/account/statements/daily"},
  {label:"Tax-support summary",path:"/api/v1/account/tax-support"},
  {label:"Account analytics",path:"/api/v1/account/analytics"},
  {label:"Exchange rates",path:"/api/v1/account/exchange-rates"},
  {label:"Platform status",path:"/api/v1/platform/status"},
  {label:"Incident history",path:"/api/v1/platform/incidents"},
  {label:"Notification history",path:"/api/v1/account/notification-history"},
];
const initialPreferences:PreferenceDraft = {
  whatsappNumber:"",whatsappOptIn:false,whatsappEvents:[],inAppEnabled:true,dailySummaryEnabled:false,
  dailyStatementEnabled:false,feeSummaryEnabled:false,securityAlertsEnabled:true,timezone:"Africa/Lagos",dailyReportTime:"08:00",
};
const booleanPreferenceOptions: Array<{key:"inAppEnabled"|"dailySummaryEnabled"|"dailyStatementEnabled"|"feeSummaryEnabled"|"securityAlertsEnabled";label:string}> = [
  {key:"inAppEnabled",label:"In-app notifications"},
  {key:"dailySummaryEnabled",label:"Daily account activity notice"},
  {key:"dailyStatementEnabled",label:"Daily statement notice"},
  {key:"feeSummaryEnabled",label:"Fee summary notice"},
  {key:"securityAlertsEnabled",label:"Security alerts"},
];

export default function CustomerApiAccessPanel() {
  const keys=trpc.customer.apiKeys.useQuery(undefined,{refetchOnWindowFocus:true});
  const prefsQuery=trpc.customer.apiAutomationPreferences.useQuery(undefined,{refetchOnWindowFocus:true});
  const webhooks=trpc.customer.apiWebhooks.useQuery(undefined,{refetchOnWindowFocus:true});
  const history=trpc.customer.apiNotificationHistory.useQuery(undefined,{refetchInterval:30000});
  const utils=trpc.useUtils();
  const [name,setName]=useState("");
  const [scopes,setScopes]=useState<ApiScope[]>(["balances:read","transactions:read","platform:status"]);
  const [createdSecret,setCreatedSecret]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [preferences,setPreferences]=useState<PreferenceDraft>(initialPreferences);
  const [verificationCode,setVerificationCode]=useState("");
  const [webhookName,setWebhookName]=useState("");
  const [webhookUrl,setWebhookUrl]=useState("");
  const [webhookEvents,setWebhookEvents]=useState<ApiEvent[]>(["platform.status","security.alert"]);
  const [createdWebhookSecret,setCreatedWebhookSecret]=useState("");
  const [testerKey,setTesterKey]=useState("");
  const [testerEndpoint,setTesterEndpoint]=useState(endpoints[0].path);
  const [testerResult,setTesterResult]=useState("");
  const [testerError,setTesterError]=useState("");
  const [testerStatus,setTesterStatus]=useState<number|null>(null);
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    if(prefsQuery.data) setPreferences({
      whatsappNumber:prefsQuery.data.whatsappNumber,
      whatsappOptIn:prefsQuery.data.whatsappOptIn,
      whatsappEvents:[...prefsQuery.data.whatsappEvents] as ApiEvent[],
      inAppEnabled:prefsQuery.data.inAppEnabled,
      dailySummaryEnabled:prefsQuery.data.dailySummaryEnabled,
      dailyStatementEnabled:prefsQuery.data.dailyStatementEnabled,
      feeSummaryEnabled:prefsQuery.data.feeSummaryEnabled,
      securityAlertsEnabled:prefsQuery.data.securityAlertsEnabled,
      timezone:prefsQuery.data.timezone,
      dailyReportTime:prefsQuery.data.dailyReportTime,
    });
  },[prefsQuery.data]);

  const create=trpc.customer.createApiKey.useMutation({
    onSuccess:(result)=>{
      setCreatedSecret(result.secret);setTesterKey(result.secret);setName("");setNotice("API key created. Copy the secret now; it will not be shown again.");
      setError("");setShowCreate(false);void utils.customer.apiKeys.invalidate();
    },onError:(reason)=>setError(reason.message),
  });
  const revoke=trpc.customer.revokeApiKey.useMutation({
    onSuccess:()=>{setNotice("API key revoked.");setError("");void utils.customer.apiKeys.invalidate();},
    onError:(reason)=>setError(reason.message),
  });
  const savePreferences=trpc.customer.saveApiAutomationPreferences.useMutation({
    onSuccess:()=>{setNotice("Notification preferences saved.");setError("");void utils.customer.apiAutomationPreferences.invalidate();},
    onError:(reason)=>setError(reason.message),
  });
  const requestVerification=trpc.customer.requestWhatsAppVerification.useMutation({
    onSuccess:(result)=>{setNotice(result.alreadyVerified?"This WhatsApp number is already verified.":"Verification code sent. It expires in ten minutes.");setError("");void utils.customer.apiAutomationPreferences.invalidate();},
    onError:(reason)=>setError(reason.message),
  });
  const verifyNumber=trpc.customer.verifyWhatsAppNumber.useMutation({
    onSuccess:()=>{setNotice("WhatsApp number verified successfully.");setError("");setVerificationCode("");void utils.customer.apiAutomationPreferences.invalidate();},
    onError:(reason)=>setError(reason.message),
  });
  const createWebhook=trpc.customer.createApiWebhook.useMutation({
    onSuccess:(result)=>{setCreatedWebhookSecret(result.secret);setWebhookName("");setWebhookUrl("");setNotice("Webhook created. Save its signing secret now; it will not be shown again.");setError("");void utils.customer.apiWebhooks.invalidate();},
    onError:(reason)=>setError(reason.message),
  });
  const revokeWebhook=trpc.customer.revokeApiWebhook.useMutation({
    onSuccess:()=>{setNotice("Webhook revoked.");setError("");void utils.customer.apiWebhooks.invalidate();},
    onError:(reason)=>setError(reason.message),
  });

  const rows=keys.data?.keys??[];
  const activeCount=rows.filter(key=>key.status==="active").length;
  const toggleScope=(scope:ApiScope)=>setScopes(current=>current.includes(scope)?current.filter(item=>item!==scope):[...current,scope]);
  const togglePreferenceEvent=(event:ApiEvent)=>setPreferences(current=>({...current,whatsappEvents:current.whatsappEvents.includes(event)?current.whatsappEvents.filter(item=>item!==event):[...current.whatsappEvents,event]}));
  const copyText=async(text:string,what:string)=>{
    try{await navigator.clipboard.writeText(text);setNotice(what+" copied to clipboard.");setCopied(true);}
    catch{setNotice("Clipboard access was blocked. Select and copy the value manually.");}
  };
  const testEndpoint=async()=>{
    setTesterError("");setTesterStatus(null);setTesterResult("");
    if(!testerKey.trim()){setTesterError("Paste an API key created for your account first.");return;}
    try{
      const response=await fetch(testerEndpoint,{method:"GET",headers:{Authorization:"Bearer "+testerKey.trim(),Accept:"application/json"},credentials:"omit",redirect:"error"});
      const body=await response.json().catch(()=>({error:"The API response was not valid JSON."}));
      setTesterStatus(response.status);setTesterResult(JSON.stringify(body,null,2));
    }catch{setTesterError("The request could not be completed. Check the key, API status and network connection.");}
  };

  return <main className="arb-page portal-page settings-page customer-api-access">
    <div className="portal-page-top"><div><div className="eyebrow">Developer workspace · Customer-owned credentials</div><h1>API Access Centre</h1><p>Manage unique API keys, choose automated updates, connect your own webhook and test supported endpoints without sharing your account password.</p></div><span className="admin-live-chip"><span className="pulse"/> API workspace</span></div>

    <section className="api-access-hero"><div className="api-access-hero-copy"><span className="api-access-kicker"><ShieldCheck size={14}/> YOUR ACCOUNT · YOUR CREDENTIALS</span><h2>Connect your tools with permissions you control.</h2><p>Every key belongs to your account. Secrets are stored as one-way hashes and displayed only once; each request is restricted to your account and granted scopes.</p><div className="api-access-hero-stats"><span><strong>{activeCount}</strong><small>Active keys</small></span><span><strong>{keys.data?.maxActiveKeys??5}</strong><small>Maximum active keys</small></span><span><strong>Scoped</strong><small>Access control</small></span></div></div><div className="api-access-hero-art" aria-hidden="true"><div className="api-access-orbit orbit-one"/><div className="api-access-orbit orbit-two"/><div className="api-access-key-plate"><KeyRound size={34}/><span>ARB API</span><i/></div><div className="api-access-art-chip"><LockKeyhole size={14}/> Customer-scoped</div></div></section>

    {error&&<div className="test-notice api-access-error" role="alert"><AlertTriangle size={16}/><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Dismiss error">×</button></div>}
    {notice&&<div className="test-notice api-access-notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Dismiss message">×</button></div>}

    {createdSecret&&<section className="api-access-secret" aria-label="New API key secret"><div><div className="eyebrow">Copy now · shown once</div><h2>Your new API secret</h2><p>Save it securely. Anyone with this secret can use the granted permissions; never post it in screenshots, support tickets or public repositories.</p></div><code>{createdSecret}</code><div className="api-access-secret-actions"><button type="button" className="primary-button" onClick={()=>void copyText(createdSecret,"API key")}><Clipboard size={15}/> Copy secret</button><button type="button" className="secondary-button" onClick={()=>setCreatedSecret("")}>Hide secret</button></div></section>}

    <section className="api-access-section-heading"><div><div className="eyebrow">Credentials</div><h2>My API keys</h2><p>Use different keys for different applications so you can revoke one without affecting the others.</p></div><button className="primary-button" type="button" onClick={()=>{setShowCreate(open=>!open);setError("");}} disabled={activeCount>=(keys.data?.maxActiveKeys??5)}><Plus size={15}/>{showCreate?"Close form":"Create API key"}</button></section>

    {showCreate&&<section className="api-access-create settings-card"><div className="api-access-form-title"><div className="api-access-icon"><KeyRound size={18}/></div><div><h2>Create a credential</h2><p>Name the integration and grant only the scopes it needs.</p></div></div><label className="api-access-name-label">Key name<input value={name} onChange={event=>setName(event.target.value)} maxLength={80} minLength={3} placeholder="e.g. Account reporting dashboard" autoComplete="off"/></label><div className="api-access-scope-heading"><strong>Permissions</strong><span>{scopes.length} selected</span></div><div className="api-access-scopes">{scopeOptions.map(scope=><label className={scopes.includes(scope.id)?"api-access-scope selected":"api-access-scope"} key={scope.id}><input type="checkbox" checked={scopes.includes(scope.id)} onChange={()=>toggleScope(scope.id)}/><span className="api-access-scope-check">{scopes.includes(scope.id)?<Check size={13}/>:null}</span><span><strong>{scope.label}</strong><small>{scope.description}</small></span></label>)}</div><div className="api-access-form-footer"><span><LockKeyhole size={14}/> Read operations only. No API key can initiate a withdrawal.</span><button className="primary-button" type="button" disabled={create.isPending||name.trim().length<3||!scopes.length} onClick={()=>create.mutate({name:name.trim(),scopes})}>{create.isPending?<><RefreshCw size={14} className="api-access-spin"/> Creating…</>:<><Plus size={14}/> Generate secure key</>}</button></div></section>}

    <section className="api-access-key-list" aria-label="API key list">{keys.isLoading?<div className="settings-card api-access-empty" role="status"><RefreshCw size={18} className="api-access-spin"/> Loading your API credentials…</div>:keys.isError?<div className="settings-card api-access-empty"><AlertTriangle size={18}/><strong>Could not load your keys</strong><p>Retry to load the current state before making changes.</p><button className="secondary-button" onClick={()=>void keys.refetch()}><RefreshCw size={14}/> Retry</button></div>:rows.length===0?<div className="settings-card api-access-empty"><div className="api-access-empty-icon"><Code2 size={24}/></div><h3>No API keys yet</h3><p>Create your first key when you're ready to connect an application.</p><button className="primary-button" type="button" onClick={()=>setShowCreate(true)}><Plus size={14}/> Create your first key</button></div>:rows.map(key=><article className="api-access-key-row settings-card" key={key.id}><div className="api-access-key-symbol"><KeyRound size={19}/></div><div className="api-access-key-main"><div className="api-access-key-title"><h3>{key.name}</h3><span className={key.status==="active"?"api-access-status active":"api-access-status revoked"}><i/>{key.status}</span></div><code>{key.prefix}••••••••••••</code><div className="api-access-key-meta"><span>Created {new Date(key.createdAt).toLocaleDateString()}</span><span>{key.scopes.length} permission{key.scopes.length===1?"":"s"}</span><span>{key.lastUsedAt?"Last used "+new Date(key.lastUsedAt).toLocaleString():"Not used yet"}</span></div><div className="api-access-key-scopes">{key.scopes.map(scope=><span key={scope}>{scope}</span>)}</div></div>{key.status==="active"&&<button className="api-access-revoke" type="button" disabled={revoke.isPending} onClick={()=>{if(window.confirm("Revoke “"+key.name+"”? Integrations using this key will immediately lose access."))revoke.mutate({keyId:key.id})}}><Trash2 size={14}/> Revoke</button>}</article>)}</section>

    <section className="api-access-extra-grid">
      <article className="settings-card api-access-panel"><div className="api-access-doc-icon"><BellRing size={18}/></div><div className="eyebrow">Automation centre</div><h2>Alerts and scheduled notices</h2><p>Choose what you receive automatically. WhatsApp delivery requires opt-in, a verified destination, administrator enablement and a configured provider.</p>
        {prefsQuery.isLoading?<p>Loading notification preferences…</p>:prefsQuery.isError?<button className="secondary-button" onClick={()=>void prefsQuery.refetch()}>Retry preferences</button>:<>
          <label className="api-access-field">WhatsApp receiving number<input value={preferences.whatsappNumber} onChange={e=>setPreferences(old=>({...old,whatsappNumber:e.target.value}))} maxLength={32} placeholder="+2348012345678"/><small>Enter international format including +country code.</small></label>
          <label className="api-access-checkbox"><input type="checkbox" checked={preferences.whatsappOptIn} onChange={e=>setPreferences(old=>({...old,whatsappOptIn:e.target.checked}))}/> I consent to receiving the selected account notifications through WhatsApp.</label>
          <div className="api-access-verify-state"><span className={prefsQuery.data?.whatsappVerified?"api-access-status active":"api-access-status pending"}><i/>{prefsQuery.data?.whatsappVerified?"Number verified":"Number not verified"}</span><span>Verification expires after 10 minutes.</span></div>
          <div className="api-access-verify-actions"><button className="secondary-button" type="button" disabled={savePreferences.isPending} onClick={()=>savePreferences.mutate(preferences)}>{savePreferences.isPending?"Saving…":"Save preferences"}</button><button className="primary-button" type="button" disabled={requestVerification.isPending||!preferences.whatsappNumber.trim()||!preferences.whatsappOptIn} onClick={async()=>{try{await savePreferences.mutateAsync(preferences);await requestVerification.mutateAsync()}catch{/* mutation handlers show the actual error */}}}>{requestVerification.isPending?"Sending code…":"Send verification code"}</button></div>
          <div className="api-access-verify-actions"><input value={verificationCode} onChange={e=>setVerificationCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" aria-label="WhatsApp verification code"/><button className="secondary-button" disabled={verifyNumber.isPending||verificationCode.length!==6} onClick={()=>verifyNumber.mutate({code:verificationCode})}>{verifyNumber.isPending?"Verifying…":"Verify number"}</button></div>
          <div className="api-access-toggle-list">
            {booleanPreferenceOptions.map(option=><label key={option.key} className="api-access-checkbox"><input type="checkbox" checked={preferences[option.key]} onChange={e=>setPreferences(old=>({...old,[option.key]:e.target.checked}))}/>{option.label}</label>)}
          </div>
          <div className="api-access-pref-row"><label className="api-access-field">Daily report time<input type="time" value={preferences.dailyReportTime} onChange={e=>setPreferences(old=>({...old,dailyReportTime:e.target.value}))}/></label><label className="api-access-field">Time zone<input value={preferences.timezone} onChange={e=>setPreferences(old=>({...old,timezone:e.target.value}))} placeholder="Africa/Lagos"/></label></div>
          <h3>WhatsApp event preferences</h3><div className="api-access-event-grid">{eventOptions.map(item=><label className="api-access-event" key={item.id}><input type="checkbox" checked={preferences.whatsappEvents.includes(item.id)} onChange={()=>togglePreferenceEvent(item.id)}/><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div>
          <button className="primary-button" type="button" onClick={()=>savePreferences.mutate(preferences)} disabled={savePreferences.isPending}>{savePreferences.isPending?"Saving…":"Save notification settings"}</button>
        </>}
      </article>

      <article className="settings-card api-access-panel"><div className="api-access-doc-icon"><Webhook size={18}/></div><div className="eyebrow">Developer events</div><h2>My signed webhooks</h2><p>Send subscribed events to your own HTTPS endpoint. Delivery requests carry an HMAC-SHA256 signature and an idempotency identifier. Public HTTPS destinations only; private network targets are rejected.</p>
        <label className="api-access-field">Webhook name<input value={webhookName} onChange={e=>setWebhookName(e.target.value)} maxLength={80} placeholder="My notification service"/></label>
        <label className="api-access-field">Public HTTPS endpoint<input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} maxLength={500} placeholder="https://your-domain.com/webhooks/arbitrade"/></label>
        <div className="api-access-event-grid">{eventOptions.map(item=><label className="api-access-event" key={item.id}><input type="checkbox" checked={webhookEvents.includes(item.id)} onChange={()=>setWebhookEvents(current=>current.includes(item.id)?current.filter(event=>event!==item.id):[...current,item.id])}/><span><strong>{item.label}</strong></span></label>)}</div>
        <button className="primary-button" disabled={createWebhook.isPending||webhookName.trim().length<3||!webhookUrl.trim()||!webhookEvents.length} onClick={()=>createWebhook.mutate({name:webhookName.trim(),endpointUrl:webhookUrl.trim(),events:webhookEvents})}>{createWebhook.isPending?"Creating…":"Create webhook"}</button>
        {createdWebhookSecret&&<div className="api-access-secret api-access-hook-secret"><strong>Webhook signing secret · shown once</strong><code>{createdWebhookSecret}</code><button className="secondary-button" onClick={()=>void copyText(createdWebhookSecret,"Webhook secret")}><Clipboard size={14}/> Copy signing secret</button><button className="secondary-button" onClick={()=>setCreatedWebhookSecret("")}>Hide secret</button></div>}
        {webhooks.isLoading?<p>Loading webhooks…</p>:webhooks.isError?<button className="secondary-button" onClick={()=>void webhooks.refetch()}>Retry webhook list</button>:<div className="api-access-webhook-list">{(webhooks.data??[]).map(hook=><div className="api-access-webhook-row" key={hook.id}><div><strong>{hook.name}</strong><code>{hook.endpointUrl}</code><small>{hook.events.join(", ")}</small><small>{hook.lastDeliveredAt?"Last delivered "+new Date(hook.lastDeliveredAt).toLocaleString():"No successful delivery yet"}{hook.lastResponseCode?" · HTTP "+hook.lastResponseCode:""}</small><span className={hook.status==="active"?"api-access-status active":"api-access-status revoked"}><i/>{hook.status}</span></div>{hook.status==="active"&&<button className="api-access-revoke" onClick={()=>{if(window.confirm("Revoke this webhook?"))revokeWebhook.mutate({webhookId:hook.id})}} disabled={revokeWebhook.isPending}><Trash2 size={14}/> Revoke</button>}</div>)}</div>}
      </article>
    </section>

    <section className="settings-card api-access-panel"><div className="api-access-doc-icon"><Play size={18}/></div><div className="eyebrow">Request tester</div><h2>Try an API request</h2><p>Use a key you own. The key is sent only to this application's API endpoint and kept in this page's memory; it is not saved to your account settings.</p>
      <label className="api-access-field">API key<input type="password" autoComplete="off" value={testerKey} onChange={e=>setTesterKey(e.target.value)} placeholder="arb_live_…"/></label>
      <label className="api-access-field">Endpoint<select value={testerEndpoint} onChange={e=>setTesterEndpoint(e.target.value)}>{endpoints.map(endpoint=><option key={endpoint.path} value={endpoint.path}>{endpoint.label} — {endpoint.path}</option>)}</select></label>
      <button className="primary-button" onClick={()=>void testEndpoint()} disabled={!testerKey.trim()}>Run GET request</button>
      {testerError&&<div className="api-access-inline-error" role="alert">{testerError}</div>}
      {testerStatus!==null&&<div className={testerStatus>=200&&testerStatus<300?"api-access-test-result":"api-access-test-result api-access-test-failed"} role="status"><strong>HTTP {testerStatus}</strong><pre>{testerResult}</pre></div>}
    </section>

    <section className="settings-card api-access-panel"><div className="api-access-doc-icon"><Activity size={18}/></div><div className="eyebrow">Delivery history</div><h2>Recent notifications</h2><p>Review queued, sent, failed or skipped deliveries. Provider-dependent events stay unavailable until their real data source is connected.</p>
      {history.isLoading?<p>Loading delivery history…</p>:history.isError?<button className="secondary-button" onClick={()=>void history.refetch()}>Retry delivery history</button>:!history.data?.length?<p>No API automation events have been queued yet.</p>:<div className="api-access-history-wrap"><table className="api-access-history"><thead><tr><th>Event</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Created</th></tr></thead><tbody>{history.data.map(item=><tr key={item.id}><td>{item.eventKey}</td><td>{item.channel}</td><td><span className={"api-access-status "+(item.status==="sent"?"active":item.status==="failed"?"revoked":"pending")}><i/>{item.status}</span>{item.errorCode&&<small>{item.errorCode}</small>}</td><td>{item.attempts}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="api-access-docs-grid">
      <article className="settings-card"><div className="api-access-doc-icon"><Code2 size={18}/></div><div className="eyebrow">Quick start</div><h2>Use your key in code</h2><ol><li>Create a key and copy its secret once.</li><li>Store it in your server-side environment or secret manager, never in browser code or public repositories.</li><li>Send it using HTTPS in the <code>Authorization: Bearer</code> header.</li><li>Use only endpoints covered by your granted scopes and rotate/revoke keys when needed.</li></ol><pre className="api-access-code-example">curl -H "Authorization: Bearer $ARBITRADE_API_KEY" "{typeof window!=="undefined"?window.location.origin:"https://your-domain.example"}/api/v1/account/balances"</pre></article>
      <article className="settings-card"><div className="api-access-doc-icon"><FileText size={18}/></div><div className="eyebrow">Data-source transparency</div><h2>What's available now</h2><ul><li>Balances, trade records, withdrawal statuses and stored exchange rates use existing application records.</li><li>Daily statements and tax-support summaries identify missing deposits/fees; tax-support is not tax advice.</li><li>Deposit monitoring and customer fee history remain unavailable until verified sources are connected.</li><li>Platform state is administrator-declared unless actual health probes are configured.</li><li>API keys cannot initiate withdrawals. Sensitive changes need separate authenticated workflows.</li></ul></article>
    </section>
    <div className="test-notice api-access-bottom-note"><Activity size={15}/><span>All endpoint permissions are customer-scoped. A provider's settings being saved does not mean that provider has connected or sent verified events.</span></div>
  </main>;
}
