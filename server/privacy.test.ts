import { describe, expect, it } from "vitest";
import {
  canTransitionPrivacyRequest,
  nextPrivacyVersion,
  privacyRequestStatusMessage,
} from "../shared/privacy";

describe("privacy policy versioning", () => {
  it("increments minor versions without overwriting a prior published version", () => {
    expect(nextPrivacyVersion("1.0")).toBe("1.1");
    expect(nextPrivacyVersion("1.9")).toBe("1.10");
    expect(nextPrivacyVersion("2.4")).toBe("2.5");
  });

  it("starts a clean version sequence when no valid published version exists", () => {
    expect(nextPrivacyVersion(null)).toBe("1.0");
    expect(nextPrivacyVersion("draft-0001")).toBe("1.0");
  });
});

describe("privacy request workflow", () => {
  it("allows a submitted request to enter review or be cancelled, but not skip to completion", () => {
    expect(canTransitionPrivacyRequest("submitted", "in_review")).toBe(true);
    expect(canTransitionPrivacyRequest("submitted", "cancelled")).toBe(true);
    expect(canTransitionPrivacyRequest("submitted", "completed")).toBe(false);
  });

  it("requires a supported transition out of identity check", () => {
    expect(canTransitionPrivacyRequest("identity_check", "awaiting_customer")).toBe(true);
    expect(canTransitionPrivacyRequest("identity_check", "completed")).toBe(false);
  });

  it("keeps terminal privacy-request states terminal", () => {
    expect(canTransitionPrivacyRequest("completed", "in_review")).toBe(false);
    expect(canTransitionPrivacyRequest("declined", "in_review")).toBe(false);
    expect(canTransitionPrivacyRequest("cancelled", "in_review")).toBe(false);
    expect(canTransitionPrivacyRequest("completed", "completed")).toBe(true);
  });

  it("provides a customer-safe message for every workflow status", () => {
    for (const status of ["submitted", "identity_check", "in_review", "awaiting_customer", "completed", "declined", "cancelled"] as const) {
      expect(privacyRequestStatusMessage(status).length).toBeGreaterThan(15);
    }
  });
});
