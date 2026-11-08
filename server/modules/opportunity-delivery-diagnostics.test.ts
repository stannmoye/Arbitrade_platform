import { describe, expect, it } from "vitest";
import {
  classifyDeliveryFailure,
  decodeDeliveryDiagnosticCursor,
  encodeDeliveryDiagnosticCursor,
  safeDeliveryDiagnosticMessage,
} from "./opportunity-delivery-diagnostics";

describe("opportunity delivery diagnostics helpers", () => {
  it("classifies only explicit evidence and does not infer popup render failure from a missing acknowledgement", () => {
    expect(classifyDeliveryFailure({ errorCode: "QUEUE_INSERTION_FAILED" })).toBe("queue_insertion_failure");
    expect(classifyDeliveryFailure({ errorCode: "COMPANY_APPROVAL_REJECTED" })).toBe("company_approval_failure");
    expect(classifyDeliveryFailure({ deliveryStatus: "queue_admission_skipped" })).toBeNull();
    expect(safeDeliveryDiagnosticMessage("COMPANY_APPROVAL_REJECTED")).toContain("company was not approved");
    expect(classifyDeliveryFailure({ errorCode: "DELIVERY_LEASE_EXPIRED" })).toBe("browser_acknowledgement_timeout");
    expect(classifyDeliveryFailure({ errorCode: "POPUP_RENDER_FAILED" })).toBe("popup_rendering_failure");
    expect(classifyDeliveryFailure({ errorCode: "OPPORTUNITY_EXPIRED" })).toBe("expiration_before_delivery");
    expect(classifyDeliveryFailure({ errorCode: "OPPORTUNITY_EXPIRED", receivedAt: "2026-11-08T12:00:00.000Z" })).toBeNull();
    expect(classifyDeliveryFailure({ errorCode: "OPPORTUNITY_EXPIRED", renderedAt: "2026-11-08T12:00:00.000Z" })).toBeNull();
    expect(safeDeliveryDiagnosticMessage("OPPORTUNITY_EXPIRED", { receivedAt: "2026-11-08T12:00:00.000Z" })).toContain("after browser receipt");
    expect(classifyDeliveryFailure({ deliveryStatus: "failed" })).toBe("unknown_or_unclassified");
    expect(classifyDeliveryFailure({ deliveryStatus: "rendered" })).toBeNull();
  });

  it("round-trips a bounded keyset cursor and rejects malformed input", () => {
    const cursor = { generatedAt: "2026-11-08T12:00:00.000Z", opportunityId: 52 };
    expect(decodeDeliveryDiagnosticCursor(encodeDeliveryDiagnosticCursor(cursor))).toEqual(cursor);
    expect(() => decodeDeliveryDiagnosticCursor("not-a-cursor!" )).toThrow(RangeError);
    expect(() => encodeDeliveryDiagnosticCursor({ generatedAt: "invalid", opportunityId: 0 })).toThrow(RangeError);
  });
});
