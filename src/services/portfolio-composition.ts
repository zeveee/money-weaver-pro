/**
 * IvestWise :: Composição da carteira por dimensão de classificação
 *
 * Serviço puro: sem I/O, sem arredondamentos (a formatação vive na UI).
 * "Não classificado" é sempre uma fatia normal — as percentagens de cada
 * dimensão somam 100% do valor TOTAL da carteira.
 */

import type { AllocationType, AssetAllocation } from "@/domain/types";

export const UNCLASSIFIED_LABEL = "Não classificado";

export interface CompositionSlice {
  allocationName: string;
  value: number;
  percentage: number;
  isUnclassified: boolean;
}

export type PortfolioComposition = Record<AllocationType, CompositionSlice[]>;

export interface PortfolioCompositionInput {
  currentValueByAsset: Record<string, number | null>;
  allocations: AssetAllocation[];
  dimensions: AllocationType[];
}

const clampPct = (p: number) => Math.min(100, Math.max(0, p));

export function portfolioComposition(
  input: PortfolioCompositionInput,
): PortfolioComposition {
  const { currentValueByAsset, allocations, dimensions } = input;

  const valued = Object.entries(currentValueByAsset).filter(
    (e): e is [string, number] => e[1] != null && Number.isFinite(e[1]),
  );
  const total = valued.reduce((s, [, v]) => s + v, 0);

  const result = {} as PortfolioComposition;

  for (const dimension of dimensions) {
    if (total === 0 || valued.length === 0) {
      result[dimension] = [];
      continue;
    }

    const byName = new Map<string, number>();
    let unclassified = 0;

    for (const [assetId, value] of valued) {
      const rows = allocations.filter(
        (a) => a.assetId === assetId && a.allocationType === dimension,
      );
      let sumPct = 0;
      for (const row of rows) {
        const pct = clampPct(Number(row.percentage) || 0);
        const remaining = clampPct(100 - sumPct);
        const effective = Math.min(pct, remaining);
        if (effective <= 0) continue;
        sumPct += effective;
        byName.set(
          row.allocationName,
          (byName.get(row.allocationName) ?? 0) + value * (effective / 100),
        );
      }
      const rest = value * (1 - clampPct(sumPct) / 100);
      if (rest !== 0) unclassified += rest;
    }

    const slices: CompositionSlice[] = [...byName.entries()]
      .filter(([, v]) => v !== 0)
      .map(([allocationName, value]) => ({
        allocationName,
        value,
        percentage: (value / total) * 100,
        isUnclassified: false,
      }))
      .sort((a, b) => b.value - a.value);

    if (unclassified !== 0) {
      slices.push({
        allocationName: UNCLASSIFIED_LABEL,
        value: unclassified,
        percentage: (unclassified / total) * 100,
        isUnclassified: true,
      });
    }

    result[dimension] = slices;
  }

  return result;
}
