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

async function sync(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const byDate = await fetchEcbRates({
      date: url.searchParams.get("date"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      symbols: url.searchParams.get("symbols"),
    });

    const rows = Object.entries(byDate).flatMap(([date, rates]) =>
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

    if (rows.length === 0) {
      return Response.json({ ok: true, upserted: 0, dates: [] });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("exchange_rates")
      .upsert(rows, { onConflict: "base_currency,quote_currency,date" });
    if (error) throw error;

    return Response.json({
      ok: true,
      upserted: rows.length,
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
