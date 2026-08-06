import { supabase } from "@/integrations/supabase/client";
import type { ExchangeRate } from "@/domain/types";
import { toExchangeRate } from "./mapping";

/**
 * Catálogo global de taxas de câmbio (leitura pública, escrita reservada a
 * administradores / processos do servidor — ver RLS).
 */

export interface ExchangeRateQuery {
  /** Limita às moedas envolvidas (base ou quote). Vazio = todas. */
  currencies?: string[];
  /** Só taxas com data >= este valor. */
  since?: string;
}

const PAGE_SIZE = 1000;

export async function listExchangeRates(
  query: ExchangeRateQuery = {},
): Promise<ExchangeRate[]> {
  const currencies = (query.currencies ?? [])
    .map((c) => c.toUpperCase())
    .filter((c, i, arr) => c && arr.indexOf(c) === i);

  const rows: ExchangeRate[] = [];
  // O PostgREST limita cada pedido a 1000 linhas; o catálogo histórico é maior,
  // pelo que paginamos até esgotar o resultado.
  for (let page = 0; ; page += 1) {
    let q = supabase
      .from("exchange_rates")
      .select("*")
      .order("date", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (query.since) q = q.gte("date", query.since);
    if (currencies.length > 0) {
      const list = `(${currencies.join(",")})`;
      q = q.or(`base_currency.in.${list},quote_currency.in.${list}`);
    }

    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []).map(toExchangeRate));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export interface ExchangeRateWriteInput {
  date: string; // YYYY-MM-DD
  baseCurrency: string;
  quoteCurrency: string;
  exchangeRate: number;
  source?: string;
}

/** Upsert por (base, quote, date). Requer papel admin. */
export async function upsertExchangeRates(
  inputs: ExchangeRateWriteInput[],
): Promise<ExchangeRate[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase
    .from("exchange_rates")
    .upsert(
      inputs.map((i) => ({
        date: i.date,
        base_currency: i.baseCurrency.toUpperCase(),
        quote_currency: i.quoteCurrency.toUpperCase(),
        exchange_rate: i.exchangeRate,
        source: i.source ?? "manual",
      })),
      { onConflict: "base_currency,quote_currency,date" },
    )
    .select("*");
  if (error) throw error;
  return (data ?? []).map(toExchangeRate);
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
  if (error) throw error;
}
