import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const start = app.indexOf("function CustomerOpportunityAlert(");
const end = app.indexOf("\nfunction CustomerDashboard(", start);
const component = app.slice(start, end);

describe("customer opportunity popup retry and visibility gates", () => {
  it("does not mark an offer as seen before all display gates pass", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const gate = component.indexOf("if(!isOfferCurrent(offer)||!canShow()||popupRef.current)");
    const markSeen = component.indexOf("seen.current.add(offer.id)");
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
    expect(displayBody).toContain("displaying.current.add(offer.id)");
    expect(displayBody).toContain("displaying.current.delete(offer.id)");
    expect(displayBody).toContain("displaying.current.has(offer.id)");
    expect(displayBody).toContain("seen.current.add(offer.id)");
    expect(displayBody).toContain("navigator");
    expect(displayBody).toContain("displaying.current.delete(offer.id);");
    const considerBody = component.slice(consider, component.indexOf("const attemptNext", consider));
    expect(considerBody).toContain("displaying.current.has(offer.id)");
    expect(considerBody).not.toContain("seen.current.add(offer.id)");
  });

  it("retries eligible offers when delivery becomes enabled again", () => {
    expect(component).toContain("const canShow=()=>Boolean(delivery?.enabled&&policy)");
    expect(component).toContain("attemptNext(opportunityData?.offers||[])");
    expect(component).toContain("window.setInterval(()=>attemptNext(opportunityData?.offers||[]),5000)");
    expect(component).toContain("displaying.current.clear()");
    expect(component).toContain("seen.current.clear()");
  });

  it("does not rely on placeholder or pre-alert opportunities to render a real popup", () => {
    expect(component).toContain("offer.popupEligible===true");
    expect(component).toContain("isOfferOpen(offer)");
    expect(component).toContain("Boolean(delivery?.enabled&&policy)");
    expect(component).toContain("isOfferCurrent(offer)");
    expect(component).toContain("popupRef.current=offer");
  });
});
