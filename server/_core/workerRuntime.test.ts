import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWorkerInterval, stopWorkerIntervals } from "./workerRuntime";
import { runMonitoredWorkerCycle, waitForMonitoredWorkerCycles } from "./workerHealth";

describe("server worker shutdown", () => {
  afterEach(() => {
    stopWorkerIntervals();
    vi.useRealTimers();
  });

  it("clears registered worker intervals so no new cycles are scheduled", () => {
    vi.useFakeTimers();
    registerWorkerInterval(() => undefined, 1_000);
    expect(vi.getTimerCount()).toBe(1);
    expect(stopWorkerIntervals()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for an active monitored worker cycle to finish", async () => {
    let finishCycle: (() => void) | undefined;
    const cycle = runMonitoredWorkerCycle("trading-opportunities", () => new Promise<void>((resolve) => {
      finishCycle = resolve;
    }));
    const drained = waitForMonitoredWorkerCycles();
    await Promise.resolve();
    expect(finishCycle).toBeTypeOf("function");
    finishCycle?.();
    await expect(cycle).resolves.toBeUndefined();
    await expect(drained).resolves.toBeUndefined();
  });
});
