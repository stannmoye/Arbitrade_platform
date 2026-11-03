import { describe, expect, it } from "vitest";
import { decodePayoutHistoryCursor, encodePayoutHistoryCursor } from "./db";
describe("manual payout history continuation cursor", () => {
  it("uses a stable composite timestamp/id position for equal creation timestamps", () => {
    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    const newer = encodePayoutHistoryCursor(createdAt, 31);
    const older = encodePayoutHistoryCursor(createdAt, 30);
    expect(decodePayoutHistoryCursor(newer)).toEqual({ createdAt: createdAt.toISOString(), id: 31 });
    expect(decodePayoutHistoryCursor(older)).toEqual({ createdAt: createdAt.toISOString(), id: 30 });
    expect(decodePayoutHistoryCursor(newer)!.id).toBeGreaterThan(decodePayoutHistoryCursor(older)!.id);
  });
  it("rejects malformed continuation cursors", () => {
    expect(() => decodePayoutHistoryCursor("not-a-cursor")).toThrow("Payout history cursor is invalid");
    expect(() => decodePayoutHistoryCursor(Buffer.from(JSON.stringify({ id: 1 })).toString("base64url"))).toThrow("Payout history cursor is invalid");
  });
});
