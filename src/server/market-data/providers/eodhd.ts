/**
 * IvestWise :: Provider EODHD
 *
 * Capacidades implementadas: identity, pricing, historicalPricing, discovery.
 * allocation / holdings / fundMetadata ficam DELIBERADAMENTE por implementar:
 * o plano gratuito da EODHD não os inclui ("Only EOD data allowed for free
 * users"). Não são simulados — a capacidade fica `undefined` para que a
 * orquestração saiba que tem de procurar noutro fornecedor.
 *
 * A chave vive apenas no servidor (process.env["EODHD_API_KEY"]) e é lida
 * dentro de cada chamada, nunca no scope do módulo.
 */

import {
  providerFail,
  providerOk,
  type HistoricalRange,
  type IdentityHints,
  type MarketDataProvider,
  type PricePoint,
  type ProviderResult,
  type ResolvedInstrument,
} from "../types";

const BASE = "https://eodhd.com/api";

export const EODHD_PROVIDER_NAME = "eodhd";

type Json = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/** Chamada HTTP + normalização de todos os modos de falha da EODHD. */
async function call<T>(path: string, params: Record<string, string>): Promise<ProviderResult<T>> {
  const apiKey = process.env["EODHD_API_KEY"];
  if (!apiKey) return providerFail("unauthorized", "EODHD_API_KEY not configured");

  const query = new URLSearchParams({ ...params, api_token: apiKey, fmt: "json" });

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${query.toString()}`);
  } catch (e) {
    return providerFail("network", e instanceof Error ? e.message : String(e));
  }

  if (res.status === 404) return providerFail("not_found", "EODHD 404");
  if (res.status === 402 || res.status === 429) {
    return providerFail("rate_limit", `EODHD ${res.status}: quota/rate limit`);
  }
  if (res.status === 401 || res.status === 403) {
    return providerFail("unauthorized", `EODHD ${res.status}: invalid key or plan`);
  }
  if (!res.ok) return providerFail("invalid_response", `EODHD ${res.status}`);

  try {
    return providerOk((await res.json()) as T);
  } catch (e) {
    return providerFail("invalid_response", e instanceof Error ? e.message : String(e));
  }
}

/** Linha da pesquisa EODHD → instrumento normalizado. */
function toInstrument(row: Json): ResolvedInstrument | null {
  const code = str(row["Code"]);
  const exchange = str(row["Exchange"]);
  if (!code) return null;
  return {
    providerInstrumentId: exchange ? `${code}.${exchange}` : code,
    symbol: code,
    exchange,
    currency: str(row["Currency"]),
    name: str(row["Name"]),
    isin: str(row["ISIN"]),
    raw: row,
  };
}

async function searchInstruments(query: string): Promise<ProviderResult<ResolvedInstrument[]>> {
  const res = await call<unknown>(`/search/${encodeURIComponent(query)}`, {});
  if (!res.ok) return res;
  if (!Array.isArray(res.data)) return providerFail("invalid_response", "search: expected array");

  const rows = (res.data as Json[])
    .map(toInstrument)
    .filter((i): i is ResolvedInstrument => i !== null);
  return providerOk(rows);
}

async function resolveByIsin(
  isin: string,
  hints?: IdentityHints,
): Promise<ProviderResult<ResolvedInstrument>> {
  const res = await searchInstruments(isin);
  if (!res.ok) return res;

  const wanted = isin.trim().toUpperCase();
  const sameIsin = res.data.filter((i) => (i.isin ?? "").toUpperCase() === wanted);
  const pool = sameIsin.length > 0 ? sameIsin : res.data;

  const ticker = hints?.ticker?.trim().toUpperCase();
  const currency = hints?.currency?.trim().toUpperCase();

  // Desambiguação de listings cross-listed: ticker exato > moeda > fallback.
  const match =
    (ticker ? pool.find((i) => (i.symbol ?? "").toUpperCase() === ticker) : undefined) ??
    (currency ? pool.find((i) => (i.currency ?? "").toUpperCase() === currency) : undefined) ??
    pool[0];

  return match
    ? providerOk(match)
    : providerFail("not_found", `EODHD: no instrument for ISIN ${isin}`);
}

async function getLatestPrice(
  providerInstrumentId: string,
): Promise<ProviderResult<PricePoint>> {
  const res = await call<Json>(`/real-time/${encodeURIComponent(providerInstrumentId)}`, {});
  if (!res.ok) return res;

  const body = res.data;
  const close = num(body["close"]) ?? num(body["previousClose"]);
  const date =
    str(body["date"]) ??
    (typeof body["timestamp"] === "number"
      ? new Date(body["timestamp"] * 1000).toISOString().slice(0, 10)
      : null);

  if (close === null || !date) {
    return providerFail("not_found", `EODHD: no live price for ${providerInstrumentId}`);
  }
  return providerOk({ date, close, currency: null });
}

async function getHistoricalPrices(
  providerInstrumentId: string,
  range: HistoricalRange,
): Promise<ProviderResult<PricePoint[]>> {
  const params: Record<string, string> = { period: "d", order: "a" };
  if (range.from) params["from"] = range.from;
  if (range.to) params["to"] = range.to;

  const res = await call<unknown>(`/eod/${encodeURIComponent(providerInstrumentId)}`, params);
  if (!res.ok) return res;
  if (!Array.isArray(res.data)) return providerFail("invalid_response", "eod: expected array");

  const points = (res.data as Json[])
    .map((row): PricePoint | null => {
      const date = str(row["date"]);
      const close = num(row["adjusted_close"]) ?? num(row["close"]);
      return date && close !== null ? { date, close, currency: null } : null;
    })
    .filter((p): p is PricePoint => p !== null);

  return providerOk(points);
}

export const eodhdProvider: MarketDataProvider = {
  name: EODHD_PROVIDER_NAME,
  identity: { resolveByIsin },
  pricing: { getLatestPrice },
  historicalPricing: { getHistoricalPrices },
  discovery: { searchInstruments },
  // allocation / holdings / fundMetadata: não disponíveis no plano atual.
};
