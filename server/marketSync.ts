import { and, desc, eq, gt, lt } from "drizzle-orm";
import { countOutstandingTrades, getDb, getTradeSettlementPolicy } from "./db";
import { currencyRegistry, fxRateSnapshots, marketInstruments, marketSnapshots, opportunityOffers } from "../drizzle/schema";
import { fetchCryptoRates, fetchFiatRates, fetchMostActiveStocks } from "./marketProviders";

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

  // Expire stale offers, but do not invent trade economics from market snapshots.
  // An offer must be explicitly published with auditable terms before customers can be allocated.
  await db.update(opportunityOffers)
    .set({ status: "closed" })
    .where(and(eq(opportunityOffers.status, "open"), lt(opportunityOffers.marketObservedAt, refreshedAt)));

  const availableOffers = await db.select({ id: opportunityOffers.id })
    .from(opportunityOffers)
    .where(and(eq(opportunityOffers.status, "open"), gt(opportunityOffers.closesAt, now)));

  return { created: 0, available: availableOffers.length, generationDisabled: true };
}
