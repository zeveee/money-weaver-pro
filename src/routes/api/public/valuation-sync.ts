import { createFileRoute } from "@tanstack/react-router";

/**
 * IvestWise :: Sincronização diária de valorizações (market data)
 *
 * Endpoint público chamado por um agendador (pg_cron), no mesmo molde do
 * `fx-sync`: segredo partilhado obrigatório antes de qualquer chamada externa
 * ou escrita, e cliente privilegiado do servidor para escrever em nome de
 * todos os utilizadores.
 *
 *   GET|POST /api/public/valuation-sync                 → último fecho de todas as ligações ativas
 *   GET|POST /api/public/valuation-sync?mode=historical → recupera lacunas (cursor last_synced_date)
 *   GET|POST /api/public/valuation-sync?asset=<uuid>    → limita a um ativo
 */

/** Comparação em tempo constante — evita fuga de informação por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sync(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const expected = process.env["VALUATION_SYNC_SECRET"];
  if (!expected) {
    return Response.json(
      { ok: false, error: "VALUATION_SYNC_SECRET not configured" },
      { status: 503 },
    );
  }
  const provided =
    request.headers.get("x-valuation-sync-secret") ?? url.searchParams.get("secret") ?? "";
  if (!safeEqual(provided, expected)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const mode = url.searchParams.get("mode") === "historical" ? "historical" : "latest";
  const assetId = url.searchParams.get("asset");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500) || 500, 2000);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncHistoricalPrices, syncLatestPrice, toProviderLink } = await import(
      "@/server/market-data/resolve"
    );

    let query = supabaseAdmin
      .from("asset_provider_links")
      .select("*")
      .eq("status", "active")
      .limit(limit);
    if (assetId) query = query.eq("asset_id", assetId);

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: { assetId: string; status: string; written?: number; message?: string }[] = [];
    for (const row of rows ?? []) {
      const link = toProviderLink(row);
      const outcome =
        mode === "historical"
          ? await syncHistoricalPrices(supabaseAdmin, link)
          : await syncLatestPrice(supabaseAdmin, link);

      results.push({
        assetId: link.assetId,
        status: outcome.status,
        ...("written" in outcome ? { written: outcome.written } : {}),
        ...("message" in outcome ? { message: outcome.message } : {}),
      });
    }

    const written = results.reduce((sum, r) => sum + (r.written ?? 0), 0);
    return Response.json({ ok: true, mode, links: results.length, written, results });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/public/valuation-sync")({
  server: {
    handlers: { GET: ({ request }) => sync(request), POST: ({ request }) => sync(request) },
  },
});
