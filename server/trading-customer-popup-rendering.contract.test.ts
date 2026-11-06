import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../client/src/trading-experience.css", import.meta.url), "utf8");
const start = app.indexOf("function CustomerOpportunityAlert(");
const end = app.indexOf("\nfunction CustomerDashboard(", start);
const component = app.slice(start, end);
const deliveryStart = database.indexOf("export async function listCustomerOpportunities(");
const deliveryEnd = database.indexOf("export async function claimAutoTradeCycleCustomers(", deliveryStart);
const delivery = database.slice(deliveryStart, deliveryEnd);

describe("customer opportunity popup retry and visibility gates", () => {
  it("does not mark an offer as seen before all display gates pass", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const displayStart = component.indexOf("const display=()=>", component.indexOf("const showOffer=(offer:any)=>"));
    const displayEnd = component.indexOf("const locks=", displayStart);
    const displayBody = component.slice(displayStart, displayEnd);
    const gate = displayBody.indexOf("if(!isOfferCurrent(offer)||!canShow()||popupRef.current)");
    const markSeen = displayBody.indexOf("seen.current.add(offerId)");
    const commitPopup = displayBody.indexOf("setPopup(offer)");
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(markSeen).toBeGreaterThan(gate);
    expect(commitPopup).toBeGreaterThan(markSeen);
  });

  it("keeps an in-flight display separate from the seen set until rendering succeeds", () => {
    const display = component.indexOf("const showOffer=(offer:any)=>");
    const consider = component.indexOf("const consider=(offer:any)=>", display);
    expect(display).toBeGreaterThanOrEqual(0);
    expect(consider).toBeGreaterThan(display);
    const displayBody = component.slice(display, consider);
    expect(displayBody).toContain("displaying.current.add(offerId)");
    expect(displayBody).toContain("displaying.current.delete(offerId)");
    expect(displayBody).toContain("displaying.current.has(offerId)");
    expect(displayBody).toContain("seen.current.add(offerId)");
    expect(displayBody).toContain("navigator");
    expect(displayBody).toContain("scheduleCollapse()");
  });

  it("retries eligible offers while the saved delivery policy is enabled", () => {
    expect(component).toContain("const canShow=()=>Boolean(delivery?.enabled&&policy)");
    expect(component).toContain("attemptNext(opportunityData?.offers||[])");
    expect(component).toContain("window.setInterval(()=>attemptNext(opportunityData?.offers||[]),5000)");
    expect(component).toContain("current.popupEligible===true");
    expect(component).toContain('String(offer.offerStatus||"").toLowerCase()==="open"');
  });

  it("does not rely on placeholder or pre-alert opportunities to render a real popup", () => {
    expect(component).toContain("isOfferOpen(offer)");
    expect(component).toContain("Boolean(delivery?.enabled&&policy)");
    expect(component).toContain("isOfferCurrent(offer)");
    expect(component).toContain("popupRef.current=offer");
    expect(component).toContain("current.popupEligible===true");
  });

  it("minimizes at the shared server expiry instead of using a separate display timer", () => {
    expect(component).toContain("timer.current=window.setTimeout(()=>{");
    expect(component).toContain("Date.parse(String(popupRef.current?.closesAt||\"\"))");
    expect(component).toContain("configuredDurationSeconds");
    expect(database).toContain("const closesAt=new Date(rewardAt.getTime()+completionDisplaySeconds*1000)");
    expect(database).toContain("const displaySeconds=terms.tradeDurationSeconds+completionDisplaySeconds");
    expect(database).toContain("const configuredPopupDisplaySeconds=configuredDurationSeconds+completionDisplaySeconds");
    expect(database).not.toContain("Math.max(86_400");
    expect(component).toContain("setMinimized(true)");
    expect(component).toContain('aria-label="Minimize opportunity alert"');
    expect(component).toContain('aria-label="Maximize opportunity alert"');
    expect(component).toContain('className="opportunity-popup-dock"');
    expect(component).not.toContain("timer.current=window.setTimeout(stop");
    expect(component).toContain('aria-label="Minimized opportunity alert"');
    expect(stylesheet).toContain(".customer-portal .opportunity-popup-dock");
    expect(stylesheet).toContain(".customer-portal .center-opportunity-toast .opportunity-popup-minimize");
  });

  it("shows an explicit insufficient-balance notice without implying allocation or execution", () => {
    expect(component).toContain("Missed — insufficient balance");
    expect(component).toContain("Required capital");
    expect(component).toContain("Available balance");
    expect(component).toContain("Shortfall");
    expect(component).toContain("balanceAvailableMinor");
    expect(component).toContain("No funds were moved.");
    expect(component).toContain("It does not execute a trade, allocate capital, or change a wallet balance.");
    expect(component).not.toContain("AUTOMATED OPPORTUNITY");
    expect(component).not.toContain("Configured return rate:");
  });

  it("uses the server's current offer status and configured currency scale", () => {
    expect(delivery).toContain("offerStatus:row.offerStatus");
    expect(delivery).toContain("currencyScale:Number(currencyRows.find");
    expect(delivery).toContain("currencySymbol:String(currencyRows.find");
    expect(delivery).toContain('popupEligible:row.offerStatus==="open"');
    expect(delivery).toContain('["queued","in_progress","retry_wait","delivered","received","rendered","failed"].includes(String(row.deliveryStatus))');
    expect(delivery).not.toContain('["delivered","received","rendered","failed"].includes(String(row.deliveryStatus))');
    expect(delivery).toContain("a refreshed customer portal can retry rendering and status recording");
    expect(delivery).toContain("const dispatches=await claimPopupDeliveryDispatches(userId)");
    expect(delivery).toContain("deliveryLeaseToken:dispatch.leaseToken");
    expect(component).toContain('status:"received",leaseToken:offer.deliveryLeaseToken');
  });

  it("uses the server clock and persisted offer expiry for a live opportunity countdown", () => {
    expect(database).toContain("serverTime:new Date().toISOString()");
    expect(database).toContain("const responseNow=new Date();");
    expect(database).toContain("serverTime:responseNow.toISOString()");
    expect(database).toContain('expiryStatus:row.closesAt?');
    expect(component).toContain("serverClockOffsetMs.current");
    expect(component).toContain("popup.expiryStatus");
    expect(component).toContain("Opportunity expires in");
    expect(component).toContain("Countdown is synchronised to the server-saved expiry timestamp.");
    expect(component).toContain("Scheduled expiry:");
    expect(component).toContain("{expiryLabel}: {expiryCountdown}");
    expect(component).toContain("Supplied code:");
    expect(component).not.toContain("Trade closes in");
  });

  it("refreshes the visible popup with server-confirmed expiry and company status", () => {
    expect(component).toContain('const refreshedFields=["expiryStatus","popupEligible","companyDisplayName","companyLogoUrl","deliveryStatus"]');
    expect(component).toContain("current[key]!==popup[key]");
    expect(component).toContain("Date.now()+serverClockOffsetMs.current");
  });

  it("shows live connection state while retaining the last known informational popup", () => {
    expect(app).toContain('connectionStatus={opportunityMeta.isError?"offline":opportunityMeta.isFetching&&!opportunityMeta.data?"updating":"connected"}');
    expect(app).toContain('opportunityMeta.isFetching&&!opportunityMeta.data');
    expect(component).toContain('connectionStatus:"connected"|"updating"|"offline"');
    expect(component).toContain('className={"opportunity-popup-connection opportunity-popup-connection--"+connectionStatus}');
    expect(component).toContain("Connection interrupted");
    expect(component).toContain("Refreshing status");
    expect(component).toContain("Live status connected");
    expect(stylesheet).toContain(".opportunity-popup-connection--offline");
    expect(stylesheet).toContain(".opportunity-popup-connection--updating");
  });

  it("provides keyboard-operable, read-only expandable opportunity details", () => {
    expect(component).toContain('className="opportunity-popup-details__toggle"');
    expect(component).toContain("aria-expanded={detailsExpanded}");
    expect(component).toContain("setDetailsExpanded(value=>!value)");
    expect(component).toContain("Opportunity reference");
    expect(component).toContain("Assigned package");
    expect(component).toContain("Scheduled expiry");
    expect(component).toContain("Server status");
    expect(component).toContain("<dl");
    expect(stylesheet).toContain(".opportunity-popup-details__toggle:focus-visible");
    expect(stylesheet).toContain("@media (max-width: 520px)");
    expect(component).toContain("It does not execute a trade, allocate capital, or change a wallet balance.");
  });

  it("keeps the expiry countdown informational and respects reduced-motion styling", () => {
    expect(component).toContain('className="opportunity-expiry-panel"');
    expect(component).toContain("Expiry time reached · confirming status");
    expect(stylesheet).toContain("@keyframes opportunityPopupEnter");
    expect(stylesheet).toContain("@keyframes opportunityPopupShimmer");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain(".customer-portal .opportunity-expiry-ring__value");
  });

  it("holds the browser tab lock until the opportunity alert is dismissed or withdrawn", () => {
    expect(component).toContain("ifAvailable:true");
    expect(component).toContain("await hold");
    expect(component).toContain("releaseDisplayLock.current=release");
    expect(component).toContain("releaseDisplayLock.current()");
    expect(component).toContain("releaseDisplayLock.current=null");
  });

  it("does not poll trade history for informational-only opportunity alerts", () => {
    expect(component).not.toContain("trpc.customer.trades.useQuery");
    expect(component).not.toContain("automaticTrade");
    expect(component).toContain("Informational notice only");
  });
});
