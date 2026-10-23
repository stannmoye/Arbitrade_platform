import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Check, Code2, MessageCircle, PlugZap, ShieldCheck, ToggleLeft, ToggleRight, WalletCards } from "lucide-react";
import "./AdminApiAccess.css";

function AdminApis(){
 const q=trpc.adminOperations.apiAccessSettings.useQuery(undefined,{refetchInterval:30000});
 const providers=trpc.adminOperations.apiProviderCredentialStatus.useQuery(undefined,{refetchInterval:30000});
 const incidents=trpc.adminOperations.apiPlatformIncidents.useQuery(undefined,{refetchInterval:30000});
 const utils=trpc.useUtils();
 const [tab,setTab]=useState<"overview"|"whatsapp"|"templates"|"wallet"|"status">("overview");
 const [message,setMessage]=useState("");
 const [draft,setDraft]=useState<any>({apiEnabled:false,requestsPerMinute:60,whatsappEnabled:false,whatsappNumber:"",webhooksEnabled:false,dailyReportDeliveryEnabled:false,walletProviderEnabled:false,platformStatus:"not-configured",maintenanceMessage:"",feeScheduleJson:"",templates:{}});
 const [wa,setWa]=useState({accessToken:"",phoneNumberId:"",graphApiVersion:"v22.0",verificationTemplateName:"",verificationTemplateLanguage:"en"});
 const [wallet,setWallet]=useState({apiToken:"",apiSecret:"",webhookSecret:""});
 const [incident,setIncident]=useState({status:"maintenance" as "operational"|"degraded"|"maintenance"|"offline",title:"",message:"",affectedServices:"API"});
 useEffect(()=>{if(q.data)setDraft({...q.data,templates:{...q.data.templates}})},[q.data]);
 const update=(key:string,value:any)=>setDraft((old:any)=>({...old,[key]:value}));
 const templates:Array<[string,string,string]>=[
  ["deposit_confirmed","Deposit confirmed","{{customer_name}}, {{reference}}"],["deposit_delayed","Deposit delayed","{{customer_name}}, {{reference}}"],
  ["deposit_failed","Deposit failed","{{customer_name}}, {{reference}}"],["withdrawal_status","Withdrawal status","{{customer_name}}, {{reference}}, {{status}}"],
  ["trade_completed","Trade record update","{{customer_name}}, {{reference}}"],["daily_statement","Daily statement notice","{{customer_name}}, {{report_date}}, {{report_endpoint}}"],
  ["daily_activity","Daily activity notice","{{customer_name}}, {{report_date}}, {{report_endpoint}}"],["fee_recorded","Fee record update","{{customer_name}}, {{reference}}"],
  ["fee_summary","Fee summary notice","{{customer_name}}, {{report_date}}, {{report_endpoint}}"],["platform_status","Platform status","{{status}}, {{status_url}}"],
  ["security_alert","Security alert","{{event}}"],["api_key_created","API key created","{{event}}"],
  ["api_key_revoked","API key revoked","{{event}}"],["tax_report_ready","Tax-support report","{{customer_name}}, {{report_date}}, {{report_endpoint}}"],
  ["report_ready","Requested report","{{customer_name}}, {{secure_link}}"],
 ];
 const save=trpc.adminOperations.saveApiAccessSettings.useMutation({onSuccess:async()=>{await q.refetch();setMessage("API Access configuration saved.")},onError:e=>setMessage(e.message)});
 const saveWa=trpc.adminOperations.saveWhatsAppProviderCredentials.useMutation({onSuccess:async()=>{setWa({accessToken:"",phoneNumberId:"",graphApiVersion:"v22.0",verificationTemplateName:"",verificationTemplateLanguage:"en"});await providers.refetch();setMessage("WhatsApp provider credentials encrypted and saved. Provider delivery still requires a successful real-world connection check.")},onError:e=>setMessage(e.message)});
 const saveWallet=trpc.adminOperations.saveWalletProviderCredentials.useMutation({onSuccess:async()=>{setWallet({apiToken:"",apiSecret:"",webhookSecret:""});await providers.refetch();setMessage("Wallet credentials encrypted and stored. A provider-specific adapter is still required before deposits can be processed.")},onError:e=>setMessage(e.message)});
 const remove=trpc.adminOperations.removeApiProviderCredentials.useMutation({onSuccess:async()=>{await providers.refetch();setMessage("Provider credentials removed.")},onError:e=>setMessage(e.message)});
 const createIncident=trpc.adminOperations.createApiPlatformIncident.useMutation({onSuccess:async()=>{await incidents.refetch();setIncident({status:"maintenance",title:"",message:"",affectedServices:"API"});setMessage("Incident published. Eligible notification subscribers have been queued.")},onError:e=>setMessage(e.message)});
 const resolveIncident=trpc.adminOperations.resolveApiPlatformIncident.useMutation({onSuccess:async()=>{await incidents.refetch();setMessage("Incident resolved and subscriber alerts queued.")},onError:e=>setMessage(e.message)});
 const canSave=!save.isPending&&!q.isLoading&&!q.isError;
 const setWaField=(key:string,value:string)=>setWa(old=>({...old,[key]:value}));
 const setWalletField=(key:string,value:string)=>setWallet(old=>({...old,[key]:value}));
 return <div className="arb-page portal-page admin-api-centre">
  <div className="portal-page-top"><div><div className="eyebrow">Administrator-controlled integrations</div><h1>API & Integration Centre</h1><p>Control API access, WhatsApp templates, encrypted provider credentials, customer webhooks and platform status.</p></div><button className="primary-button" onClick={()=>save.mutate(draft)} disabled={!canSave}>{save.isPending?"Saving…":"Save configuration"} <Check size={14}/></button></div>
  {message&&<div className="test-notice" role="status"><ShieldCheck size={14}/>{message}<button className="secondary-button" onClick={()=>setMessage("")}>Dismiss</button></div>}
  {q.isError&&<div className="auth-error" role="alert">Could not load the current integration settings. Retry before changing settings. <button className="secondary-button" onClick={()=>void q.refetch()}>Retry</button></div>}
  {!providers.data?.vaultReady&&<div className="test-notice"><AlertTriangle size={14}/> Configure <code>API_ACCESS_ENCRYPTION_KEY</code> (32+ characters) in the private server environment once before storing provider credentials.</div>}
  <div className="admin-api-health-grid">
   <div className="admin-api-health-card"><span className="api-admin-icon"><Code2 size={17}/></span><div><strong>Customer API</strong><span>Customer-owned keys and scopes</span></div><b className={draft.apiEnabled?"api-status on":"api-status off"}>{draft.apiEnabled?"Enabled by policy":"Disabled by policy"}</b></div>
   <div className="admin-api-health-card"><span className="api-admin-icon"><MessageCircle size={17}/></span><div><strong>WhatsApp</strong><span>{draft.whatsappNumber||"Sender number not configured"}</span></div><b className={providers.data?.whatsappMeta.configured?"api-status on":"api-status off"}>{providers.data?.whatsappMeta.configured?"Credentials stored":"Not configured"}</b></div>
   <div className="admin-api-health-card"><span className="api-admin-icon"><WalletCards size={17}/></span><div><strong>Wallet provider</strong><span>{draft.walletProviderName||"Provider not selected"}</span></div><b className={providers.data?.walletGeneric.configured?"api-status on":"api-status off"}>{providers.data?.walletGeneric.configured?"Credentials stored":"Not configured"}</b></div>
  </div>
  <div className="settings-tabs admin-api-tabs">
   <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>API policy</button>
   <button className={tab==="whatsapp"?"active":""} onClick={()=>setTab("whatsapp")}>WhatsApp setup</button>
   <button className={tab==="templates"?"active":""} onClick={()=>setTab("templates")}>Message templates</button>
   <button className={tab==="wallet"?"active":""} onClick={()=>setTab("wallet")}>Wallet provider</button>
   <button className={tab==="status"?"active":""} onClick={()=>setTab("status")}>Platform status</button>
  </div>
  {tab==="overview"&&<div className="admin-api-config-layout">
   <section className="settings-card"><div className="eyebrow">Global policy</div><h2>API access rules</h2><p>The key must still have the requested scope and belong to the customer whose records are requested.</p>
    <div className="admin-toggle-row"><div><strong>Allow customer API access</strong><span>Master switch for supported API endpoints.</span></div><button className={draft.apiEnabled?"toggle-switch on":"toggle-switch"} onClick={()=>update("apiEnabled",!draft.apiEnabled)}>{draft.apiEnabled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>
    <label>Requests per key, per minute<input type="number" min="10" max="600" value={draft.requestsPerMinute} onChange={e=>update("requestsPerMinute",Math.max(10,Math.min(600,Number(e.target.value)||10)))}/></label>
    <label>Active keys per customer<input value="5" readOnly/><small>Each key has individual permissions, usage details and revocation.</small></label>
    <div className="admin-toggle-row"><div><strong>Enable customer webhooks</strong><span>Signed event deliveries for customer-subscribed URLs.</span></div><button className={draft.webhooksEnabled?"toggle-switch on":"toggle-switch"} onClick={()=>update("webhooksEnabled",!draft.webhooksEnabled)}>{draft.webhooksEnabled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>
    <div className="admin-toggle-row"><div><strong>Enable scheduled report notices</strong><span>Customer-chosen schedule and time zone; report completeness depends on connected data sources.</span></div><button className={draft.dailyReportDeliveryEnabled?"toggle-switch on":"toggle-switch"} onClick={()=>update("dailyReportDeliveryEnabled",!draft.dailyReportDeliveryEnabled)}>{draft.dailyReportDeliveryEnabled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>
   </section>
   <section className="settings-card"><div className="eyebrow">Connection registry</div><h2>Integration readiness</h2><div className="admin-api-grid">{[["WhatsApp","Outbound messages through Meta provider",providers.data?.whatsappMeta.configured?"Credentials stored":"Not configured"],["Wallet / deposits","Requires a provider-specific adapter",providers.data?.walletGeneric.configured?"Credentials stored; adapter pending":"Not configured"],["Notifications","Durable database outbox and in-app", "Available"],["Platform status","Admin-maintained incident log",draft.platformStatus||"not-configured"]].map(([name,desc,status])=><div className="api-admin-card" key={name}><div className="api-admin-icon"><PlugZap size={17}/></div><div><strong>{name}</strong><span>{desc}</span></div><span className="api-status off">{status}</span></div>)}</div></section>
   <section className="settings-card admin-api-editor"><div className="eyebrow">Fee transparency</div><h2>Published fee schedule</h2><p>This schedule is informational. It does not create fee transactions or replace an authoritative customer fee ledger.</p><label>Schedule JSON<textarea rows={6} value={draft.feeScheduleJson||""} onChange={e=>update("feeScheduleJson",e.target.value)} placeholder={'[{"code":"withdrawal-standard","name":"Standard withdrawal fee","type":"fixed","currency":"USD","amountMinor":100}]'}/><small>Up to 100 entries. Types: fixed, percent or tier. Leave blank when there is no published schedule.</small></label></section>
  </div>}
  {tab==="whatsapp"&&<div className="admin-api-config-layout">
   <section className="settings-card admin-api-editor"><div className="eyebrow">Sender and delivery policy</div><h2>WhatsApp Business destination</h2><p>This is the platform sender number. Each customer supplies, opts in to and verifies their own receiving number.</p>
    <label>Business sender number<input value={draft.whatsappNumber||""} onChange={e=>update("whatsappNumber",e.target.value)} placeholder="+2348012345678" maxLength={32}/></label>
    <div className="admin-toggle-row"><div><strong>Enable WhatsApp delivery</strong><span>Requires encrypted credentials, customer consent and a verified receiving number.</span></div><button className={draft.whatsappEnabled?"toggle-switch on":"toggle-switch"} onClick={()=>update("whatsappEnabled",!draft.whatsappEnabled)}>{draft.whatsappEnabled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>
    <div className="test-notice"><AlertTriangle size={14}/> WhatsApp may require approved message templates for verification and outbound messages outside the customer-service window. Editing message text does not register an approved Meta template.</div>
   </section>
   <section className="settings-card admin-api-editor"><div className="eyebrow">Encrypted credentials</div><h2>Meta WhatsApp Cloud API</h2><p>Secrets are encrypted before database storage and never returned by settings queries. Enter an approved one-parameter verification template.</p>
    <label>Access token<input type="password" autoComplete="new-password" value={wa.accessToken} onChange={e=>setWaField("accessToken",e.target.value)} placeholder="Business messaging access token"/></label>
    <label>Phone number ID<input value={wa.phoneNumberId} onChange={e=>setWaField("phoneNumberId",e.target.value)} placeholder="Meta phone number ID"/></label>
    <label>Graph API version<input value={wa.graphApiVersion} onChange={e=>setWaField("graphApiVersion",e.target.value)} placeholder="vXX.0"/></label>
    <label>Approved verification template name<input value={wa.verificationTemplateName} onChange={e=>setWaField("verificationTemplateName",e.target.value)} placeholder="approved_otp_template"/></label>
    <label>Template language code<input value={wa.verificationTemplateLanguage} onChange={e=>setWaField("verificationTemplateLanguage",e.target.value)} placeholder="en"/></label>
    <button className="primary-button" disabled={!providers.data?.vaultReady||saveWa.isPending||wa.accessToken.trim().length<20||!wa.phoneNumberId.trim()||!wa.verificationTemplateName.trim()} onClick={()=>saveWa.mutate(wa)}>{saveWa.isPending?"Encrypting and saving…":"Save encrypted WhatsApp credentials"}</button>
    <div className="api-access-provider-status"><span className={providers.data?.whatsappMeta.configured?"api-access-status active":"api-access-status pending"}><i/>{providers.data?.whatsappMeta.configured?"Credentials stored":"No credentials stored"}</span><span>{providers.data?.whatsappMeta.updatedAt?"Updated "+new Date(providers.data.whatsappMeta.updatedAt).toLocaleString():""}</span></div>
    {providers.data?.whatsappMeta.configured&&<button className="secondary-button" onClick={()=>{if(window.confirm("Remove WhatsApp credentials? Automatic delivery will stop."))remove.mutate({provider:"whatsapp_meta"})}} disabled={remove.isPending}>Remove WhatsApp credentials</button>}
   </section>
  </div>}
  {tab==="templates"&&<section className="settings-card admin-api-editor"><div className="eyebrow">Customer communications</div><h2>Message template studio</h2><p>Customize each event's message independently. Recognized fields are replaced from verified event data; secure report links are not fabricated. These message drafts do not register approved WhatsApp templates.</p><div className="admin-api-template-grid">{templates.map(([key,label,vars])=><label key={key}>{label}<textarea rows={3} maxLength={2000} value={draft.templates?.[key]||""} onChange={e=>update("templates",{...draft.templates,[key]:e.target.value})}/><small>Placeholders: {vars} · up to 2,000 characters</small><div className="admin-api-meta-template-fields"><label>Approved Meta template name<input value={draft.whatsappMetaTemplates?.[key]?.name||""} onChange={e=>update("whatsappMetaTemplates",{...(draft.whatsappMetaTemplates||{}),[key]:{...(draft.whatsappMetaTemplates?.[key]||{name:"",language:"en"}),name:e.target.value}})} placeholder="Optional approved template name"/></label><label>Template language<input value={draft.whatsappMetaTemplates?.[key]?.language||"en"} onChange={e=>update("whatsappMetaTemplates",{...(draft.whatsappMetaTemplates||{}),[key]:{...(draft.whatsappMetaTemplates?.[key]||{name:"",language:"en"}),language:e.target.value}})} placeholder="en"/></label></div><small>When set, delivery uses this approved Meta template. Template parameters must follow the placeholders/order listed above.</small></label>)}</div><button className="primary-button" onClick={()=>save.mutate(draft)} disabled={!canSave}>{save.isPending?"Saving…":"Save all templates"} <Check size={14}/></button></section>}
  {tab==="wallet"&&<div className="admin-api-config-layout">
   <section className="settings-card admin-api-editor"><div className="eyebrow">Public connection details</div><h2>Wallet / deposit provider</h2><p>Enter the provider metadata now. Deposit confirmation stays unavailable until a reviewed provider-specific adapter verifies callbacks and maps external references to account records.</p>
    <label>Provider name<input value={draft.walletProviderName||""} onChange={e=>update("walletProviderName",e.target.value)} maxLength={120} placeholder="Provider name"/></label>
    <label>Provider API base URL<input value={draft.walletProviderBaseUrl||""} onChange={e=>update("walletProviderBaseUrl",e.target.value)} maxLength={500} placeholder="https://api.provider.example"/></label>
    <label>Provider webhook URL<input value={draft.walletWebhookUrl||""} onChange={e=>update("walletWebhookUrl",e.target.value)} maxLength={500} placeholder="https://your-domain.example/api/providers/webhook"/></label>
    <div className="admin-toggle-row"><div><strong>Provider enable policy</strong><span>Records administrator intent only; does not activate unsupported endpoints.</span></div><button className={draft.walletProviderEnabled?"toggle-switch on":"toggle-switch"} onClick={()=>update("walletProviderEnabled",!draft.walletProviderEnabled)}>{draft.walletProviderEnabled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>
   </section>
   <section className="settings-card admin-api-editor"><div className="eyebrow">Encrypted credentials</div><h2>Store wallet provider credentials</h2><p>The vault prepares these values for a later provider adapter. Different wallet providers use different authentication and callback contracts.</p>
    <label>API token / key<input type="password" autoComplete="new-password" value={wallet.apiToken} onChange={e=>setWalletField("apiToken",e.target.value)} placeholder="Provider API token"/></label>
    <label>API secret (optional)<input type="password" autoComplete="new-password" value={wallet.apiSecret} onChange={e=>setWalletField("apiSecret",e.target.value)} placeholder="Provider API secret"/></label>
    <label>Webhook signing secret (optional)<input type="password" autoComplete="new-password" value={wallet.webhookSecret} onChange={e=>setWalletField("webhookSecret",e.target.value)} placeholder="Provider webhook secret"/></label>
    <button className="primary-button" disabled={!providers.data?.vaultReady||saveWallet.isPending||wallet.apiToken.trim().length<8} onClick={()=>saveWallet.mutate(wallet)}>{saveWallet.isPending?"Encrypting and saving…":"Save encrypted wallet credentials"}</button>
    <div className="api-access-provider-status"><span className={providers.data?.walletGeneric.configured?"api-access-status active":"api-access-status pending"}><i/>{providers.data?.walletGeneric.configured?"Credentials stored; adapter pending":"No credentials stored"}</span><span>{providers.data?.walletGeneric.updatedAt?"Updated "+new Date(providers.data.walletGeneric.updatedAt).toLocaleString():""}</span></div>
    {providers.data?.walletGeneric.configured&&<button className="secondary-button" onClick={()=>{if(window.confirm("Remove wallet provider credentials?"))remove.mutate({provider:"wallet_generic"})}} disabled={remove.isPending}>Remove wallet credentials</button>}
   </section>
  </div>}
  {tab==="status"&&<div className="admin-api-config-layout">
   <section className="settings-card admin-api-editor"><div className="eyebrow">Status publication</div><h2>Platform state</h2><p>This is administrator-declared status, not automatic service health monitoring.</p>
    <label>Published status<select value={draft.platformStatus||"not-configured"} onChange={e=>update("platformStatus",e.target.value)}><option value="not-configured">Not configured</option><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="maintenance">Maintenance</option><option value="offline">Offline</option></select></label>
    <label>Status / maintenance message<textarea rows={4} maxLength={1000} value={draft.maintenanceMessage||""} onChange={e=>update("maintenanceMessage",e.target.value)} placeholder="Customer-facing status update"/></label>
    <button className="primary-button" onClick={()=>save.mutate(draft)} disabled={!canSave}>{save.isPending?"Saving…":"Save status"}</button>
   </section>
   <section className="settings-card admin-api-editor"><div className="eyebrow">Incident management</div><h2>Publish an incident</h2>
    <label>Incident status<select value={incident.status} onChange={e=>setIncident(old=>({...old,status:e.target.value as typeof old.status}))}><option value="maintenance">Maintenance</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="operational">Operational / recovered</option></select></label>
    <label>Title<input maxLength={200} value={incident.title} onChange={e=>setIncident(old=>({...old,title:e.target.value}))} placeholder="Scheduled API maintenance"/></label>
    <label>Customer-facing message<textarea rows={3} maxLength={4000} value={incident.message} onChange={e=>setIncident(old=>({...old,message:e.target.value}))} placeholder="Explain the status update"/></label>
    <label>Affected services<input maxLength={400} value={incident.affectedServices} onChange={e=>setIncident(old=>({...old,affectedServices:e.target.value}))} placeholder="API, deposits, reports"/></label>
    <button className="primary-button" disabled={createIncident.isPending||incident.title.trim().length<3||!incident.message.trim()} onClick={()=>createIncident.mutate({status:incident.status,title:incident.title.trim(),message:incident.message.trim(),affectedServices:incident.affectedServices.split(",").map(value=>value.trim()).filter(Boolean)})}>{createIncident.isPending?"Publishing…":"Publish and queue alerts"}</button>
    {incidents.isLoading?<p>Loading incidents…</p>:incidents.isError?<button className="secondary-button" onClick={()=>void incidents.refetch()}>Retry incident history</button>:<div className="admin-api-incident-list">{incidents.data?.map(item=><article className="api-admin-incident" key={item.id}><div><strong>{item.title}</strong><span>{item.status} · {new Date(item.createdAt).toLocaleString()}</span><p>{item.message}</p></div>{!item.endsAt&&<button className="secondary-button" onClick={()=>{if(window.confirm("Resolve this incident and notify subscribers?"))resolveIncident.mutate({incidentId:item.id})}} disabled={resolveIncident.isPending}>Resolve</button>}</article>)}</div>}
   </section>
  </div>}
  <div className="settings-actions"><button className="primary-button" onClick={()=>save.mutate(draft)} disabled={!canSave}>{save.isPending?"Saving…":"Save configuration"} <Check size={14}/></button><span>Provider values remain encrypted. Unsupported deposit and fee-history endpoints stay unavailable until their data sources are implemented.</span></div>
 </div>;
}

export default AdminApis;
