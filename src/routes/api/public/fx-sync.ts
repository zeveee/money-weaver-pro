import { createFileRoute } from "@tanstack/react-router";

/**
 * IvestWise :: Sincronização de taxas de câmbio (BCE)
 *
 * Endpoint público chamado por um agendador (pg_cron) uma vez por dia.
 * Puxa as taxas diárias do BCE contra a moeda pivô (EUR) e faz upsert em
 * `public.exchange_rates`. A escrita usa o cliente privilegiado do servidor,
 * porque a tabela só permite escrita a administradores.
 *
 * Provider atrás de uma fronteira estreita (`fetchEcbRates`) para se poder
 * trocar sem tocar nos cálculos.
 *
 *   GET|POST /api/public/fx-sync            → taxas mais recentes
 *   GET|POST /api/public/fx-sync?date=YYYY-MM-DD
 *   GET|POST /api/public/fx-sync?from=YYYY-MM-DD&to=YYYY-MM-DD   (backfill)
 */

const PIVOT = "EUR";
const ECB_BASE = "https://api.frankfurter.dev/v1";

type RatesByDate = Record<string, Record<string, number>>;

async function fetchEcbRates(params: {
  date?: string | null;
  from?: string | null;
  to?: string | null;
  symbols?: string | null;
}): Promise<RatesByDate> {
  const query = new URLSearchParams({ base: PIVOT });
  if (params.symbols) query.set("symbols", params.symbols);

  const path = params.from
    ? `${params.from}..${params.to ?? ""}`
    : (params.date ?? "latest");

  const res = await fetch(`${ECB_BASE}/${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`ECB ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as
    | { date: string; rates: Record<string, number> }
    | { rates: RatesByDate };

  return "date" in json && typeof json.date === "string"
    ? { [json.date]: json.rates as Record<string, number> }
    : ((json as { rates: RatesByDate }).rates ?? {});
}

const toRows = (byDate: RatesByDate) =>
  Object.entries(byDate).flatMap(([date, rates]) =>
    Object.entries(rates)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([quote, value]) => ({
        date,
        base_currency: PIVOT,
        quote_currency: quote.toUpperCase(),
        exchange_rate: value,
        source: "ecb",
      })),
  );

/** Parte um intervalo em blocos anuais — evita timeouts no backfill inicial. */
function yearChunks(from: string, to: string): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const year = Number(cursor.slice(0, 4));
    const end = `${year}-12-31`;
    chunks.push({ from: cursor, to: end < to ? end : to });
    cursor = `${year + 1}-01-01`;
  }
  return chunks;
}

async function sync(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const symbols = url.searchParams.get("symbols");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const upsert = async (rows: ReturnType<typeof toRows>) => {
      if (rows.length === 0) return 0;
      // A API do PostgREST aceita lotes grandes, mas mantemos blocos de 5000.
      for (let i = 0; i < rows.length; i += 5000) {
        const { error } = await supabaseAdmin
          .from("exchange_rates")
          .upsert(rows.slice(i, i + 5000), {
            onConflict: "base_currency,quote_currency,date",
          });
        if (error) throw error;
      }
      return rows.length;
    };

    if (from) {
      const chunks = yearChunks(from, to);
      const perChunk: { from: string; to: string; upserted: number; dates: number }[] = [];
      let total = 0;
      for (const chunk of chunks) {
        const byDate = await fetchEcbRates({ from: chunk.from, to: chunk.to, symbols });
        const rows = toRows(byDate);
        total += await upsert(rows);
        perChunk.push({ ...chunk, upserted: rows.length, dates: Object.keys(byDate).length });
      }
      return Response.json({ ok: true, mode: "backfill", from, to, upserted: total, chunks: perChunk });
    }

    const byDate = await fetchEcbRates({ date: url.searchParams.get("date"), symbols });
    const rows = toRows(byDate);
    const upserted = await upsert(rows);
    return Response.json({
      ok: true,
      mode: "latest",
      upserted,
      dates: Object.keys(byDate).sort(),
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/public/fx-sync")({
  server: { handlers: { GET: ({ request }) => sync(request), POST: ({ request }) => sync(request) } },
});
