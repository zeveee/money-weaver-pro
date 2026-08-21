/**
 * IvestWise :: Composição de um ativo a partir das suas holdings
 *
 * Serviço puro (sem I/O). Agrega os pesos das holdings por setor ou por país,
 * usando APENAS a classificação da security identificada no Security Master.
 * Tudo o resto — holding não identificada, security sem classificação na
 * fonte — cai em "Não classificado". Nunca inferimos.
 *
 * A base de 100% é o somatório dos pesos publicados pela fonte, para que a
 * distinção entre composição completa e parcial se mantenha visível a montante
 * (é a cobertura do snapshot que a descreve, não este serviço).
 */

import { UNCLASSIFIED_LABEL, type CompositionSlice } from "./portfolio-composition";

export type HoldingsDimension = "sector" | "geography";

export interface HoldingWeight {
  holdingKey: string;
  weightPercent: number | null;
}

export interface HoldingClassification {
  sector: string | null;
  country: string | null;
}

export interface HoldingsCompositionInput {
  holdings: HoldingWeight[];
  /** Classificação por `holdingKey` (ausente ⇒ não classificada). */
  classificationByHolding: Map<string, HoldingClassification>;
  dimension: HoldingsDimension;
}

export function holdingsComposition(input: HoldingsCompositionInput): CompositionSlice[] {
  const { holdings, classificationByHolding, dimension } = input;

  const weights = holdings.map((h) => ({
    key: h.holdingKey,
    weight: Number.isFinite(h.weightPercent ?? NaN) ? (h.weightPercent as number) : 0,
  }));
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return [];

  const byName = new Map<string, number>();
  let unclassified = 0;

  for (const { key, weight } of weights) {
    if (weight <= 0) continue;
    const c = classificationByHolding.get(key);
    const name = dimension === "sector" ? (c?.sector ?? null) : (c?.country ?? null);
    if (!name) {
      unclassified += weight;
      continue;
    }
    byName.set(name, (byName.get(name) ?? 0) + weight);
  }

  const slices: CompositionSlice[] = [...byName.entries()]
    .map(([allocationName, value]) => ({
      allocationName,
      value,
      percentage: (value / total) * 100,
      isUnclassified: false,
    }))
    .sort((a, b) => b.value - a.value);

  if (unclassified > 0) {
    slices.push({
      allocationName: UNCLASSIFIED_LABEL,
      value: unclassified,
      percentage: (unclassified / total) * 100,
      isUnclassified: true,
    });
  }

  return slices;
}
