import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeNextExecution, verifyScheduledCallback } from "./_core/heartbeat";

afterEach(() => vi.unstubAllEnvs());

describe("self-hosted scheduled jobs", () => {
  it("computes the next UTC occurrence for a six-field cron schedule", () => {
    const after = new Date("2026-10-26T10:06:10.000Z");
    expect(computeNextExecution("0 */5 * * * *", after).toISOString()).toBe("2026-10-26T10:10:00.000Z");
    expect(computeNextExecution("0 0 12 * * 1-5", after).toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });

  it("rejects schedules that could execute more than once per minute", () => {
    expect(() => computeNextExecution("*/10 * * * * *", new Date("2026-10-26T10:06:10.000Z"))).toThrow("second zero");
    expect(() => computeNextExecution("* * * * *", new Date("2026-10-26T10:06:10.000Z"))).toThrow("six UTC fields");
  });

  it("authenticates callback signatures over the task ID, timestamp and exact payload", () => {
    vi.stubEnv("SESSION_SECRET", "test-scheduler-secret");
    const taskUid = "scheduler-test-123";
    const timestamp = String(Date.now());
    const body = JSON.stringify({ event: "reconcile", idempotencyKey: "test-1" });
    const signature = crypto.createHmac("sha256", "test-scheduler-secret").update(`${taskUid}.${timestamp}.${body}`).digest("hex");
    expect(verifyScheduledCallback(taskUid, timestamp, body, signature)).toBe(true);
    expect(verifyScheduledCallback(taskUid, timestamp, body + " ", signature)).toBe(false);
    expect(verifyScheduledCallback(taskUid, String(Date.now() - 10 * 60_000), body, signature)).toBe(false);
  });
});
