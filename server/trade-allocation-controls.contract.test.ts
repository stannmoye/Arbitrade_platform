import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0071_trade_allocation_pause.sql", import.meta.url), "utf8");
const journal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");

describe("global trade allocation pause", () => {
  it("ships a default-unpaused durable setting", () => {
    expect(migration).toContain("trading.allocations.paused");
    expect(migration).toContain('"allocationsPaused":false');
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(journal).toContain('"tag": "0071_trade_allocation_pause"');
  });

  it("fails closed when the stored safety setting is malformed", () => {
    expect(db).toContain("A malformed safety setting must fail closed");
    expect(db).toContain("Invalid global allocation safety setting shape");
    expect(db).toContain("Global allocation safety setting is missing; administrator review is required.");
    expect(db).toContain('allocationsPaused: true, reason: "Safety setting requires administrator review');
  });

  it("locks and audits pause/resume changes", () => {
    const start = db.indexOf("export async function setTradeAllocationControls(");
    const end = db.indexOf("export async function listAdminTradingPackages(", start);
    const implementation = db.slice(start, end);
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("v5AuditEvents");
    expect(implementation).toContain("trading_new_allocations_paused");
    expect(implementation).toContain("trading_new_allocations_resumed");
    expect(implementation).toContain("at least 8 characters");
  });

  it("filters automatic candidates and enforces the pause transactionally", () => {
    expect(db).toContain("offer.popupEligible!==true || allocationControls.allocationsPaused");
    const start = db.indexOf("export async function createTrade(");
    const end = db.indexOf("\nexport async function ", start + 5);
    const implementation = db.slice(start, end);
    expect(implementation).toContain('eq(appSettings.settingKey,"trading.allocations.paused")');
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("New trading allocations are paused by an administrator");
  });

  it("exposes the safety control only through administrator routes and UI", () => {
    expect(router).toContain("tradeAllocationControls: adminProcedure.query");
    expect(router).toContain("updateTradeAllocationControls: adminProcedure.input");
    expect(adminUi).toContain("trpc.adminOperations.tradeAllocationControls.useQuery");
    expect(adminUi).toContain("trpc.adminOperations.updateTradeAllocationControls.useMutation");
    expect(adminUi).toContain("Pause new allocations");
    expect(adminUi).toContain("Resume new allocations");
    expect(adminUi).toContain("Existing open trades are not changed");
    expect(adminUi).toContain('{section==="tradeSystemHealth"&&<AdminTradeAllocationControls/>}');
  });
});
