import { describe, expect, it } from "vitest";
import { presentSimulatedActivity } from "./transactionConsole";

describe("transaction-console simulated activity labeling", () => {
  it.each(["COMPLETED", "FAILED", "STALLED", "PROCESSING", "DELAYED"] as const)(
    "never presents generated %s telemetry as a real transaction", (outcome) => {
      const presentation = presentSimulatedActivity(outcome, "Example activity phrase");

      expect(presentation.status).toBe("SIMULATED");
      expect(presentation.title).toMatch(/simulated/i);
      expect(presentation.message).toMatch(/^SIMULATION ONLY — no wallet movement was performed\./);
      expect(presentation.message).toContain("Example activity phrase");
      expect(presentation.simulatedOutcome).toBe(outcome);
    },
  );
});
