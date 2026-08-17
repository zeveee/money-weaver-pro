/**
 * IvestWise :: Orquestração de market data
 *
 * Seleção de fornecedor POR CAPACIDADE. Os arrays de CAPABILITY_PROVIDERS estão
 * prontos para receber uma segunda entrada (ex.: Alpha Vantage) sem tocar em
 * nada aqui: a ordem do array é a ordem de tentativa.
 *
 * Toda a escrita de preços cai em `asset_valuations` (sink universal já usado
 * pelo formulário individual e pelo diálogo em lote), com `source` = nome do
 * fornecedor e `is_manual = false`. Uma valorização manual na mesma data NUNCA
 * é sobreposta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { eodhdProvider } from "./providers/eodhd";
import type {
  AssetProviderLink,
  MarketDataProvider,
  PricePoint,
  ProviderFailureReason,
} from "./types";

export type Db = SupabaseClient<Database>;

export const CAPABILITY_PROVIDERS: {
  pricing: MarketDataProvider[];
  historicalPricing: MarketDataProvider[];
  allocation: MarketDataProvider[];
  holdings: MarketDataProvider[];
  fundMetadata: MarketDataProvider[];
} = {
  pricing: [eodhdProvider],
  historicalPricing: [eodhdProvider],
  allocation: [],
  holdings: [],
  fundMetadata: [],
};

const byName = (name: string): MarketDataProvider | undefined =>
  [
    ...CAPABILITY_PROVIDERS.pricing,
    ...CAPABILITY_PROVIDERS.historicalPricing,
  ].find((p) => p.name === name);

// ---------- Mapeamento de linhas ----------

type LinkRow = Database["public"]["Tables"]["asset_provider_links"]["Row"];

export const toProviderLink = (r: LinkRow): AssetProviderLink => ({
  id: r.id,
  assetId: r.asset_id,
  provider: r.provider,
  providerInstrumentId: r.provider_instrument_id,
  providerSymbol: r.provider_symbol,
  providerExchange: r.provider_exchange,
  providerCurrency: r.provider_currency,
  status: (r.status as AssetProviderLink["status"]) ?? "active",
  resolvedAt: r.resolved_at,
  lastVerifiedAt: r.last_verified_at,
  lastSyncedDate: r.last_synced_date,
});

// ---------- Resultados ----------

export type ResolveOutcome =
  | { status: "linked"; link: AssetProviderLink; provider: string }
  | { status: "not_found"; message: string }
  | { status: "error"; reason: ProviderFailureReason; message: string };

export type SyncOutcome =
  | { status: "synced"; provider: string; written: number; from: string | null; to: string | null }
  | { status: "up_to_date"; provider: string }
  | { status: "not_found"; message: string }
  | { status: "error"; reason: ProviderFailureReason | "db"; message: string };

const today = (): string => new Date().toISOString().slice(0, 10);

const nextDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ---------- Resolução ----------

export async function resolveAssetProvider(
  db: Db,
  assetId: string,
  isin: string,
): Promise<ResolveOutcome> {
  const candidates = CAPABILITY_PROVIDERS.pricing.filter((p) => p.identity);
  if (candidates.length === 0) {
    return { status: "error", reason: "invalid_response", message: "No identity-capable provider configured" };
  }

  let lastFailure: { reason: ProviderFailureReason; message: string } | null = null;

  for (const provider of candidates) {
    const res = await provider.identity!.resolveByIsin(isin);
    if (!res.ok) {
      lastFailure = { reason: res.reason, message: res.message };
      continue;
    }

    const instrument = res.data;
    const { data, error } = await db
      .from("asset_provider_links")
      .upsert(
        {
          asset_id: assetId,
          provider: provider.name,
          provider_instrument_id: instrument.providerInstrumentId,
          provider_symbol: instrument.symbol,
          provider_exchange: instrument.exchange,
          provider_currency: instrument.currency,
          status: "active",
          resolved_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
          raw_metadata: instrument.raw as never,
        },
        { onConflict: "asset_id,provider" },
      )
      .select("*")
      .single();

    if (error) return { status: "error", reason: "invalid_response", message: error.message };
    return { status: "linked", link: toProviderLink(data as LinkRow), provider: provider.name };
  }

  if (lastFailure && lastFailure.reason !== "not_found") {
    return { status: "error", ...lastFailure };
  }
  return { status: "not_found", message: lastFailure?.message ?? `No provider resolved ISIN ${isin}` };
}

// ---------- Escrita de valorizações (preserva manuais) ----------

/**
 * Upsert idempotente de preços. Respeita o UNIQUE (asset_id, valuation_date)
 * e nunca sobrepõe uma valorização com `is_manual = true`.
 * O `total_value` é apenas cache (a leitura recalcula NAV × posição à data).
 */
export async function writePricePoints(
  db: Db,
  link: AssetProviderLink,
  points: PricePoint[],
  currency: string,
): Promise<{ written: number } | { error: string }> {
  if (points.length === 0) return { written: 0 };

  const dates = points.map((p) => p.date);
  const { data: existing, error: readError } = await db
    .from("asset_valuations")
    .select("valuation_date, is_manual")
    .eq("asset_id", link.assetId)
    .in("valuation_date", dates);

  if (readError) return { error: readError.message };

  const manualDates = new Set(
    (existing ?? []).filter((r) => r.is_manual).map((r) => r.valuation_date),
  );

  const rows = points
    .filter((p) => !manualDates.has(p.date))
    .map((p) => ({
      asset_id: link.assetId,
      valuation_date: p.date,
      unit_price: p.close,
      total_value: 0,
      currency: (p.currency ?? currency ?? "EUR").toUpperCase().slice(0, 3),
      source: link.provider,
      is_manual: false,
    }));

  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db
      .from("asset_valuations")
      .upsert(rows.slice(i, i + 1000), { onConflict: "asset_id,valuation_date" });
    if (error) return { error: error.message };
  }

  return { written: rows.length };
}

async function assetCurrency(db: Db, assetId: string): Promise<string> {
  const { data } = await db.from("assets").select("currency").eq("id", assetId).maybeSingle();
  return (data?.currency as string | undefined) ?? "EUR";
}

/** Data da transação mais antiga do ativo (limite inferior do histórico útil). */
async function earliestTransactionDate(db: Db, assetId: string): Promise<string | null> {
  const { data } = await db
    .from("transactions")
    .select("occurred_at")
    .eq("asset_id", assetId)
    .order("occurred_at", { ascending: true })
    .limit(1);
  const first = data?.[0]?.occurred_at as string | undefined;
  return first ? first.slice(0, 10) : null;
}

async function markSync(
  db: Db,
  link: AssetProviderLink,
  patch: { lastSyncedDate?: string | null; status?: AssetProviderLink["status"] },
): Promise<void> {
  await db
    .from("asset_provider_links")
    .update({
      last_verified_at: new Date().toISOString(),
      ...(patch.lastSyncedDate ? { last_synced_date: patch.lastSyncedDate } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    })
    .eq("id", link.id);
}

// ---------- Sincronização ----------

export async function syncLatestPrice(db: Db, link: AssetProviderLink): Promise<SyncOutcome> {
  const provider = byName(link.provider);
  if (!provider?.pricing) {
    return { status: "error", reason: "invalid_response", message: `Provider ${link.provider} has no pricing capability` };
  }

  const res = await provider.pricing.getLatestPrice(link.providerInstrumentId);
  if (!res.ok) {
    if (res.reason === "not_found") {
      await markSync(db, link, { status: "not_found" });
      return { status: "not_found", message: res.message };
    }
    return { status: "error", reason: res.reason, message: res.message };
  }

  const currency = link.providerCurrency ?? (await assetCurrency(db, link.assetId));
  const written = await writePricePoints(db, link, [res.data], currency);
  if ("error" in written) return { status: "error", reason: "db", message: written.error };

  await markSync(db, link, { status: "active" });
  return {
    status: "synced",
    provider: link.provider,
    written: written.written,
    from: res.data.date,
    to: res.data.date,
  };
}

export async function syncHistoricalPrices(db: Db, link: AssetProviderLink): Promise<SyncOutcome> {
  const provider = byName(link.provider);
  if (!provider?.historicalPricing) {
    return { status: "error", reason: "invalid_response", message: `Provider ${link.provider} has no historicalPricing capability` };
  }

  const to = today();
  // Cursor: continua onde ficou; na primeira vez, arranca na transação mais
  // antiga do ativo (histórico anterior não tem utilidade para a carteira).
  const from = link.lastSyncedDate
    ? nextDay(link.lastSyncedDate)
    : ((await earliestTransactionDate(db, link.assetId)) ?? undefined);

  if (from && from > to) return { status: "up_to_date", provider: link.provider };

  const res = await provider.historicalPricing.getHistoricalPrices(link.providerInstrumentId, {
    ...(from ? { from } : {}),
    to,
  });
  if (!res.ok) {
    if (res.reason === "not_found") {
      await markSync(db, link, { status: "not_found" });
      return { status: "not_found", message: res.message };
    }
    return { status: "error", reason: res.reason, message: res.message };
  }

  const currency = link.providerCurrency ?? (await assetCurrency(db, link.assetId));
  const written = await writePricePoints(db, link, res.data, currency);
  if ("error" in written) return { status: "error", reason: "db", message: written.error };

  const lastDate = res.data.length > 0 ? res.data[res.data.length - 1]!.date : null;
  await markSync(db, link, { status: "active", lastSyncedDate: lastDate ?? to });

  return {
    status: "synced",
    provider: link.provider,
    written: written.written,
    from: from ?? null,
    to,
  };
}
