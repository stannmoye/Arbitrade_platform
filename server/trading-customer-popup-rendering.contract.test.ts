import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isServerActiveCustomerPopupSlotOwner } from "../client/src/customer-popup-eligibility";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const popupVisibility = readFileSync(new URL("../client/src/popup-visibility-confirmation.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const eligibility = readFileSync(new URL("../client/src/customer-popup-eligibility.ts", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../client/src/trading-experience.css", import.meta.url), "utf8");
const stage2Browser = readFileSync(new URL("../scripts/stage2-browser-acceptance.cjs", import.meta.url), "utf8");
const start = app.indexOf("function CustomerOpportunityAlert(");
const end = app.indexOf("\nfunction CustomerDashboard(", start);
const component = app.slice(start, end);
const reviewPanel = readFileSync(new URL("../client/src/components/CustomerOpportunityReviewPanel.tsx", import.meta.url), "utf8");
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
    expect(component).toContain("remainingOpportunityMilliseconds(popupRef.current?.closesAt,Date.now(),serverClockOffsetMs.current)");
    expect(component).not.toContain("configuredSeconds*1000");
    expect(database).toContain("const closesAt=new Date(rewardAt.getTime()+completionDisplaySeconds*1000)");
    expect(database).toContain("const displaySeconds=terms.tradeDurationSeconds+completionDisplaySeconds");
    expect(database).toContain("const settlesAt=new Date(tradeStartedAt.getTime()+effectiveDurationSeconds*1000)");
    expect(database).toContain("const configuredPopupDisplaySeconds=configuredDurationSeconds+completionDisplaySeconds");
    expect(database).not.toContain("Math.max(86_400");
    expect(component).toContain("setMinimized(true)");
    expect(reviewPanel).toContain('aria-label="Minimize opportunity alert"');
    expect(reviewPanel).toContain('aria-label="Maximize opportunity alert"');
    expect(reviewPanel).toContain('className="opportunity-popup-dock opportunity-review-dock"');
    expect(component).not.toContain("timer.current=window.setTimeout(stop");
    expect(reviewPanel).toContain('aria-label="Minimized opportunity alert"');
    expect(stylesheet).toContain(".customer-portal .opportunity-popup-dock");
    expect(stylesheet).toContain(".customer-portal .center-opportunity-toast .opportunity-popup-minimize");
  });

  it("shows an explicit insufficient-balance notice without implying allocation or execution", () => {
    expect(reviewPanel).toContain("Missed — insufficient balance");
    expect(reviewPanel).toContain("Required capital");
    expect(reviewPanel).toContain("Available balance at server check");
    expect(reviewPanel).toContain("Shortfall");
    expect(component).toContain("balanceAvailableMinor");
    expect(component).toContain("const shortfallMinor=Number(popup.shortfallMinor)");
    expect(reviewPanel).not.toContain("Math.max(0,requiredMinor-availableMinor)");
    expect(reviewPanel).toContain("No funds were moved.");
    expect(reviewPanel).toMatch(/No automatic financial\s+execution/);
    expect(reviewPanel).not.toContain("AUTOMATED OPPORTUNITY");
    expect(reviewPanel).not.toContain("Configured return rate:");
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
    expect(component).toContain("acknowledgePopupDelivery({");
    expect(component).toContain('status:"received",leaseToken');
    expect(component).toContain('status:"rendered",leaseToken');
    expect(component).not.toContain('status:"failed",errorCode:"POPUP_RENDER_FAILED"');
    expect(component).toContain('retryTimer=window.setTimeout(()=>void acknowledge(),5000)');
  });

  it("only acknowledges rendering after the popup has committed and never maps RPC errors to failure", () => {
    const displayStart = component.indexOf("const showOffer=(offer:any)=>");
    const displayEnd = component.indexOf("const consider=(offer:any)=>", displayStart);
    const displayBody = component.slice(displayStart, displayEnd);
    const acknowledgementEffect = component.indexOf("useEffect(()=>{\n    const eventId=Number(popup?.deliveryEventId||0)");
    expect(displayBody).toContain("setPopup(offer)");
    expect(displayBody).not.toContain("deliveryStatus.mutateAsync");
    expect(acknowledgementEffect).toBeGreaterThanOrEqual(0);
    expect(component).toContain("received:()=>deliveryStatus.mutateAsync");
    expect(component).toContain("rendered:async()=>");
    expect(component).toContain("waitForPopupVisibility(popupSurfaceRef.current,isCurrent,visibilityAbort.signal)");
    expect(component).toContain('if(visible&&isCurrent())await deliveryStatus.mutateAsync({eventId,status:"rendered",leaseToken})');
    expect(component).toContain("Ambiguous network errors retry idempotently and never become FAILED.");
    expect(app).toContain("rootRef={popupSurfaceRef}");
    expect(reviewPanel).toContain("ref={rootRef}");
    expect(popupVisibility).toContain('document.visibilityState !== "visible"');
    expect(popupVisibility).toContain('style.display === "none"');
    expect(popupVisibility).toContain("rect.bottom > 0 && rect.right > 0");
    expect(popupVisibility).toContain("window.requestAnimationFrame(() => window.requestAnimationFrame");
    expect(component).toContain("visibilityAbort.abort()");
    expect(component).not.toContain('status:"failed"');
  });

  it("uses a claimed dispatch with a valid lease in the real-browser acknowledgement fixture", () => {
    const fixtureStart = stage2Browser.indexOf("const offer = {", stage2Browser.indexOf("async function runCustomerOpportunityPopupInteractionCheck"));
    const fixtureEnd = stage2Browser.indexOf("\n  };", fixtureStart);
    const fixture = stage2Browser.slice(fixtureStart, fixtureEnd);
    expect(fixture).toContain('deliveryStatus: "in_progress"');
    expect(fixture).toMatch(/deliveryLeaseToken: "[0-9a-f-]{36}"/);
    expect(fixture).not.toContain('deliveryStatus: "delivered"');
  });

  it("uses the server clock and persisted offer expiry for a live opportunity countdown", () => {
    expect(database).toContain("serverTime:new Date().toISOString()");
    expect(database).toContain("const responseNow=new Date();");
    expect(database).toContain("serverTime:responseNow.toISOString()");
    expect(database).toContain('expiryStatus:row.closesAt?');
    expect(component).toContain("serverClockOffsetMs.current");
    expect(component).toContain("popup.expiryStatus");
    expect(component).toContain("Opportunity expires in");
    expect(reviewPanel).toContain("Countdown target comes from saved closesAt");
    expect(reviewPanel).toContain("Scheduled expiry");
    expect(reviewPanel).toContain("{expiryLabel}: {expiryCountdown}");
    expect(reviewPanel).toContain("Supplied code");
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
    expect(reviewPanel).toContain("opportunity-popup-connection--${connectionStatus}");
    expect(component).toContain("Connection interrupted");
    expect(component).toContain("Refreshing server status");
    expect(component).toContain("Server connection active");
    expect(stylesheet).toContain(".opportunity-popup-connection--offline");
    expect(stylesheet).toContain(".opportunity-popup-connection--updating");
  });

  it("provides keyboard-operable, read-only expandable opportunity details", () => {
    expect(reviewPanel).toContain('className="opportunity-popup-details__toggle"');
    expect(reviewPanel).toContain("aria-expanded={detailsExpanded}");
    expect(reviewPanel).toContain("setDetailsExpanded(!detailsExpanded)");
    expect(reviewPanel).toContain("Opportunity reference");
    expect(reviewPanel).toContain("Assigned package label");
    expect(reviewPanel).toContain("Scheduled expiry");
    expect(reviewPanel).toContain("Server status");
    expect(reviewPanel).toContain("<dl");
    expect(stylesheet).toContain(".opportunity-popup-details__toggle:focus-visible");
    expect(stylesheet).toContain("@media (max-width: 520px)");
    expect(reviewPanel).toContain("does not execute");
  });

  it("keeps the expiry countdown informational and respects reduced-motion styling", () => {
    expect(reviewPanel).toContain("opportunity-review-expiry");
    expect(component).toContain("Expiry time reached · confirming status");
    expect(stylesheet).toContain("@keyframes opportunityPopupEnter");
    expect(stylesheet).toContain("@keyframes opportunityPopupShimmer");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain(".customer-portal .opportunity-review-expiry-value");
  });

  it("holds the browser tab lock until the opportunity alert is dismissed or withdrawn", () => {
    expect(component).toContain("ifAvailable:true");
    expect(component).toContain("await hold");
    expect(component).toContain("releaseDisplayLock.current=release");
    expect(component).toContain("releaseDisplayLock.current()");
    expect(component).toContain("releaseDisplayLock.current=null");
  });

  it("releases a server-expired popup slot and retries the next eligible offer", () => {
    expect(component).toContain("isServerActiveCustomerPopupSlotOwner(current)");
    expect(component).toContain("attemptNext(opportunityData.offers)");
    const predicateStart = eligibility.indexOf("export function isServerActiveCustomerPopupSlotOwner(");
    const predicateEnd = eligibility.indexOf("\n}", predicateStart);
    const predicate = eligibility.slice(predicateStart, predicateEnd);
    expect(predicate).toContain('current.expiryStatus ?? ""');
    expect(predicate).not.toContain("closesAt");
  });

  it("keeps the slot until the server confirms expiry, not merely when the browser countdown reaches zero", () => {
    expect(isServerActiveCustomerPopupSlotOwner({
      offerStatus: "open",
      expiryStatus: "active",
      eventStatus: "NOTICED",
      deliveryStatus: "rendered",
      closesAt: "2000-01-01T00:00:00.000Z",
    })).toBe(true);
  });

  it("releases a still-open slot after the server confirms the offer expired", () => {
    expect(isServerActiveCustomerPopupSlotOwner({
      offerStatus: "open",
      expiryStatus: "expired",
      popupEligible: false,
      eventStatus: "DELIVERED",
      deliveryStatus: "rendered",
      closesAt: "2000-01-01T00:00:00.000Z",
    })).toBe(false);
  });

  it("releases the local popup slot at saved closesAt and immediately retries the next offer", () => {
    expect(component).toContain("const expired=useRef<Set<number>>(new Set())");
    expect(component).toContain("const scheduledOfferId=Number(popupRef.current?.id||0)");
    expect(component).toContain("expired.current.add(scheduledOfferId)");
    expect(component).toContain("pending.current.delete(scheduledOfferId)");
    expect(component).toContain("seen.current.add(scheduledOfferId)");
    expect(component).toContain("stop();\n      void refreshOpportunityFeed().catch(()=>{});\n      attemptNext(opportunityData?.offers||[])");
    expect(component).toContain("!expired.current.has(Number(offer.id))");
  });

  it("keeps expiry callbacks from dismissing a replacement popup", () => {
    expect(component).toContain("if(!popupRef.current||Number(popupRef.current.id)!==scheduledOfferId)return");
    expect(component).toContain("if(!popupRef.current||Number(popupRef.current.id)!==Number(popup.id))return");
  });

  it("keeps manual minimization reversible without cancelling saved expiry", () => {
    expect(component).toContain('onMaximize={()=>setMinimized(false)}');
    expect(component).toContain('onMinimize={()=>{stopConfiguredSound();setMinimized(true);}}');
    expect(reviewPanel).toContain("onClick={onMaximize}");
    expect(component).not.toContain('stopConfiguredSound();if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;setMinimized(true)');
  });

  it("releases missing, terminal, or expired delivery owners", () => {
    expect(isServerActiveCustomerPopupSlotOwner(undefined)).toBe(false);
    expect(isServerActiveCustomerPopupSlotOwner({
      offerStatus: "closed",
      expiryStatus: "active",
    })).toBe(false);
    expect(isServerActiveCustomerPopupSlotOwner({
      offerStatus: "open",
      expiryStatus: "active",
      eventStatus: "WITHDRAWN",
      deliveryStatus: "rendered",
    })).toBe(false);
    expect(isServerActiveCustomerPopupSlotOwner({
      offerStatus: "open",
      expiryStatus: "active",
      deliveryStatus: "expired",
    })).toBe(false);
  });

  it("does not poll trade history for informational-only opportunity alerts", () => {
    expect(component).not.toContain("trpc.customer.trades.useQuery");
    expect(component).not.toContain("automaticTrade");
    expect(reviewPanel).toContain("Informational only");
  });
});
