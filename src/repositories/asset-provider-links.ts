import { supabase } from "@/integrations/supabase/client";
import type { AssetProviderLink } from "@/server/market-data/types";

/**
 * Leitura (cliente) das ligações ativo ↔ fornecedor.
 * A escrita pertence ao servidor (server functions / cron), nunca ao browser.
 *
 * Nota: importamos apenas TIPOS de `src/server/market-data/types` — não há
 * código de servidor a entrar no bundle.
 */

type Row = Record<string, unknown>;

const toLink = (r: Row): AssetProviderLink => ({
  id: r["id"] as string,
  assetId: r["asset_id"] as string,
  provider: r["provider"] as string,
  providerInstrumentId: (r["provider_instrument_id"] as string | null) ?? null,
  providerSymbol: (r["provider_symbol"] as string) ?? null,
  providerExchange: (r["provider_exchange"] as string) ?? null,
  providerCurrency: (r["provider_currency"] as string) ?? null,
  status: (r["status"] as AssetProviderLink["status"]) ?? "active",
  resolvedAt: r["resolved_at"] as string,
  lastVerifiedAt: (r["last_verified_at"] as string) ?? null,
  lastSyncedDate: (r["last_synced_date"] as string) ?? null,
});

export async function getAssetProviderLink(assetId: string): Promise<AssetProviderLink | null> {
  const { data, error } = await supabase
    .from("asset_provider_links")
    .select("*")
    .eq("asset_id", assetId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? toLink(data as Row) : null;
}

export async function listByAssetIds(assetIds: string[]): Promise<AssetProviderLink[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await supabase
    .from("asset_provider_links")
    .select("*")
    .in("asset_id", assetIds);
  if (error) throw error;
  return (data ?? []).map((r) => toLink(r as Row));
}

export async function listPortfolioProviderLinks(
  assetIds: string[],
): Promise<AssetProviderLink[]> {
  return listByAssetIds(assetIds);
}

