import { describe, expect, it } from "vitest";
import { deriveWorkerHealthStatus, sanitizeWorkerErrorMessage } from "./workerHealth";

describe("deriveWorkerHealthStatus", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  const threshold = 60_000;

  it("reports workers that have not run as not_started", () => {
    expect(deriveWorkerHealthStatus({ status: null, heartbeatAt: null }, threshold, now)).toBe("not_started");
  });

  it("keeps a recent successful cycle healthy", () => {
    expect(deriveWorkerHealthStatus({ status: "healthy", heartbeatAt: new Date(now - 5_000) }, threshold, now)).toBe("healthy");
  });

  it("marks a previously healthy worker stale when its heartbeat expires", () => {
    expect(deriveWorkerHealthStatus({ status: "healthy", heartbeatAt: new Date(now - threshold - 1) }, threshold, now)).toBe("stale");
  });

  it("preserves degraded status until a successful cycle completes", () => {
    expect(deriveWorkerHealthStatus({ status: "degraded", heartbeatAt: new Date(now - 10_000) }, threshold, now)).toBe("degraded");
  });

  it("marks an abandoned running cycle stale after its health window", () => {
    expect(deriveWorkerHealthStatus({ status: "running", heartbeatAt: new Date(now - threshold - 1) }, threshold, now)).toBe("stale");
  });
});


describe("sanitizeWorkerErrorMessage", () => {
  it("removes connection credentials and common secret fields from errors", () => {
    const message = sanitizeWorkerErrorMessage(
      "mysql://user:password@db.example/app password=hunter2 Bearer abc.def.ghi API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
    );
    expect(message).not.toContain("user:password");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("abc.def.ghi");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(message).toContain("[redacted]");
  });
});
