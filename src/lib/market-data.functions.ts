/**
 * IvestWise :: Server functions de market data (chamadas pela UI autenticada)
 *
 * Ficheiro fino de propósito: só declarações de server functions. Os módulos
 * de `src/server/market-data/*` são carregados DENTRO do handler para não
 * entrarem no bundle do cliente.
 *
 * A RLS trata da autorização: o cliente vem do `requireSupabaseAuth`, pelo que
 * um utilizador só consegue ligar/sincronizar ativos das suas carteiras.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const assetInput = z.object({ assetId: z.string().uuid() });

/** Resolve o ativo (por ISIN) num instrumento de fornecedor e grava a ligação. */
export const resolveProviderForAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveAssetProvider } = await import("@/server/market-data/resolve");

    const { data: asset, error } = await context.supabase
      .from("assets")
      .select("id, isin, ticker, currency")
      .eq("id", data.assetId)
      .maybeSingle();

    if (error) return { status: "error" as const, reason: "db" as const, message: error.message };
    if (!asset) return { status: "error" as const, reason: "db" as const, message: "Asset not found" };
    if (!asset.isin) {
      return { status: "no_isin" as const, message: "O ativo não tem ISIN preenchido." };
    }

    return resolveAssetProvider(context.supabase, asset.id, asset.isin);
  });

/** Sincroniza preços do ativo: histórico completo ou apenas o último fecho. */
export const syncAssetPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    assetInput.extend({ mode: z.enum(["latest", "historical"]).default("historical") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { syncHistoricalPrices, syncLatestPrice, toProviderLink } = await import(
      "@/server/market-data/resolve"
    );

    const { data: row, error } = await context.supabase
      .from("asset_provider_links")
      .select("*")
      .eq("asset_id", data.assetId)
      .eq("status", "active")
      .maybeSingle();

    if (error) return { status: "error" as const, reason: "db" as const, message: error.message };
    if (!row) {
      return { status: "not_linked" as const, message: "O ativo ainda não está ligado a um fornecedor." };
    }

    const link = toProviderLink(row);
    return data.mode === "latest"
      ? syncLatestPrice(context.supabase, link)
      : syncHistoricalPrices(context.supabase, link);
  });
