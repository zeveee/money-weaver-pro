/**
 * IvestWise :: Server functions de holdings (composição interna de fundos/ETF)
 *
 * Ficheiro fino: só declarações de server functions. O registry de providers
 * (`src/server/holdings/*`) é carregado DENTRO do handler para não entrar no
 * bundle do cliente.
 *
 * Fonte única: o mesmo registry usado pelos testes de integração. A UI não
 * fala diretamente com nenhum emissor.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ assetId: z.string().uuid(), force: z.boolean().optional() });

/** Devolve a composição (holdings) do ativo, se algum provider a publicar. */
export const getAssetHoldings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const { getHoldings } = await import("@/server/holdings/registry");

    const { data: asset, error } = await context.supabase
      .from("assets")
      .select("id, name, ticker, isin, metadata")
      .eq("id", data.assetId)
      .maybeSingle();

    if (error) return { status: "error" as const, message: error.message };
    if (!asset) return { status: "error" as const, message: "Ativo não encontrado." };
    if (!asset.ticker) {
      return {
        status: "unavailable" as const,
        message: "O ativo não tem ticker — não é possível procurar a composição.",
      };
    }

    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
    const issuerRaw = metadata["issuer"] ?? metadata["manager"];
    const issuer = typeof issuerRaw === "string" && issuerRaw.trim() !== "" ? issuerRaw : null;

    const res = await getHoldings(
      { ticker: asset.ticker, issuer, name: asset.name, isin: asset.isin },
      { force: data.force ?? false },
    );

    if (!res.ok) {
      return { status: "unavailable" as const, message: res.message, reason: res.reason };
    }
    return { status: "ok" as const, snapshot: res.data };
  });
