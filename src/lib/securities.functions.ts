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
    const started = Date.now();
    try {
      const { getHoldings } = await import("@/server/holdings/registry");
      const { matchHoldings } = await import("@/server/securities/matcher");

      const { data: asset, error } = await context.supabase
        .from("assets")
        .select("id, name, ticker, isin, metadata")
        .eq("id", data.assetId)
        .maybeSingle();

      if (error) return { status: "error" as const, message: `Ativo: ${error.message}` };
      if (!asset) return { status: "error" as const, message: "Ativo não encontrado." };
      if (!asset.ticker) {
        return {
          status: "unavailable" as const,
          message: "O ativo não tem ticker — não é possível identificar as holdings.",
        };
      }

      const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
      const issuerRaw = metadata["issuer"] ?? metadata["manager"];
      const issuer =
        typeof issuerRaw === "string" && issuerRaw.trim() !== "" ? issuerRaw : null;

      const res = await getHoldings({
        ticker: asset.ticker,
        issuer,
        name: asset.name,
        isin: asset.isin,
      });
      if (!res.ok) {
        return { status: "unavailable" as const, message: res.message };
      }

      // Orçamento de tempo: cada passagem resolve o que couber e persiste-o;
      // o que ficar pendente é concluído na passagem seguinte (a partir do
      // Security Master, já sem repetir chamadas externas).
      const matched = await matchHoldings(res.data.holdings, { budgetMs: BUDGET_MS });

      console.log(
        `[securities] asset=${asset.ticker} holdings=${matched.summary.total} ` +
          `identificadas=${matched.summary.identified} ambíguas=${matched.summary.ambiguous} ` +
          `não=${matched.summary.unidentified} pendentes=${matched.summary.pending} ` +
          `idsPendentes=${matched.pendingIdentifiers} ms=${Date.now() - started}` +
          (matched.error ? ` erro=${matched.error}` : ""),
      );

      return { status: "ok" as const, ...matched };
    } catch (e) {
      const message = (e as Error).message ?? "Erro desconhecido.";
      console.error(`[securities] falha ao identificar holdings: ${message}`);
      return { status: "error" as const, message };
    }
  });

