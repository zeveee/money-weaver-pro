/**
 * IvestWise :: Repositório de classificações de ativos (asset_allocations)
 *
 * A tabela é normalizada: `allocation_value_id` aponta para
 * `allocation_values` → `allocation_types`. O domínio (`AssetAllocation`)
 * usa a forma desnormalizada (`allocationType` + `allocationName`), pelo que
 * a leitura faz o join e o mapeamento aqui.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AllocationType, AssetAllocation } from "@/domain/types";

const SELECT =
  "id, asset_id, percentage, allocation_values:allocation_value_id ( value, allocation_types:allocation_type_id ( code ) )";

type JoinedRow = {
  id: string;
  asset_id: string;
  percentage: number | string;
  allocation_values:
    | {
        value: string;
        allocation_types: { code: string } | { code: string }[] | null;
      }
    | null;
};

function toDomain(r: JoinedRow): AssetAllocation {
  const av = r.allocation_values;
  const at = Array.isArray(av?.allocation_types)
    ? av?.allocation_types[0]
    : av?.allocation_types;
  return {
    id: r.id,
    assetId: r.asset_id,
    allocationType: ((at?.code as AllocationType) ?? "custom") as AllocationType,
    allocationName: av?.value ?? "—",
    percentage: Number(r.percentage ?? 0),
  };
}

export async function listAllocationsForAssets(
  assetIds: string[],
): Promise<AssetAllocation[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await supabase
    .from("asset_allocations")
    .select(SELECT)
    .in("asset_id", assetIds);
  if (error) throw error;
  return ((data ?? []) as unknown as JoinedRow[]).map(toDomain);
}

export interface AllocationWriteInput {
  assetId: string;
  allocationValueId: string;
  percentage: number;
}

export async function createAllocation(
  input: AllocationWriteInput,
): Promise<AssetAllocation> {
  const { data, error } = await supabase
    .from("asset_allocations")
    .insert({
      asset_id: input.assetId,
      allocation_value_id: input.allocationValueId,
      percentage: input.percentage,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return toDomain(data as unknown as JoinedRow);
}

export async function deleteAllocation(id: string): Promise<void> {
  const { error } = await supabase.from("asset_allocations").delete().eq("id", id);
  if (error) throw error;
}
