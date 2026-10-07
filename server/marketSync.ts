import crypto from "node:crypto";
import { and, desc, eq, gt, lt, lte } from "drizzle-orm";
import { getAppSetting, getDb } from "./db";
import { currencyRegistry, fxRateSnapshots, marketInstruments, marketSnapshots, opportunityOffers } from "../drizzle/schema";
import { fetchCryptoRates, fetchFiatRates, fetchMostActiveStocks } from "./marketProviders";

const simulationValue = (symbol: string, observedAt: Date, min: number, max: number) => {
  const bucket = Math.floor(observedAt.getTime() / (15 * 60 * 1000));
  const digest = crypto.createHash("sha256").update(`${symbol}:${bucket}:${process.env.SIMULATION_SALT || "arbitrade-default"}`).digest();
  const fraction = digest.readUInt32BE(0) / 0xffffffff;
  return Math.round(min + fraction * (max - min));
};

export async function refreshMarketData() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const refreshedAt = new Date();
  const [stocks, fiat, cryptoRates] = await Promise.allSettled([fetchMostActiveStocks(200), fetchFiatRates(), fetchCryptoRates()]);
  let stocksStored = 0;
  if (stocks.status === "fulfilled") {
    for (const stock of stocks.value) {
      if (!stock.symbol) continue;
      await db.insert(marketInstruments).values({ symbol: stock.symbol, name: stock.name, exchange: stock.exchange, country: stock.country, sector: stock.sector, industry: stock.industry, listingStatus: stock.listingStatus, source: "nasdaq-screener", rawJson: JSON.stringify(stock.raw) }).onDuplicateKeyUpdate({ set: { name: stock.name, exchange: stock.exchange, country: stock.country, sector: stock.sector, industry: stock.industry, listingStatus: stock.listingStatus, source: "nasdaq-screener", rawJson: JSON.stringify(stock.raw), updatedAt: new Date() } });
      const instrument = (await db.select({ id: marketInstruments.id }).from(marketInstruments).where(eq(marketInstruments.symbol, stock.symbol)).limit(1))[0];
      if (!instrument) continue;
      await db.insert(marketSnapshots).values({ instrumentId: instrument.id, priceUsd: stock.priceUsd, marketValueUsd: stock.marketValueUsd, volume: stock.volume, netChange: stock.netChange, percentChange: stock.percentChange, observedAt: stock.observedAt, source: "nasdaq-screener", rawJson: JSON.stringify(stock.raw) });
      stocksStored++;
    }
  }
  let fxStored = 0;
  if (fiat.status === "fulfilled") for (const row of fiat.value) {
    await db.insert(fxRateSnapshots).values({ baseAsset: row.base, quoteAsset: row.quote, rate: row.rate, provider: "frankfurter-ecb", sourceDate: row.sourceDate, rawJson: JSON.stringify(row.raw) });
    const usdRate = String(1 / Number(row.rate));
    await db.insert(currencyRegistry).values({ code: row.quote, name: row.quote === "EUR" ? "Euro" : "British Pound", symbol: row.quote === "EUR" ? "€" : "£", scale: 2, assetType: "fiat", usdRate, rateProvider: "frankfurter-ecb", externalCode: row.quote, enabled: true }).onDuplicateKeyUpdate({ set: { usdRate, rateProvider: "frankfurter-ecb", externalCode: row.quote, enabled: true, updatedAt: new Date() } });
    fxStored++;
  }
  if (cryptoRates.status === "fulfilled") for (const row of cryptoRates.value) {
    await db.insert(fxRateSnapshots).values({ baseAsset: row.base, quoteAsset: row.quote, rate: row.rate, provider: "coingecko", sourceDate: row.sourceDate?.slice(0, 16) ?? null, rawJson: JSON.stringify(row.raw) });
    await db.insert(currencyRegistry).values({ code: row.base, name: row.base === "BTC" ? "Bitcoin" : "Ethereum", symbol: row.base === "BTC" ? "₿" : "Ξ", scale: 8, assetType: "crypto", usdRate: row.rate, rateProvider: "coingecko", externalCode: row.base === "BTC" ? "bitcoin" : "ethereum", enabled: true }).onDuplicateKeyUpdate({ set: { usdRate: row.rate, rateProvider: "coingecko", externalCode: row.base === "BTC" ? "bitcoin" : "ethereum", enabled: true, updatedAt: new Date() } });
    fxStored++;
  }
  return { stocksStored, fxStored, refreshedAt, errors: [stocks, fiat, cryptoRates].filter(x => x.status === "rejected").map(x => x.status === "rejected" ? String(x.reason) : "") };
}

export async function ensureMarketDrivenOpportunities(refreshedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const now = new Date();
  await db.update(opportunityOffers).set({ status: "closed" }).where(and(eq(opportunityOffers.status, "open"), lt(opportunityOffers.marketObservedAt, refreshedAt)));
  const active = await db.select({ symbol: opportunityOffers.symbol }).from(opportunityOffers).where(and(eq(opportunityOffers.status, "open"), gt(opportunityOffers.closesAt, now)));
  const activeSymbols = new Set(active.map(row => row.symbol));
  const instruments = await db.select().from(marketInstruments).orderBy(desc(marketInstruments.updatedAt)).limit(200);
  const deskLabel = await getAppSetting("opportunity.deskLabel");
  if (!deskLabel) throw new Error("Database setting opportunity.deskLabel is missing");
  let created = 0;
  for (const instrument of instruments) {
    if (activeSymbols.has(instrument.symbol)) continue;
    const snapshot = (await db.select().from(marketSnapshots).where(eq(marketSnapshots.instrumentId, instrument.id)).orderBy(desc(marketSnapshots.observedAt)).limit(1))[0];
    if (!snapshot) continue;
    const minimumMinor = simulationValue(instrument.symbol, snapshot.observedAt, 30_000, 36_000_000);
    const expectedRewardBps = simulationValue(`${instrument.symbol}:reward`, snapshot.observedAt, 1000, 3500);
    const durationSeconds = simulationValue(`${instrument.symbol}:duration`, snapshot.observedAt, 900, 3600);
    const opensAt = new Date();
    const closesAt = new Date(opensAt.getTime() + durationSeconds * 1000);
    await db.insert(opportunityOffers).values({ symbol: instrument.symbol, venueFrom: instrument.exchange || "Listed market", venueTo: deskLabel, currency: "USD", minimumMinor, expectedRewardBps, durationSeconds, opensAt, closesAt, rewardAt: closesAt, status: "open", instrumentId: instrument.id, marketSnapshotId: snapshot.id, marketValueUsd: snapshot.marketValueUsd, sector: instrument.sector, industry: instrument.industry, listingStatus: instrument.listingStatus, marketObservedAt: snapshot.observedAt, simulationSeed: crypto.randomBytes(16).toString("hex") });
    created++;
  }
  return { created, available: instruments.length };
}
