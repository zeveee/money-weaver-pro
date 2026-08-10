/**
 * IvestWise :: Performance ao nível da Carteira (serviço puro)
 *
 * Sem I/O. Agrega, na moeda base da carteira, o plano `reported` devolvido por
 * `assetPerformance()` para cada ativo. Nunca agrega o plano nativo e nunca
 * faz média de percentagens: a rentabilidade da carteira é sempre recalculada
 * como ganho total agregado / capital aplicado bruto agregado.
 */

import type { AssetType, AssetValuation, ISODate, Transaction } from "@/domain/types";
import { assetPerformance, type AssetPerformance, type FxEffect } from "@/services/performance";
import { assetXirr, xirr as solveXirr, type CashFlow } from "@/services/xirr";
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
  /** Rentabilidade anualizada da carteira, sobre os fluxos de caixa
   *  COMBINADOS de todos os ativos — nunca uma agregação dos XIRR
   *  individuais (isso não é matematicamente válido). `null` quando
   *  incompleto: algum ativo tem posição aberta sem valorização (não é
   *  seguro combinar fluxos parciais com um valor terminal em falta). */
  xirr: number | null;
  /** Ativos excluídos do XIRR da carteira por posição aberta sem
   *  valorização — quando > 0, `xirr` é sempre `null`. */
  assetsExcludedFromXirr: number;
  /** Soma do efeito cambial de todos os ativos multi-moeda (já todos na
   *  moeda base da carteira — ao contrário do XIRR, isto É somável).
   *  `null` quando nenhum ativo é multi-moeda com efeito calculável. */
  fxEffect: FxEffect | null;
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
    xirr: null,
    assetsExcludedFromXirr: 0,
    fxEffect: null,
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

  const allCashFlows: CashFlow[] = [];
  let xirrIncomplete = false;

  let fxRealizedSum = 0;
  let fxUnrealizedSum = 0;
  let anyFxEffect = false;
  let anyFxUnrealized = false;

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

    if (perf.fxEffect) {
      fxRealizedSum += perf.fxEffect.realized;
      anyFxEffect = true;
      if (perf.fxEffect.unrealized != null) {
        fxUnrealizedSum += perf.fxEffect.unrealized;
        anyFxUnrealized = true;
      }
    }

    for (const c of perf.missingCurrencies) missing.add(c);
    out.usedCarryForward = out.usedCarryForward || perf.usedCarryForward;
    out.usedSettlement = out.usedSettlement || perf.usedSettlement;
    out.inconsistentTransactionIds.push(...perf.inconsistentTransactionIds);

    // XIRR da carteira precisa dos fluxos do próprio ativo, não do xirr()
    // já resumido em perf.xirr — nunca se agrega XIRR agregando XIRR.
    if (a.transactions.length > 0) {
      const assetFlows = assetXirr({
        assetType: a.assetType,
        transactions: a.transactions,
        valuations: a.valuations,
        nativeCurrency: a.nativeCurrency,
        reportingCurrency: currency,
        fxTable: input.fxTable,
        asOf: input.asOf,
        unitBased: a.unitBased,
      });
      allCashFlows.push(...assetFlows.cashFlows);
      if (!assetFlows.hasTerminalValue) {
        xirrIncomplete = true;
        out.assetsExcludedFromXirr += 1;
      }
    }
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
  out.xirr = xirrIncomplete ? null : solveXirr(allCashFlows);
  out.fxEffect = anyFxEffect
    ? {
        realized: fxRealizedSum,
        unrealized: anyFxUnrealized ? fxUnrealizedSum : null,
        total: anyFxUnrealized ? fxRealizedSum + fxUnrealizedSum : null,
      }
    : null;

  return out;
}
