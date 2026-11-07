import { describe, expect, it, vi } from "vitest";
import { acknowledgePopupDelivery } from "./popup-delivery-acknowledgement";

describe("popup delivery receipt and rendering acknowledgements", () => {
  it("records receipt before rendered after the browser has displayed the notice", async () => {
    const order: string[] = [];
    const result = await acknowledgePopupDelivery({
      received: async () => { order.push("received"); },
      rendered: async () => { order.push("rendered"); },
      isCurrent: () => true,
      wait: async () => {},
    });
    expect(result).toBe("acknowledged");
    expect(order).toEqual(["received", "rendered"]);
  });

  it("retries a rendered acknowledgement whose response was interrupted after receipt", async () => {
    let receivedCalls = 0;
    let renderedCalls = 0;
    const result = await acknowledgePopupDelivery({
      received: async () => { receivedCalls += 1; },
      rendered: async () => { renderedCalls += 1; if (renderedCalls === 1) throw new Error("response lost"); },
      isCurrent: () => true,
      wait: async () => {},
    });
    expect(result).toBe("acknowledged");
    expect(receivedCalls).toBe(2);
    expect(renderedCalls).toBe(2);
  });

  it("repeats receipt when its response was lost, then safely proceeds to rendering", async () => {
    let receivedCalls = 0;
    let renderedCalls = 0;
    const result = await acknowledgePopupDelivery({
      received: async () => { receivedCalls += 1; if (receivedCalls === 1) throw new Error("receipt response lost"); },
      rendered: async () => { renderedCalls += 1; },
      isCurrent: () => true,
      wait: async () => {},
    });
    expect(result).toBe("acknowledged");
    expect(receivedCalls).toBe(2);
    expect(renderedCalls).toBe(1);
  });

  it("requests a later retry without reporting delivery failure after temporary outage", async () => {
    const received = vi.fn().mockRejectedValue(new Error("offline"));
    const rendered = vi.fn();
    const result = await acknowledgePopupDelivery({ received, rendered, isCurrent: () => true, wait: async () => {} });
    expect(result).toBe("retry");
    expect(received).toHaveBeenCalledTimes(3);
    expect(rendered).not.toHaveBeenCalled();
  });

  it("stops retries when the displayed popup is no longer the current delivery", async () => {
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const received = vi.fn().mockRejectedValue(new Error("offline"));
    const rendered = vi.fn();
    const result = await acknowledgePopupDelivery({ received, rendered, isCurrent, wait: async () => {} });
    expect(result).toBe("cancelled");
    expect(received).toHaveBeenCalledTimes(1);
    expect(rendered).not.toHaveBeenCalled();
  });

  it("rejects invalid retry bounds", async () => {
    await expect(acknowledgePopupDelivery({
      received: async () => {}, rendered: async () => {}, isCurrent: () => true, maxAttempts: 0,
    })).rejects.toThrow("integer from 1 to 10");
  });
});
