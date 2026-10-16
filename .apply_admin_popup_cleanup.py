from pathlib import Path

p = Path('client/src/App.tsx')
s = p.read_text()

# One authoritative opportunity query in CustomerWorkspace.
s = s.replace('const opportunityMeta=trpc.customer.opportunities.useQuery(undefined,{refetchInterval:10000});', 'const opportunityMeta=trpc.customer.opportunities.useQuery(undefined,{refetchInterval:3000});')
s = s.replace('<CustomerDashboard push={push} sound={sound} setSound={setSound} soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery}/>', '<CustomerDashboard push={push} sound={sound} setSound={setSound} soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery} opportunityData={opportunityMeta.data}/>')
s = s.replace('<CustomerOpportunities push={push} sound={sound} soundSettings={adminSounds}/>', '<CustomerOpportunities push={push} sound={sound} soundSettings={adminSounds} opportunityData={opportunityMeta.data}/>')
s = s.replace('<CustomerOpportunityAlert sound={sound} soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery} userEmail={user.email||""} onOpen={()=>setSection("opportunities" completely', '<CustomerOpportunityAlert sound={sound} soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery} opportunityData={opportunityMeta.data} userEmail={user.email||""} onOpen={()=>setSection("opportunities" completely')
# Above exact replacement is intentionally corrected below for the actual source substring.
s = s.replace('soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery} userEmail={user.email||""} onOpen', 'soundSettings={adminSounds} delivery={opportunityMeta.data?.delivery} opportunityData={opportunityMeta.data} userEmail={user.email||""} onOpen')

s = s.replace('function CustomerOpportunityAlert({sound,soundSettings,onOpen,delivery,userEmail}:{sound:boolean;soundSettings:SoundSettings;onOpen:()=>void;delivery?:any;userEmail:string}) {\n  const offers=trpc.customer.opportunities.useQuery(undefined,{refetchInterval:10000});', 'function CustomerOpportunityAlert({sound,soundSettings,onOpen,delivery,opportunityData,userEmail}:{sound:boolean;soundSettings:SoundSettings;onOpen:()=>void;delivery?:any;opportunityData?:any;userEmail:string}) {')
s = s.replace('offers.data?.offers?.some((current:any)=>current.id===offer.id)', 'opportunityData?.offers?.some((current:any)=>current.id===offer.id)')
s = s.replace('useEffect(()=>{attemptNext(offers.data?.offers||[]);},[offers.data,policy,delivery]);', 'useEffect(()=>{attemptNext(opportunityData?.offers||[]);},[opportunityData,policy,delivery]);')
s = s.replace('const id=window.setInterval(()=>attemptNext(offers.data?.offers||[]),5000);', 'const id=window.setInterval(()=>attemptNext(opportunityData?.offers||[]),5000);')
s = s.replace('},[offers.data,policy,delivery]);\n  useEffect(()=>()=>{', '},[opportunityData,policy,delivery]);\n  useEffect(()=>()=>{')

s = s.replace('function CustomerDashboard({push,sound,setSound,soundSettings,delivery}:{push:(x:string)=>void;sound:boolean;setSound:(x:boolean)=>void;soundSettings:SoundSettings;delivery?:{packageName:string;maxPopupsPerDay:number;maxVisibleOffers:number;autoTradeEnabled?:boolean;pausedUntilSettled?:boolean;outstandingTrades?:number}}) {\n  const balances=trpc.customer.balances.useQuery(undefined,{refetchInterval:5000});\n  const settings=trpc.customer.autoTradeSettings.useQuery(undefined,{refetchInterval:5000});\n  const opportunities=trpc.customer.opportunities.useQuery(undefined,{refetchInterval:5000});', 'function CustomerDashboard({push,sound,setSound,soundSettings,delivery,opportunityData}:{push:(x:string)=>void;sound:boolean;setSound:(x:boolean)=>void;soundSettings:SoundSettings;delivery?:{packageName:string;maxPopupsPerDay:number;maxVisibleOffers:number;autoTradeEnabled?:boolean;pausedUntilSettled?:boolean;outstandingTrades?:number};opportunityData?:any}) {\n  const balances=trpc.customer.balances.useQuery(undefined,{refetchInterval:5000});\n  const settings=trpc.customer.autoTradeSettings.useQuery(undefined,{refetchInterval:5000});')
s = s.replace('const summary=balances.data?.summary; const offers=opportunities.data?.offers||[]; const missed=opportunities.data?.missed||[];', 'const summary=balances.data?.summary; const offers=opportunityData?.offers||[]; const missed=opportunityData?.missed||[];')

s = s.replace('function CustomerOpportunities({push,sound,soundSettings}:{push:(x:string)=>void;sound:boolean;soundSettings:SoundSettings}) {\n  const offersQuery=trpc.customer.opportunities.useQuery(undefined,{refetchInterval:3000});', 'function CustomerOpportunities({push,sound,soundSettings,opportunityData}:{push:(x:string)=>void;sound:boolean;soundSettings:SoundSettings;opportunityData?:any}) {')
s = s.replace('const feedData:any=offersQuery.data as any;', 'const feedData:any=opportunityData as any;')

# Remove obsolete global opportunity controls from the admin engine.
s = s.replace('const [frequency,setFrequency]=useState(30);const [emergencyCeiling,setEmergencyCeiling]=useState(500);const [drainMode,setDrainMode]=useState(false)', 'const [drainMode,setDrainMode]=useState(false)')
s = s.replace('setFrequency(q.data.opportunity.maxPopupsPerDay);setEmergencyCeiling(q.data.opportunity.emergencyCeiling||500);setDrainMode', 'setDrainMode')
s = s.replace('opportunity:{maxPopupsPerDay:frequency,emergencyCeiling,drainMode,countdownSeconds:countdown,signupCreditMinor:credit,signupCreditCurrency:creditCurrency}', 'opportunity:{drainMode,countdownSeconds:countdown,signupCreditMinor:credit,signupCreditCurrency:creditCurrency}')
s = s.replace('<div className="eyebrow">Global feed policy</div><h2>Overall delivery ceiling</h2><label>Global maximum popups per day<input type="number" min="1" max="1000" value={frequency} onChange={e=>setFrequency(Number(e.target.value))}/></label><label>Global emergency ceiling (events/day)<input type="number" min="1" max="100000" value={emergencyCeiling} onChange={e=>setEmergencyCeiling(Number(e.target.value))}/><small>Safety ceiling across all packages; it never schedules events by itself.</small></label>', '<div className="eyebrow">Package-aware feed safety</div><h2>Delivery safety controls</h2><p>Customer opportunity volume is controlled by the purchased package policy below. These controls only govern the feed lifecycle and submission timing.</p>')

# Remove the obsolete global ceiling from the overview.
s = s.replace('const settingsQ=trpc.adminOperations.settings.useQuery(undefined,{refetchInterval:10000}); ', '')
s = s.replace('const globalLimit=Number(settingsQ.data?.opportunity?.maxPopupsPerDay||0); ', '')
s = s.replace('<div><span>Opportunity ceiling</span><strong>{globalLimit}</strong><b>Configured opportunities / day</b></div>', '')
s = s.replace('<div className="admin-control-card"><div className="eyebrow">Global opportunity configuration</div><h2>Database-controlled delivery</h2><p>The global ceiling, emergency ceiling, countdown, and drain mode are edited from the Settings and Opportunity Engine screens. No local preview slider overrides the server.</p><div className="frequency-readout"><strong>{globalLimit}</strong><span>opportunities / day</span></div><div className="admin-policy-note"><Database size={14}/> Server delivery and customer eligibility use the same persisted registry.</div></div>', '')

p.write_text(s)

# Use package policy as the only customer delivery cap server-side.
p = Path('server/db.ts')
s = p.read_text()
old = 'const configuredGlobalDailyLimit=Number(await getAppSetting("opportunity.maxPopupsPerDay","50")); const emergencyCeiling=Number(await getAppSetting("opportunity.globalEmergencyCeilingPerDay","500")); const globalDailyLimit=Math.min(Number.isFinite(configuredGlobalDailyLimit)&&configuredGlobalDailyLimit>0?configuredGlobalDailyLimit:50,Number.isFinite(emergencyCeiling)&&emergencyCeiling>0?emergencyCeiling:500); const drainMode='
new = 'const maxPopupsPerDay=Math.max(0,Number(policy.maxPopupsPerDay)||0); const drainMode='
if old not in s:
    raise SystemExit('server global ceiling block not found')
s = s.replace(old, new)
s = s.replace('const maxEligibleOffers=Math.max(0,Math.min(Number(policy.maxVisibleOffers)||0,maxPopupsPerDay));', 'const maxEligibleOffers=Math.max(0,Math.min(Number(policy.maxVisibleOffers)||0,maxPopupsPerDay));')
s = s.replace('packageName:policy.packageName,maxPopupsPerDay:maxEligibleOffers,maxVisibleOffers:maxEligibleOffers,emergencyCeiling,drainMode', 'packageName:policy.packageName,maxPopupsPerDay:maxEligibleOffers,maxVisibleOffers:maxEligibleOffers,drainMode')
p.write_text(s)
PY
python3 /home/ubuntu/arbitrade/.apply_admin_popup_cleanup.py
rm /home/ubuntu/arbitrade/.apply_admin_popup_cleanup.py
rg -n "opportunityData|Global maximum popups|Global emergency ceiling|globalDailyLimit|configuredGlobalDailyLimit|emergencyCeiling|settingsQ|globalLimit" client/src/App.tsx server/db.ts | sed -n '1,260p'