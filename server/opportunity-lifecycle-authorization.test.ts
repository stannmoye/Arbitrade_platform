import { describe, expect, it } from "vitest";
import { updatePopupLifecycle } from "./opportunityLifecycle";

describe("customer popup lifecycle authorization boundary", () => {
  it.each(["withdrawn", "traded", "settled"])(
    "rejects customer attempt to set server-owned %s state",
    async (action) => {
      await expect(
        updatePopupLifecycle(42, 7, action as any),
      ).rejects.toThrow("Customer popup lifecycle action is not permitted.");
    },
  );
});
