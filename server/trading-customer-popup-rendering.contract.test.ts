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
    const gate = component.indexOf("if(!isOfferCurrent(offer)||!canShow()||popupRef.current)");
    const markSeen = component.indexOf("seen.current.add(offerId)");
    const commitPopup = component.indexOf("setPopup(offer)");
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
    expect(component).toContain("offer.popupEligible===true");
    expect(component).toContain('String(offer.offerStatus||"").toLowerCase()==="open"');
  });

  it("does not rely on placeholder or pre-alert opportunities to render a real popup", () => {
    expect(component).toContain("isOfferOpen(offer)");
    expect(component).toContain("Boolean(delivery?.enabled&&policy)");
    expect(component).toContain("isOfferCurrent(offer)");
    expect(component).toContain("popupRef.current=offer");
    expect(component).toContain("current.popupEligible===true");
  });

  it("minimizes after the configured display time instead of removing a still-open opportunity", () => {
    expect(component).toContain("timer.current=window.setTimeout(()=>{");
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
    expect(delivery).toContain('["delivered","received","rendered","failed"].includes(String(row.deliveryStatus))');
    expect(delivery).toContain("a refreshed customer portal can retry rendering and status recording");
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
