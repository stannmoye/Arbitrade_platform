import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  createPool: vi.fn(),
  getConnection: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({ default: { createPool: db.createPool } }));
vi.mock("./_core/mysql", () => ({ mysqlConnectionOptions: () => ({}) }));

import { getOpportunityLifecycleSummary } from "./opportunityLifecycle";

const overviewSource = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("Trading Overview lifecycle source availability", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://not-connected.test/database");
    db.createPool.mockReset().mockReturnValue({ getConnection: db.getConnection, end: db.end });
    db.getConnection.mockReset().mockResolvedValue({ query: db.query, release: db.release });
    db.query.mockReset();
    db.release.mockReset();
    db.end.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks the lifecycle summary unavailable without a configured database and does not create a pool", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const summary = await getOpportunityLifecycleSummary();

    expect(summary).toMatchObject({ sourceAvailable: false, last24Hours: {}, retainedDaily: [], generatedAt: null });
    expect(db.createPool).not.toHaveBeenCalled();
  });

  it("preserves actual zero counts after a successful empty database aggregate", async () => {
    db.query
      .mockResolvedValueOnce([[
        { generated: 0, queued: 0, received: 0, rendered: 0, failed: 0, expired: 0, persisted: 0, noticed: 0, opened: 0, dismissed: 0, withdrawn: 0, traded: 0, settled: 0, zeroBalance: 0 },
      ], []])
      .mockResolvedValueOnce([[], []]);

    const summary = await getOpportunityLifecycleSummary();

    expect(summary.sourceAvailable).toBe(true);
    expect(summary.last24Hours).toMatchObject({ generated: 0, queued: 0, received: 0, rendered: 0, failed: 0, expired: 0, persisted: 0, noticed: 0, opened: 0, dismissed: 0, withdrawn: 0, traded: 0, settled: 0, zeroBalance: 0 });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0]?.[0]).toContain("COUNT(DISTINCT CASE WHEN e.deliveryStatus IN ('queued','in_progress','retry_wait')");
    expect(db.query.mock.calls[0]?.[0]).toContain("COUNT(DISTINCT CASE WHEN e.deliveryStatus='received'");
    expect(db.query.mock.calls[0]?.[0]).toContain("COUNT(DISTINCT CASE WHEN e.deliveryStatus='rendered'");
    expect(db.query.mock.calls[0]?.[0]).toContain("COUNT(DISTINCT CASE WHEN e.deliveryStatus='failed'");
    expect(db.query.mock.calls[0]?.[0]).toContain("COUNT(DISTINCT CASE WHEN e.deliveryStatus='expired'");
    expect(db.query.mock.calls[0]?.[0]).toContain("opportunity_generation_assignments");
    expect(db.query.mock.calls[0]?.[0]).toContain("MAX(id) AS id");
    expect(db.release).toHaveBeenCalledOnce();
    expect(db.end).toHaveBeenCalledOnce();
  });

  it("renders unavailable for missing lifecycle metrics instead of synthesizing zero", () => {
    const start = overviewSource.indexOf("export function AdminTradeSettingsOverview()");
    const end = overviewSource.indexOf("export function AdminVerificationOversight()", start);
    const overview = overviewSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(overview).toContain("const sourceAvailable = data.sourceAvailable === true;");
    expect(overview).toContain("const count = (loading: boolean, failed: boolean, value: unknown, available = true)");
    expect(overview).toContain('if (!available || value == null) return "Unavailable";');
    expect(overview).toContain("Number.isFinite(parsed) ? parsed.toLocaleString() : \"Unavailable\"");
    expect(overview).toContain("const lifecycleUpdated = lifecycle.isLoading ? \"Loading\" : lifecycle.isError || !sourceAvailable ? \"Unavailable\" : timestamp(data.generatedAt);");
    expect(overview).toContain("Lifecycle snapshot generated {lifecycleUpdated}");
    expect(overview).toContain("count(lifecycle.isLoading, lifecycle.isError, totals.generated, sourceAvailable)");
    expect(overview).toContain("count(policies.isLoading, policies.isError, (policies.data ?? []).filter((policy) => policy.enabled).length)");
    expect(overview).not.toContain("Number(value ?? 0)");
  });
});
