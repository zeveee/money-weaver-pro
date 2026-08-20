/**
 * IvestWise :: Server functions do Security Master
 *
 * Ficheiro fino: só declarações. O matcher e o Security Master vivem em
 * `src/server/securities/*` e são carregados DENTRO do handler.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ assetId: z.string().uuid() });

/**
 * Identifica as holdings do ativo contra o Security Master (OpenFIGI como
 * primeira fonte externa). Devolve o estado por holding + resumo.
 */
export const getAssetHoldingMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const { getHoldings } = await import("@/server/holdings/registry");
    const { matchHoldings } = await import("@/server/securities/matcher");

    const { data: asset, error } = await context.supabase
      .from("assets")
      .select("id, name, ticker, isin, metadata")
      .eq("id", data.assetId)
      .maybeSingle();

    if (error) return { status: "error" as const, message: error.message };
    if (!asset?.ticker) return { status: "unavailable" as const };

    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
    const issuerRaw = metadata["issuer"] ?? metadata["manager"];
    const issuer = typeof issuerRaw === "string" && issuerRaw.trim() !== "" ? issuerRaw : null;

    const res = await getHoldings({
      ticker: asset.ticker,
      issuer,
      name: asset.name,
      isin: asset.isin,
    });
    if (!res.ok) return { status: "unavailable" as const };

    const matched = await matchHoldings(res.data.holdings);
    return { status: "ok" as const, ...matched };
  });
