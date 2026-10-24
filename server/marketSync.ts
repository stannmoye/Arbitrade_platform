import crypto from "node:crypto";
import { and, desc, eq, gt, inArray, lt, lte } from "drizzle-orm";
import { countOutstandingTrades, getAppSetting, getDb, getTradeSettlementPolicy } from "./db";
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
    const metadata = row.base === "BTC" ? { name: "Bitcoin", symbol: "₿", scale: 8, externalCode: "bitcoin" } : row.base === "ETH" ? { name: "Ethereum", symbol: "Ξ", scale: 8, externalCode: "ethereum" } : { name: "Tether USD", symbol: "₮", scale: 6, externalCode: "tether" };
    await db.insert(currencyRegistry).values({ code: row.base, name: metadata.name, symbol: metadata.symbol, scale: metadata.scale, assetType: "crypto", usdRate: row.rate, rateProvider: "coingecko", externalCode: metadata.externalCode, enabled: true }).onDuplicateKeyUpdate({ set: { name: metadata.name, symbol: metadata.symbol, scale: metadata.scale, usdRate: row.rate, rateProvider: "coingecko", externalCode: metadata.externalCode, enabled: true, updatedAt: new Date() } });
    fxStored++;
  }
  return { stocksStored, fxStored, refreshedAt, errors: [stocks, fiat, cryptoRates].filter(x => x.status === "rejected").map(x => x.status === "rejected" ? String(x.reason) : "") };
}

export async function ensureMarketDrivenOpportunities(refreshedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const now = new Date();
  const settlementPolicy = await getTradeSettlementPolicy();
  if (settlementPolicy.blockUntilSettled) {
    const outstandingTrades = await countOutstandingTrades();
    if (outstandingTrades > 0) {
      await db.update(opportunityOffers).set({ status: "closed" }).where(eq(opportunityOffers.status, "open"));
      return { created: 0, available: 0, pausedUntilSettled: true, outstandingTrades, settlementDelaySeconds: settlementPolicy.delaySeconds };
    }
  }
  await db.update(opportunityOffers).set({ status: "closed" }).where(and(eq(opportunityOffers.status, "open"), lt(opportunityOffers.marketObservedAt, refreshedAt)));
  const active = await db.select({ symbol: opportunityOffers.symbol, currency: opportunityOffers.currency }).from(opportunityOffers).where(and(eq(opportunityOffers.status, "open"), gt(opportunityOffers.closesAt, now)));
  const activeKeys = new Set(active.map(row => `${row.symbol}:${row.currency}`));
  const instruments = await db.select().from(marketInstruments).orderBy(desc(marketInstruments.updatedAt)).limit(200);
  // Legacy market offers use scaled signed-INT amounts; Mining-only USDT and TOKEN belong in the high-precision v5 ledger instead.
  const currencies = await db.select({ code: currencyRegistry.code, scale: currencyRegistry.scale }).from(currencyRegistry).where(and(eq(currencyRegistry.enabled, true), inArray(currencyRegistry.code, ["USD", "EUR", "GBP", "BTC", "ETH"])));
  const deskLabel = await getAppSetting("opportunity.deskLabel");
  if (!deskLabel) throw new Error("Database setting opportunity.deskLabel is missing");
  let created = 0;
  for (const instrument of instruments) {
    const snapshot = (await db.select().from(marketSnapshots).where(eq(marketSnapshots.instrumentId, instrument.id)).orderBy(desc(marketSnapshots.observedAt)).limit(1))[0];
    if (!snapshot) continue;
    for (const currency of currencies) {
      const activeKey = `${instrument.symbol}:${currency.code}`;
      if (activeKeys.has(activeKey)) continue;
      const factor = Math.pow(10, currency.scale);
      // Keep generated amounts within the wallet scale and the database INT range.
      // Crypto opportunities use fractional coin amounts; fiat opportunities use currency units.
      const minimumUnits = currency.scale >= 8 ? 0.0001 : 100;
      const maximumUnits = currency.scale >= 8 ? 0.025 : 2500;
      const minimumMinor = simulationValue(`${instrument.symbol}:${currency.code}:minimum`, snapshot.observedAt, Math.round(minimumUnits * factor), Math.round(maximumUnits * factor));
      const expectedRewardBps = simulationValue(`${instrument.symbol}:${currency.code}:reward`, snapshot.observedAt, 1000, 3500);
      const durationSeconds = simulationValue(`${instrument.symbol}:${currency.code}:duration`, snapshot.observedAt, 900, 3600);
      const opensAt = new Date();
      const closesAt = new Date(opensAt.getTime() + durationSeconds * 1000);
      await db.insert(opportunityOffers).values({ symbol: instrument.symbol, venueFrom: instrument.exchange || "Listed market", venueTo: deskLabel, currency: currency.code, minimumMinor, expectedRewardBps, durationSeconds, opensAt, closesAt, rewardAt: closesAt, status: "open", instrumentId: instrument.id, marketSnapshotId: snapshot.id, marketValueUsd: snapshot.marketValueUsd, sector: instrument.sector, industry: instrument.industry, listingStatus: instrument.listingStatus, marketObservedAt: snapshot.observedAt, simulationSeed: crypto.createHash("sha256").update(`${instrument.symbol}:${currency.code}:${snapshot.id}:${snapshot.observedAt.toISOString()}:${process.env.SIMULATION_SALT || "arbitrade-default"}`).digest("hex") });
      activeKeys.add(activeKey);
      created++;
    }
  }
  return { created, available: instruments.length * currencies.length };
}
