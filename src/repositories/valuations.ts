import { supabase } from "@/integrations/supabase/client";
import type { AssetValuation } from "@/domain/types";
import { toValuation } from "./mapping";

export interface ValuationWriteInput {
  valuationDate: string; // YYYY-MM-DD
  unitPrice?: number | null;
  /** Cache do cálculo (derivada) ou valor introduzido (manual). */
  totalValue: number;
  currency: string;
  source?: string | null;
  /** `true` congela o valor total; `false` deriva de NAV × posição à data. */
  isManual: boolean;
}

export async function listValuations(assetId: string): Promise<AssetValuation[]> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .select("*")
    .eq("asset_id", assetId)
    .order("valuation_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toValuation);
}

export async function getValuation(id: string): Promise<AssetValuation | null> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toValuation(data) : null;
}

export async function createValuation(
  input: ValuationWriteInput & { assetId: string },
): Promise<AssetValuation> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .insert({
      asset_id: input.assetId,
      valuation_date: input.valuationDate,
      unit_price: input.unitPrice ?? null,
      total_value: input.totalValue,
      currency: input.currency,
      source: input.source ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toValuation(data);
}

export async function updateValuation(
  id: string,
  input: ValuationWriteInput,
): Promise<AssetValuation> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .update({
      valuation_date: input.valuationDate,
      unit_price: input.unitPrice ?? null,
      total_value: input.totalValue,
      currency: input.currency,
      source: input.source ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toValuation(data);
}

export async function deleteValuation(id: string): Promise<void> {
  const { error } = await supabase.from("asset_valuations").delete().eq("id", id);
  if (error) throw error;
}
