import { describe, expect, it, vi } from "vitest";
import { createMiningNotification, MiningError } from "../mining-store";

function connection() {
  return { execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
}

describe("mining notification persistence", () => {
  it("stores mining category and recipient-scoped idempotency keys", async () => {
    const conn = connection();
    await createMiningNotification(conn as any, 42, "  Mining reward confirmed  ", "  Reward was recorded.  ", "mining-reward:ledger-123");

    expect(conn.execute).toHaveBeenCalledOnce();
    const [sql, values] = conn.execute.mock.calls[0];
    expect(sql).toContain("eventKey");
    expect(sql).toContain("category");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(values).toEqual([
      42,
      "Mining reward confirmed",
      "Reward was recorded.",
      "u42:mining-reward:ledger-123",
      "mining",
      "normal",
    ]);
  });

  it("keeps unkeyed mining messages categorized without fabricating an event key", async () => {
    const conn = connection();
    await createMiningNotification(conn as any, 7, "Mining boost activated", "Your boost is active.");

    const [sql, values] = conn.execute.mock.calls[0];
    expect(sql).not.toContain("eventKey");
    expect(values).toEqual([7, "Mining boost activated", "Your boost is active.", "mining", "normal"]);
  });

  it("rejects invalid recipients, empty content and event keys that exceed the database limit", async () => {
    const conn = connection();
    await expect(createMiningNotification(conn as any, 0, "Title", "Body")).rejects.toBeInstanceOf(MiningError);
    await expect(createMiningNotification(conn as any, 7, " ", "Body")).rejects.toBeInstanceOf(MiningError);
    await expect(createMiningNotification(conn as any, 7, "Title", "Body", "x".repeat(180))).rejects.toBeInstanceOf(MiningError);
    expect(conn.execute).not.toHaveBeenCalled();
  });
});
