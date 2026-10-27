import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("live trading execution safety gate", () => {
  it("blocks new allocations before wallet reservation when no verified execution adapter is wired", () => {
    const start = source.indexOf("export async function createTrade(");
    const end = source.indexOf("\nexport async function ", start + 5);
    const implementation = source.slice(start, end);
    const replay = implementation.indexOf('if(event.eventStatus==="TRADED"');
    const gate = implementation.indexOf('assertExecutionAllowed("LIVE")');
    const walletMutation = implementation.indexOf("balanceLedger");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(gate).toBeGreaterThan(replay);
    expect(walletMutation).toBeGreaterThan(gate);
    expect(implementation).toContain("fail closed before any new funds are reserved");
    expect(implementation).toContain("verified execution and settlement mechanism");
  });

  it("preserves an opportunity for retry instead of marking it missed when the provider is unavailable", () => {
    expect(source).toContain('errorCode:"LIVE_EXECUTION_PROVIDER_UNAVAILABLE"');
    expect(source).toContain("releaseAttempt:true");
    expect(source).toContain("if(/Live execution is blocked until a verified execution and settlement mechanism is configured/i.test(message))");
  });
});
