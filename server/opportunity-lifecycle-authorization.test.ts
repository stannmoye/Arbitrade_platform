import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { updatePopupLifecycle } from "./opportunityLifecycle";

const lifecycleSource = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("customer popup lifecycle authorization boundary", () => {
  it("does not let customer acknowledgements overwrite server-owned terminal outcomes", () => {
    expect(lifecycleSource).toContain('action === "noticed" || action === "opened"');
    expect(lifecycleSource).toContain("eventStatus NOT IN ('TRADED','SETTLED','WITHDRAWN')");
    expect(lifecycleSource).toContain("deliveryStatus NOT IN ('failed','dismissed','expired')");
    expect(lifecycleSource).toContain("Server-owned terminal transitions must still allow TRADED -> SETTLED.");
  });

  it("allows only receipt/render acknowledgements through the customer API", () => {
    expect(routerSource).toContain('status: z.enum(["received","rendered"])');
    expect(routerSource).not.toContain('status: z.enum(["received","rendered","failed"])');
    expect(lifecycleSource).toContain('status: "received" | "rendered"');
    expect(lifecycleSource).not.toContain('status: "received" | "rendered" | "failed"');
    expect(lifecycleSource).toContain("LIMIT 1 FOR UPDATE");
    expect(lifecycleSource).toContain('if (currentDeliveryStatus !== "in_progress" && !finalRenderAfterReceipt)');
  });

  it.each(["withdrawn", "traded", "settled"])(
    "rejects customer attempt to set server-owned %s state",
    async (action) => {
      await expect(
        updatePopupLifecycle(42, 7, action as any),
      ).rejects.toThrow("Customer popup lifecycle action is not permitted.");
    },
  );
});
