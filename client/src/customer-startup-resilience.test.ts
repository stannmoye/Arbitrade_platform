import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

describe("customer portal startup resilience", () => {
  it("mounts the application without waiting for customer-only CSS chunks", () => {
    const customerStyleGate = entry.indexOf('if (window.location.pathname.startsWith("/customer"))');
    const stylesheetImport = entry.indexOf('import("./customer-reference.css")');
    const rootMount = entry.lastIndexOf("\nrenderApp();");

    expect(customerStyleGate).toBeGreaterThan(-1);
    expect(stylesheetImport).toBeGreaterThan(customerStyleGate);
    expect(rootMount).toBeGreaterThan(stylesheetImport);
    expect(entry).not.toContain(".finally(renderApp)");
    expect(entry).toContain('console.error("[Customer styles] Unable to load customer theme styles", error)');
  });

  it("keeps stylesheet failure separate from React initialization", () => {
    const stylesheetImport = entry.indexOf('import("./customer-reference.css")');
    const rootMount = entry.lastIndexOf("\nrenderApp();");
    const customerStylesBlock = entry.slice(stylesheetImport, rootMount);

    expect(customerStylesBlock).not.toContain("await ");
    expect(customerStylesBlock).not.toContain("renderApp");
    expect(entry.match(/renderApp\(\);/g)).toHaveLength(1);
  });
});
