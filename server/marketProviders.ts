export type MarketInstrumentInput = {
  symbol: string;
  name: string;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  listingStatus: string;
  priceUsd: string | null;
  marketValueUsd: string | null;
  volume: string | null;
  netChange: string | null;
  percentChange: string | null;
  observedAt: Date;
  raw: unknown;
};

const json = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { ...init, headers: { "User-Agent": "Arbitrade-market-sync/1.0", Accept: "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<any>;
};
const numeric = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,%\s,]/g, "");
  return cleaned && Number.isFinite(Number(cleaned)) ? cleaned : null;
};

export async function fetchMostActiveStocks(limit = 200): Promise<MarketInstrumentInput[]> {
  const payload = await json(`https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=${Math.min(200, Math.max(1, limit))}&offset=0&download=true`);
  const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
  const observedAt = new Date();
  return rows.map((row: any) => ({
    symbol: String(row.symbol || "").trim().toUpperCase(),
    name: String(row.name || row.symbol || "Unknown instrument").trim(),
    exchange: "NASDAQ/NYSE",
    country: row.country ? String(row.country) : null,
    sector: row.sector ? String(row.sector) : null,
    industry: row.industry ? String(row.industry) : null,
    listingStatus: "active",
    priceUsd: numeric(row.lastsale),
    marketValueUsd: numeric(row.marketCap),
    volume: numeric(row.volume),
    netChange: numeric(row.netchange),
    percentChange: numeric(row.pctchange),
    observedAt,
    raw: row,
  })).filter((row: MarketInstrumentInput) => /^[A-Z0-9.\-]{1,12}$/.test(row.symbol));
}

export async function fetchFiatRates(): Promise<{ base: string; quote: string; rate: string; sourceDate: string | null; raw: unknown }[]> {
  const payload = await json("https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,GBP");
  return (Array.isArray(payload) ? payload : []).map((row: any) => ({ base: "USD", quote: String(row.quote).toUpperCase(), rate: String(row.rate), sourceDate: row.date ? String(row.date) : null, raw: row }));
}

export async function fetchCryptoRates(): Promise<{ base: string; quote: string; rate: string; sourceDate: string | null; raw: unknown }[]> {
  const payload = await json("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true");
  return (["bitcoin", "ethereum", "tether"] as const).map((id) => {
    const row = payload?.[id] ?? {};
    const base = id === "bitcoin" ? "BTC" : id === "ethereum" ? "ETH" : "USDT";
    return { base, quote: "USD", rate: String(row.usd ?? "0"), sourceDate: row.last_updated_at ? new Date(Number(row.last_updated_at) * 1000).toISOString() : null, raw: row };
  }).filter(row => Number(row.rate) > 0);
}
