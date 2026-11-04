import { describe, expect, it } from "vitest";
import { isFreshCustomerPopupCandidate } from "./customer-popup-eligibility";

const now = 1_800_000_000_000;
const baseOffer = {
  popupEligible: true,
  eventStatus: "DELIVERED",
  offerStatus: "open",
  closesAt: new Date(now + 60_000).toISOString(),
};

describe("customer popup eligibility", () => {
  it("allows an actively leased in-progress delivery to render", () => {
    expect(isFreshCustomerPopupCandidate({
      ...baseOffer,
      deliveryStatus: "in_progress",
      deliveryLeaseToken: "active-test-lease",
    }, now)).toBe(true);
    expect(isFreshCustomerPopupCandidate({
      ...baseOffer,
      deliveryStatus: "in_progress",
    }, now)).toBe(false);
  });

  it("continues to allow acknowledged delivery states", () => {
    for (const deliveryStatus of ["delivered", "received", "rendered"]) {
      expect(isFreshCustomerPopupCandidate({
        ...baseOffer,
        deliveryStatus,
      }, now)).toBe(true);
    }
  });

  it("does not display a popup that has not been claimed for dispatch", () => {
    for (const deliveryStatus of ["queued", "retry_wait", "failed", "dismissed", "expired"]) {
      expect(isFreshCustomerPopupCandidate({
        ...baseOffer,
        deliveryStatus,
      }, now)).toBe(false);
    }
  });
});
