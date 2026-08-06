/**
 * IvestWise :: Performance ao nível do Asset (serviço puro)
 *
 * Sem I/O. Este módulo NÃO reconstrói posições nem valorizações: combina os
 * motores existentes (Position Engine, Valuation Engine, camada de reporting).
 *
 * Dois planos, nunca misturados:
 *  - nativo    → moeda do ativo, informação complementar.
 *  - reporting → moeda da carteira, plano principal de apresentação.
 *
 * O plano de reporting é obtido projetando cada transação à taxa da SUA data
 * (liquidação declarada → montante introduzido → BCE com carry-forward) e
 * correndo o mesmo algoritmo cronológico sobre os valores convertidos.
 * Nunca se converte um total nativo com a taxa de hoje.
 *
 * Fora de âmbito nesta fase: XIRR, TWR e MWR.
 */

import type { AssetType, AssetValuation, ISODate, Transaction } from "@/domain/types";
import { TRANSACTION_PROFILES } from "@/domain/transaction-profiles";
import { buildPosition, positionAt, type Position } from "@/services/position-engine";
import {
  latestValuation,
  resolveValuationValue,
  todayISODate,
  type QuantityAt,
} from "@/services/valuation-metrics";
import { projectTransactions, reportCurrentValue } from "@/services/reporting";
import { EMPTY_RATE_TABLE, type FxRateTable } from "@/services/fx";

/** Agregados de fluxo que não passam pelo custo da posição. */
interface FlowTotals {
  /** Capital aplicado bruto: subscrições (montante + comissões + impostos). */
  grossContributions: number;
  /** Rendimentos recebidos (dividendos, cupões, juros, rendas). */
  income: number;
  /** Custos autónomos (transações de tipo custo); comissões de compra/venda
   *  já estão dentro do custo da posição e não são contadas duas vezes. */
  autonomousCosts: number;
}

function flowTotals(transactions: Transaction[]): FlowTotals {
  let grossContributions = 0;
  let income = 0;
  let autonomousCosts = 0;
  for (const t of transactions) {
    const amount = Number(t.amount) || 0;
    const costs = (Number(t.fees) || 0) + (Number(t.taxes) || 0);
    switch (TRANSACTION_PROFILES[t.type]?.direction) {
      case "in":
        grossContributions += amount + costs;
        break;
      case "income":
        income += amount;
        break;
      case "cost":
        autonomousCosts += amount + costs;
        break;
      default:
        break;
    }
  }
  return { grossContributions, income, autonomousCosts };
}

export type CurrentValueSourceKind = "valuation" | "cost" | "none";

/** Conjunto completo de métricas numa moeda. */
export interface PerformancePlane {
  currency: string;
  /** Capital ainda colocado no ativo, ao custo de aquisição. */
  investedCapital: number;
  /** Capital que passou pelo ativo (denominador da rentabilidade). */
  grossContributions: number;
  /** Valor da posição; `null` quando falta taxa no plano de reporting. */
  currentValue: number | null;
  realizedGain: number;
  /** `null` quando não há valorização observada (o valor cai no custo). */
  unrealizedGain: number | null;
  income: number;
  autonomousCosts: number;
  /** Realizadas + não realizadas. */
  capitalGain: number | null;
  /** Ganho de capital + rendimentos − custos autónomos. */
  totalGain: number | null;
  /** Fração (0,173 = 17,3 %); `null` sem capital aplicado. */
  returnPct: number | null;
}

export interface AssetPerformance {
  /** Plano principal: moeda da carteira. Igual ao nativo quando coincidem. */
  reported: PerformancePlane;
  /** Plano complementar: moeda do ativo. */
  native: PerformancePlane;
  /** Quantidade detida (idêntica nos dois planos). */
  quantity: number;
  /** Origem do valor atual. */
  valueSource: CurrentValueSourceKind;
  /** Data da valorização usada, quando existe. */
  valueAsOf: ISODate | null;
  /** Verdadeiro quando as duas moedas diferem (apresentar nota nativa). */
  isMultiCurrency: boolean;
  /** Moedas sem taxa disponível: os totais de reporting ficam parciais. */
  missingCurrencies: string[];
  usedCarryForward: boolean;
  usedSettlement: boolean;
  /** Transações com dados incoerentes detetadas pelo Position Engine. */
  inconsistentTransactionIds: string[];
}

export interface AssetPerformanceInput {
  assetType: AssetType;
  transactions: Transaction[];
  valuations: AssetValuation[];
  nativeCurrency: string;
  reportingCurrency?: string | null;
  fxTable?: FxRateTable;
  /** Data de referência (por omissão, hoje). */
  asOf?: ISODate;
  unitBased?: boolean;
}

const ratio = (gain: number | null, base: number): number | null =>
  gain == null || base <= 0 ? null : gain / base;

function buildPlane(
  currency: string,
  position: Position,
  positionAtValuation: Position,
  flows: FlowTotals,
  currentValue: number | null,
  hasValuation: boolean,
): PerformancePlane {
  const unrealizedGain =
    hasValuation && currentValue != null ? currentValue - positionAtValuation.costBasis : null;
  const capitalGain = unrealizedGain == null ? null : position.realizedGain + unrealizedGain;
  const totalGain =
    capitalGain == null ? null : capitalGain + flows.income - flows.autonomousCosts;
  return {
    currency,
    investedCapital: position.costBasis,
    grossContributions: flows.grossContributions,
    currentValue,
    realizedGain: position.realizedGain,
    unrealizedGain,
    income: flows.income,
    autonomousCosts: flows.autonomousCosts,
    capitalGain,
    totalGain,
    returnPct: ratio(totalGain, flows.grossContributions),
  };
}

/**
 * Métricas de performance de um ativo, nos dois planos de moeda.
 */
export function assetPerformance(input: AssetPerformanceInput): AssetPerformance {
  const {
    assetType,
    transactions,
    valuations,
    nativeCurrency,
    fxTable = EMPTY_RATE_TABLE,
    asOf = todayISODate(),
    unitBased = false,
  } = input;

  const native = (nativeCurrency || "").toUpperCase();
  const reporting = (input.reportingCurrency || "").toUpperCase() || native;
  const isMultiCurrency = reporting !== native;

  const options = { unitBased } as const;
  const quantityAt: QuantityAt = (date) =>
    positionAt(assetType, transactions, date, options).quantity;

  // ---- Plano nativo -----------------------------------------------------
  const position = buildPosition(assetType, transactions, { ...options, asOf });
  const reference = latestValuation(valuations, asOf);
  const refDate = reference?.valuationDate ?? asOf;
  const refPosition = reference
    ? positionAt(assetType, transactions, refDate, options)
    : position;

  const nativeValue = reference
    ? resolveValuationValue(reference, quantityAt)
    : position.costBasis;
  const nativeFlows = flowTotals(
    transactions.filter((t) => t.occurredAt.slice(0, 10) <= asOf),
  );
  const nativePlane = buildPlane(
    native,
    position,
    refPosition,
    nativeFlows,
    nativeValue,
    !!reference,
  );

  // ---- Plano de reporting ----------------------------------------------
  let reportedPlane = { ...nativePlane, currency: reporting };
  let missingCurrencies: string[] = [];
  let usedCarryForward = false;
  let usedSettlement = false;

  if (isMultiCurrency) {
    const projected = projectTransactions(fxTable, transactions, reporting);
    missingCurrencies = projected.missingCurrencies;
    usedCarryForward = projected.usedCarryForward;
    usedSettlement = projected.usedSettlement;

    const inWindow = projected.transactions.filter(
      (t) => t.occurredAt.slice(0, 10) <= asOf,
    );
    const reportedPos = buildPosition(assetType, projected.transactions, { ...options, asOf });
    const reportedRefPos = reference
      ? buildPosition(assetType, projected.transactions, { ...options, asOf: refDate })
      : reportedPos;

    // Valor atual: excepção deliberada — taxa MAIS RECENTE disponível.
    const converted = reportCurrentValue(
      fxTable,
      { amount: nativeValue, currency: reference?.currency || native },
      reporting,
    );
    const reportedValue = converted.reported?.amount ?? null;

    reportedPlane = buildPlane(
      reporting,
      reportedPos,
      reportedRefPos,
      flowTotals(inWindow),
      reportedValue,
      !!reference,
    );
  }

  return {
    reported: reportedPlane,
    native: nativePlane,
    quantity: position.quantity,
    valueSource: reference ? "valuation" : position.costBasis > 0 ? "cost" : "none",
    valueAsOf: reference?.valuationDate ?? null,
    isMultiCurrency,
    missingCurrencies,
    usedCarryForward,
    usedSettlement,
    inconsistentTransactionIds: position.inconsistentTransactionIds,
  };
}
