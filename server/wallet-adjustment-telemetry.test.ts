import { describe, expect, it, vi } from "vitest";
import { commitThenRecordWalletTelemetry } from "./wallet-adjustment-telemetry";

describe("commitThenRecordWalletTelemetry", () => {
  it("returns the committed result when telemetry succeeds", async () => {
    const result = { success: true, newAvailableMinor: 125 };
    const events: string[] = [];
    const returned = await commitThenRecordWalletTelemetry(
      async () => {
        events.push("commit");
        return result;
      },
      async committed => {
        events.push("telemetry");
        expect(committed).toBe(result);
      },
    );

    expect(events).toEqual(["commit", "telemetry"]);
    expect(returned).toBe(result);
  });

  it("does not turn a committed wallet adjustment into a failure when telemetry throws", async () => {
    const result = { success: true, newAvailableMinor: 125 };
    const events: string[] = [];
    const failures: unknown[] = [];
    const returned = await commitThenRecordWalletTelemetry(
      async () => {
        events.push("commit");
        return result;
      },
      async () => {
        events.push("telemetry");
        throw new Error("console database unavailable");
      },
      error => failures.push(error),
    );

    expect(events).toEqual(["commit", "telemetry"]);
    expect(returned).toBe(result);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: "console database unavailable" });
  });

  it("still returns the committed result if the telemetry failure reporter also throws", async () => {
    const result = { success: true, newAvailableMinor: 125 };
    await expect(
      commitThenRecordWalletTelemetry(
        async () => result,
        async () => {
          throw new Error("telemetry unavailable");
        },
        () => {
          throw new Error("logger unavailable");
        },
      ),
    ).resolves.toBe(result);
  });

  it("does not attempt telemetry when the wallet commit itself fails", async () => {
    const telemetry = vi.fn(async () => undefined);
    await expect(
      commitThenRecordWalletTelemetry(
        async () => {
          throw new Error("wallet transaction failed");
        },
        telemetry,
      ),
    ).rejects.toThrow("wallet transaction failed");
    expect(telemetry).not.toHaveBeenCalled();
  });
});
