import type { Express, Request, Response } from "express";

const practiceOpportunities = [
  { id: "practice-spatial-001", company: "Arbitrade Research Lab", title: "BTC / USDC route study", tradingType: "Spatial Arbitrage", mode: "PRACTICE", currency: "USD", fixedInvestment: "500.00", grossProfitRate: "0.82%", durationSeconds: 3600, status: "ACTIVE", maxPurchases: 25, currentPurchases: 8, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  { id: "research-triangle-002", company: "Arbitrade Research Lab", title: "ETH / USDT three-leg analysis", tradingType: "Triangular Arbitrage", mode: "RESEARCH", currency: "USD", fixedInvestment: "250.00", grossProfitRate: "0.64%", durationSeconds: 1800, status: "ACTIVE", maxPurchases: null, currentPurchases: 0, expiresAt: new Date(Date.now() + 172_800_000).toISOString() },
  { id: "simulation-cross-003", company: "Arbitrade Research Lab", title: "SOL / USDC cross-venue simulation", tradingType: "Cross-Exchange Arbitrage", mode: "SIMULATION", currency: "USD", fixedInvestment: "1000.00", grossProfitRate: "1.11%", durationSeconds: 7200, status: "ACTIVE", maxPurchases: 10, currentPurchases: 4, expiresAt: new Date(Date.now() + 43_200_000).toISOString() },
];

export function registerV5Api(app: Express) {
  app.get("/api/v5/overview", (_req: Request, res: Response) => res.json({
    environment: "PRACTICE",
    liveExecution: "BLOCKED",
    activePackage: { name: "Growth", status: "active", maxActiveInvestments: 3, maxPopupsPerMinute: 30 },
    balances: [
      { asset: "USD", available: "18420.84", locked: "1200.00", pending: "0.00", precision: 2 },
      { asset: "EUR", available: "4880.00", locked: "0.00", pending: "0.00", precision: 2 },
      { asset: "GBP", available: "1920.00", locked: "0.00", pending: "0.00", precision: 2 },
      { asset: "BTC", available: "0.18420000", locked: "0.00000000", pending: "0.00000000", precision: 8 },
      { asset: "ETH", available: "2.840000000000000000", locked: "0.000000000000000000", pending: "0.000000000000000000", precision: 18 },
    ],
    activeInvestments: 1,
    opportunities: practiceOpportunities,
    notices: ["All balances and outcomes are practice data.", "Live execution and verified returns are blocked until a provider mechanism is defined."],
  }));

  app.get("/api/v5/opportunities", (_req: Request, res: Response) => res.json({ mode: "PRACTICE", opportunities: practiceOpportunities }));
  app.get("/api/v5/admin/health", (_req: Request, res: Response) => res.json({ mode: "PRACTICE", liveExecution: "BLOCKED", database: Boolean(process.env.DATABASE_URL), fxProvider: "not configured", email: "not configured", failedJobs: 0 }));
}
