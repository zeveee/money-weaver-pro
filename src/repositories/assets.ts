import { supabase } from "@/integrations/supabase/client";
import type { Asset, AssetType } from "@/domain/types";
import { toAsset } from "./mapping";

export async function listAssets(portfolioId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAsset);
}

export async function createAsset(input: {
  portfolioId: string;
  type: AssetType;
  name: string;
  ticker?: string | null;
  isin?: string | null;
  currency?: string;
  quantity?: number;
  averageCost?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Asset> {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      portfolio_id: input.portfolioId,
      type: input.type,
      name: input.name,
      ticker: input.ticker ?? null,
      isin: input.isin ?? null,
      currency: input.currency ?? "EUR",
      quantity: input.quantity ?? 0,
      average_cost: input.averageCost ?? 0,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;
  return toAsset(data);
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw error;
}
