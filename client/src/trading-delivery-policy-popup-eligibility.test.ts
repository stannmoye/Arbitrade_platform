import { describe, expect, it } from "vitest";
import { isFreshCustomerPopupCandidate } from "./customer-popup-eligibility";
const valid = { popupEligible: true, eventStatus: "DELIVERED", deliveryStatus: "delivered", offerStatus: "open", closesAt: "2030-01-01T00:00:00.000Z" };
describe("customer popup persisted delivery eligibility", () => {
  it("recovers persisted delivered, received and rendered items after refresh", () => {
    for (const deliveryStatus of ["delivered", "received", "rendered"]) expect(isFreshCustomerPopupCandidate({ ...valid, deliveryStatus }, Date.parse("2029-01-01"))).toBe(true);
  });
  it("accepts a claimed in-progress delivery only when the server supplies its lease token", () => {
    expect(isFreshCustomerPopupCandidate({ ...valid, deliveryStatus: "in_progress", deliveryLeaseToken: "dispatch-lease" }, Date.parse("2029-01-01"))).toBe(true);
    for (const deliveryLeaseToken of [undefined, null, "", "   "]) {
      expect(isFreshCustomerPopupCandidate({ ...valid, deliveryStatus: "in_progress", deliveryLeaseToken }, Date.parse("2029-01-01"))).toBe(false);
    }
  });
  it("does not present queued, retry-wait, failed or dismissed delivery as a fresh alert", () => {
    for (const deliveryStatus of ["queued", "retry_wait", "failed", "dismissed", "expired"]) expect(isFreshCustomerPopupCandidate({ ...valid, deliveryStatus }, Date.parse("2029-01-01"))).toBe(false);
  });
  it("never revives dismissed or terminal/expired offers", () => {
    for (const eventStatus of ["DISMISSED", "EXPIRED", "FAILED", "WITHDRAWN", "TRADED", "SETTLED"]) expect(isFreshCustomerPopupCandidate({ ...valid, eventStatus }, Date.parse("2029-01-01"))).toBe(false);
    expect(isFreshCustomerPopupCandidate({ ...valid, closesAt: "2028-01-01T00:00:00.000Z" }, Date.parse("2029-01-01"))).toBe(false);
  });
});
