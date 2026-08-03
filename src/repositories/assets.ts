import { supabase } from "@/integrations/supabase/client";
import type { Asset, AssetType } from "@/domain/types";
import { toAsset } from "./mapping";

export interface AssetWriteInput {
  type: AssetType;
  name: string;
  ticker?: string | null;
  isin?: string | null;
  currency?: string;
  notes?: string | null;
  acquiredAt?: string | null;
  metadata?: Record<string, unknown>;
}

export async function listAssets(portfolioId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAsset);
}

export async function getAsset(id: string): Promise<Asset | null> {
  const { data, error } = await supabase.from("assets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toAsset(data) : null;
}

export async function createAsset(
  input: AssetWriteInput & { portfolioId: string },
): Promise<Asset> {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      portfolio_id: input.portfolioId,
      type: input.type,
      name: input.name,
      ticker: input.ticker ?? null,
      isin: input.isin ?? null,
      currency: input.currency ?? "EUR",
      notes: input.notes ?? null,
      acquired_at: input.acquiredAt ?? null,
      metadata: (input.metadata ?? {}) as never,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toAsset(data);
}

export async function updateAsset(id: string, input: AssetWriteInput): Promise<Asset> {
  const { data, error } = await supabase
    .from("assets")
    .update({
      type: input.type,
      name: input.name,
      ticker: input.ticker ?? null,
      isin: input.isin ?? null,
      currency: input.currency ?? "EUR",
      notes: input.notes ?? null,
      acquired_at: input.acquiredAt ?? null,
      metadata: (input.metadata ?? {}) as never,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toAsset(data);
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw error;
}
