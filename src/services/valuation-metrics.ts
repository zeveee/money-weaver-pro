/**
 * IvestWise :: Métricas de valorização (serviço puro)
 *
 * Sem I/O. Uma Valuation é um facto observado de valor numa data.
 * O Valor Atual do ativo é sempre a valorização mais recente até à data de
 * referência; na ausência de valorizações, cai para o custo da posição
 * derivada das transações (nunca para `assets.current_value`, que é cache).
 */

import type { AssetValuation, ISODate } from "@/domain/types";

export const todayISODate = (): ISODate => new Date().toISOString().slice(0, 10);

/** Valorização mais recente com data <= `asOf`. */
export function latestValuation(
  valuations: AssetValuation[],
  asOf: ISODate = todayISODate(),
): AssetValuation | null {
  const eligible = valuations
    .filter((v) => v.valuationDate <= asOf)
    .sort((a, b) => (a.valuationDate < b.valuationDate ? 1 : -1));
  return eligible[0] ?? null;
}

/**
 * Valorização mais recente REGISTADA, mesmo com data futura.
 * É a referência apresentada na UI (badge "Atual" e resumo), para que a
 * tabela e os cartões nunca divirjam.
 */
export function referenceValuation(valuations: AssetValuation[]): AssetValuation | null {
  const sorted = [...valuations].sort((a, b) => (a.valuationDate < b.valuationDate ? 1 : -1));
  return sorted[0] ?? null;
}

export type CurrentValueSource = "valuation" | "cost" | "none";

export interface CurrentValue {
  /** Valor na moeda indicada (sem conversão cambial nesta fase). */
  value: number;
  currency: string;
  source: CurrentValueSource;
  /** Data da valorização usada, quando `source === "valuation"`. */
  asOf: ISODate | null;
}

/**
 * Valor Atual do ativo.
 * @param costBasis custo da posição derivada das transações (fallback).
 */
export function currentValue(
  valuations: AssetValuation[],
  costBasis: number,
  assetCurrency: string,
  asOf: ISODate = todayISODate(),
): CurrentValue {
  const latest = latestValuation(valuations, asOf);
  if (latest) {
    return {
      value: latest.totalValue,
      currency: latest.currency || assetCurrency,
      source: "valuation",
      asOf: latest.valuationDate,
    };
  }
  return {
    value: costBasis,
    currency: assetCurrency,
    source: costBasis > 0 ? "cost" : "none",
    asOf: null,
  };
}

/**
 * Valor de referência do ativo: valorização mais recente registada (mesmo
 * futura) ou, na ausência de valorizações, o custo da posição atual.
 */
export function referenceValue(
  valuations: AssetValuation[],
  costBasis: number,
  assetCurrency: string,
): CurrentValue {
  const ref = referenceValuation(valuations);
  if (ref) {
    return {
      value: ref.totalValue,
      currency: ref.currency || assetCurrency,
      source: "valuation",
      asOf: ref.valuationDate,
    };
  }
  return {
    value: costBasis,
    currency: assetCurrency,
    source: costBasis > 0 ? "cost" : "none",
    asOf: null,
  };
}

/**
 * Mais-valia não realizada preliminar (valor de mercado − custo da posição).
 * `costBasisAtValuationDate` TEM de ser o custo da posição reconstruída à data
 * da valorização usada, nunca o custo atual.
 * O cálculo definitivo pertence ao futuro Financial Engine.
 */
export function unrealizedGain(
  current: CurrentValue,
  costBasisAtValuationDate: number,
): number | null {
  if (current.source !== "valuation") return null;
  return current.value - costBasisAtValuationDate;
}
