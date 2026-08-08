/**
 * IvestWise :: Performance ao nível da Carteira (serviço puro)
 *
 * Sem I/O. Agrega, na moeda base da carteira, o plano `reported` devolvido por
 * `assetPerformance()` para cada ativo. Nunca agrega o plano nativo e nunca
 * faz média de percentagens: a rentabilidade da carteira é sempre recalculada
 * como ganho total agregado / capital aplicado bruto agregado.
 */

import type { AssetType, AssetValuation, ISODate, Transaction } from "@/domain/types";
import { assetPerformance, type AssetPerformance } from "@/services/performance";
import type { FxRateTable } from "@/services/fx";

export interface PortfolioAssetInput {
  assetId: string;
  assetType: AssetType;
  nativeCurrency: string;
  transactions: Transaction[];
  valuations: AssetValuation[];
  unitBased?: boolean;
}

export interface PortfolioPerformanceInput {
  baseCurrency: string;
  assets: PortfolioAssetInput[];
  fxTable?: FxRateTable;
  asOf?: ISODate;
}

export interface PortfolioPerformance {
  currency: string;
  investedCapital: number;
  grossContributions: number;
  /** Soma apenas dos ativos com valor observável; `null` se nenhum tiver. */
  currentValue: number | null;
  realizedGain: number;
  unrealizedGain: number | null;
  income: number;
  autonomousCosts: number;
  capitalGain: number | null;
  totalGain: number | null;
  /** totalGain / grossContributions; `null` sem capital aplicado. */
  returnPct: number | null;
  assetCount: number;
  /** Ativos com pelo menos uma transação. */
  assetsWithTransactions: number;
  /** Ativos excluídos do valor atual (sem valorização ou sem taxa FX). */
  assetsMissingValue: number;
  /** Ativos sem valorização observada. */
  assetsWithoutValuation: number;
  missingCurrencies: string[];
  usedCarryForward: boolean;
  usedSettlement: boolean;
  inconsistentTransactionIds: string[];
  /** Resultado por ativo, para detalhe opcional na UI. */
  perAsset: { assetId: string; performance: AssetPerformance }[];
}

function emptyResult(currency: string): PortfolioPerformance {
  return {
    currency,
    investedCapital: 0,
    grossContributions: 0,
    currentValue: null,
    realizedGain: 0,
    unrealizedGain: null,
    income: 0,
    autonomousCosts: 0,
    capitalGain: null,
    totalGain: null,
    returnPct: null,
    assetCount: 0,
    assetsWithTransactions: 0,
    assetsMissingValue: 0,
    assetsWithoutValuation: 0,
    missingCurrencies: [],
    usedCarryForward: false,
    usedSettlement: false,
    inconsistentTransactionIds: [],
    perAsset: [],
  };
}

export function portfolioPerformance(input: PortfolioPerformanceInput): PortfolioPerformance {
  const currency = (input.baseCurrency || "").toUpperCase();
  const assets = input.assets ?? [];
  if (assets.length === 0) return emptyResult(currency);

  const out = emptyResult(currency);
  out.assetCount = assets.length;

  const missing = new Set<string>();
  let anyCurrentValue = false;
  let anyUnrealized = false;
  let unrealizedSum = 0;

  for (const a of assets) {
    const perf = assetPerformance({
      assetType: a.assetType,
      transactions: a.transactions,
      valuations: a.valuations,
      nativeCurrency: a.nativeCurrency,
      reportingCurrency: currency,
      fxTable: input.fxTable,
      asOf: input.asOf,
      unitBased: a.unitBased,
    });
    out.perAsset.push({ assetId: a.assetId, performance: perf });

    if (a.transactions.length > 0) out.assetsWithTransactions += 1;

    const r = perf.reported;
    out.investedCapital += r.investedCapital;
    out.grossContributions += r.grossContributions;
    out.realizedGain += r.realizedGain;
    out.income += r.income;
    out.autonomousCosts += r.autonomousCosts;

    if (r.currentValue != null) {
      out.currentValue = (out.currentValue ?? 0) + r.currentValue;
      anyCurrentValue = true;
    } else if (a.transactions.length > 0) {
      out.assetsMissingValue += 1;
    }

    if (r.unrealizedGain != null) {
      unrealizedSum += r.unrealizedGain;
      anyUnrealized = true;
    } else if (a.transactions.length > 0) {
      out.assetsWithoutValuation += 1;
    }

    if (perf.valueSource !== "valuation" && a.transactions.length > 0) {
      // já contabilizado acima quando unrealizedGain é null
    }

    for (const c of perf.missingCurrencies) missing.add(c);
    out.usedCarryForward = out.usedCarryForward || perf.usedCarryForward;
    out.usedSettlement = out.usedSettlement || perf.usedSettlement;
    out.inconsistentTransactionIds.push(...perf.inconsistentTransactionIds);
  }

  if (!anyCurrentValue) out.currentValue = null;
  out.unrealizedGain = anyUnrealized ? unrealizedSum : null;
  out.capitalGain = out.unrealizedGain == null ? null : out.realizedGain + out.unrealizedGain;
  out.totalGain =
    out.capitalGain == null ? null : out.capitalGain + out.income - out.autonomousCosts;
  out.returnPct =
    out.totalGain == null || out.grossContributions <= 0
      ? null
      : out.totalGain / out.grossContributions;
  out.missingCurrencies = [...missing].sort();

  return out;
}
