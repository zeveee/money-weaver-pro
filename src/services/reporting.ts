/**
 * IvestWise :: Camada de reporting multi-moeda (serviço puro)
 *
 * Sem I/O. Converte factos (transações e valorizações) para a moeda de
 * reporting da carteira, SEMPRE evento a evento e à data do evento.
 *
 * Regra de ouro: converter no evento, nunca no total. Somar em moeda nativa
 * e converter o somatório com a taxa de hoje daria resultados errados e
 * impediria a decomposição do efeito cambial.
 *
 * O plano nativo (Position Engine, custo médio, quantidade, NAV) permanece
 * intocado: este módulo é uma camada paralela, não uma substituição.
 */

import type { AssetType, AssetValuation, ISODate, Transaction } from "@/domain/types";
import { buildPosition, type Position, type PositionOptions } from "@/services/position-engine";
import { TRANSACTION_PROFILES } from "@/domain/transaction-profiles";
import {
  convert,
  rateAt,
  toRateDate,
  type FxRate,
  type FxRateTable,
  type Money,
} from "@/services/fx";
import { resolveValuationValue, type QuantityAt } from "@/services/valuation-metrics";
import { effectiveRate, grossNative, readSettlement } from "@/services/settlement";
import { entryReportedGross } from "@/services/transaction-entry";

/** Origem da taxa aplicada: referência do BCE ou liquidação efetiva da corretora. */
export type ReportedRateSource = "ecb" | "settlement";

/** Valor com o seu par nativo/reporting e a taxa aplicada — base da análise cambial. */
export interface ReportedAmount {
  native: Money;
  reported: Money | null;
  rate: FxRate | null;
  date: ISODate;
  source: ReportedRateSource;
}

const report = (
  table: FxRateTable,
  native: Money,
  to: string,
  date: ISODate,
): ReportedAmount => {
  const c = convert(table, native, to, date);
  return c.status === "ok"
    ? { native, reported: c.money, rate: c.rate, date, source: "ecb" }
    : { native, reported: null, rate: null, date, source: "ecb" };
};

/**
 * Converte uma transação à taxa da SUA data (nunca à taxa de hoje).
 * Quando existe montante liquidado na moeda de reporting, esse valor prevalece
 * sobre a taxa BCE e a taxa efetiva é derivada dele.
 */
export function reportTransaction(
  table: FxRateTable,
  transaction: Transaction,
  reportingCurrency: string,
): ReportedAmount {
  const date = toRateDate(transaction.occurredAt);
  const gross = grossNative(transaction);
  const native = { amount: gross, currency: transaction.currency };
  const to = (reportingCurrency || "").toUpperCase();

  // Prioridade: liquidação declarada → montante introduzido na moeda da
  // carteira → taxa BCE à data. Nunca reconverter o que já veio na moeda certa.
  const declared = readSettlement(transaction.metadata, to);
  const settlement =
    declared ??
    (() => {
      const amountInReporting = entryReportedGross(transaction.metadata, to);
      return amountInReporting == null ? null : { amount: amountInReporting, currency: to };
    })();
  if (settlement) {
    const rate = effectiveRate(settlement.amount, gross);
    if (rate != null) {
      return {
        native,
        reported: { amount: settlement.amount, currency: to },
        rate: { rate, rateDate: date, path: "direct", carriedForward: false },
        date,
        source: "settlement",
      };
    }
  }

  return report(table, native, reportingCurrency, date);
}

/** Converte uma valorização à taxa da SUA data. */
export function reportValuation(
  table: FxRateTable,
  valuation: AssetValuation,
  reportingCurrency: string,
  quantityAt?: QuantityAt,
): ReportedAmount {
  const native = {
    amount: resolveValuationValue(valuation, quantityAt),
    currency: valuation.currency,
  };
  return report(table, native, reportingCurrency, valuation.valuationDate);
}

/**
 * Valor atual em moeda de reporting.
 * Excepção deliberada: usa a taxa MAIS RECENTE disponível (é uma foto de
 * "quanto vale agora"), enquanto o histórico usa sempre a taxa da data.
 */
export function reportCurrentValue(
  table: FxRateTable,
  native: Money,
  reportingCurrency: string,
): ReportedAmount {
  const c = convert(table, native, reportingCurrency, null);
  const date = c.status === "ok" ? c.rate.rateDate : toRateDate(new Date().toISOString());
  return c.status === "ok"
    ? { native, reported: c.money, rate: c.rate, date, source: "ecb" }
    : { native, reported: null, rate: null, date, source: "ecb" };
}

export interface ReportedTotals {
  currency: string;
  /** Entradas de capital convertidas evento a evento. */
  inflows: number;
  outflows: number;
  income: number;
  costs: number;
  /** Capital investido líquido em moeda de reporting. */
  investedCapital: number;
  /** Moedas para as quais faltou taxa; os totais são parciais quando não vazio. */
  missingCurrencies: string[];
  /** Verdadeiro quando alguma conversão usou carry-forward da última taxa conhecida. */
  usedCarryForward: boolean;
  /** Verdadeiro quando alguma transação usou o montante liquidado pela corretora. */
  usedSettlement: boolean;
}

/**
 * Totais de transações já convertidos para a moeda de reporting.
 * Espelha `transactionTotals` (moeda nativa) sem o substituir.
 *
 * Prioridade por evento: montante liquidado (taxa efetiva) → taxa BCE à data.
 */
export function reportedTransactionTotals(
  table: FxRateTable,
  transactions: Transaction[],
  reportingCurrency: string,
): ReportedTotals {
  let inflows = 0;
  let outflows = 0;
  let income = 0;
  let costs = 0;
  let usedCarryForward = false;
  let usedSettlement = false;
  const missing = new Set<string>();
  const to = (reportingCurrency || "").toUpperCase();

  for (const t of transactions) {
    const date = toRateDate(t.occurredAt);
    const declared = readSettlement(t.metadata, to);
    const settledAmount = declared?.amount ?? entryReportedGross(t.metadata, to);
    const settled =
      settledAmount == null ? null : effectiveRate(settledAmount, grossNative(t));

    let fx: number;
    if (settled != null) {
      fx = settled;
      usedSettlement = true;
    } else {
      const resolution = rateAt(table, t.currency, to, date);
      if (resolution.status === "missing") {
        missing.add((t.currency || "").toUpperCase());
        continue;
      }
      if (resolution.carriedForward) usedCarryForward = true;
      fx = resolution.rate;
    }

    const amount = (Number(t.amount) || 0) * fx;
    costs += ((Number(t.fees) || 0) + (Number(t.taxes) || 0)) * fx;

    switch (TRANSACTION_PROFILES[t.type]?.direction) {
      case "in":
        inflows += amount;
        break;
      case "out":
        outflows += amount;
        break;
      case "income":
        income += amount;
        break;
      case "cost":
        costs += amount;
        break;
      default:
        break;
    }
  }

  return {
    currency: to,
    inflows,
    outflows,
    income,
    costs,
    investedCapital: Math.max(0, inflows - outflows),
    missingCurrencies: [...missing].sort(),
    usedCarryForward,
    usedSettlement,
  };
}

/**
 * Decomposição do ganho entre performance do ativo e efeito cambial.
 *
 *   ganho(reporting) = ganho do ativo × taxa base + efeito cambial + termo cruzado
 *
 * `baseRate` é a taxa à data de entrada (custo); `currentRate` a taxa da
 * avaliação. Permite responder a "subiu em USD mas perdi em EUR?".
 */
export interface FxAttribution {
  /** Ganho em moeda nativa, convertido à taxa de entrada. */
  assetEffect: number;
  /** Efeito da variação cambial sobre o capital investido. */
  currencyEffect: number;
  /** Interação entre valorização do ativo e variação cambial. */
  crossEffect: number;
  /** Soma dos três — igual ao ganho medido em moeda de reporting. */
  total: number;
}

export function attributeFxPerformance(
  costNative: number,
  valueNative: number,
  baseRate: number,
  currentRate: number,
): FxAttribution {
  const assetGain = valueNative - costNative;
  const rateDelta = currentRate - baseRate;
  const assetEffect = assetGain * baseRate;
  const currencyEffect = costNative * rateDelta;
  const crossEffect = assetGain * rateDelta;
  return {
    assetEffect,
    currencyEffect,
    crossEffect,
    total: assetEffect + currencyEffect + crossEffect,
  };
}

// ---------- Projeção de transações para a moeda de reporting ----------

/** Taxa aplicável a uma transação: liquidação/introdução declarada → BCE à data. */
function transactionRate(
  table: FxRateTable,
  t: Transaction,
  to: string,
): { rate: number; source: ReportedRateSource; carriedForward: boolean } | null {
  const declared = readSettlement(t.metadata, to);
  const settledAmount = declared?.amount ?? entryReportedGross(t.metadata, to);
  const settled = settledAmount == null ? null : effectiveRate(settledAmount, grossNative(t));
  if (settled != null) return { rate: settled, source: "settlement", carriedForward: false };

  const resolution = rateAt(table, t.currency, to, toRateDate(t.occurredAt));
  if (resolution.status === "missing") return null;
  return { rate: resolution.rate, source: "ecb", carriedForward: resolution.carriedForward };
}

export interface ProjectedTransactions {
  /** Moeda de reporting das transações projetadas. */
  currency: string;
  /** Transações com montante, comissões e impostos já convertidos à taxa do seu evento. */
  transactions: Transaction[];
  /** Moedas sem taxa disponível; as transações afetadas foram excluídas. */
  missingCurrencies: string[];
  usedCarryForward: boolean;
  usedSettlement: boolean;
}

/**
 * Projeta cada transação para a moeda de reporting à taxa da SUA data.
 * A quantidade e o tipo são preservados, pelo que o Position Engine pode
 * correr sobre o resultado e produzir custo médio, custo da posição e
 * mais-valias realizadas já em moeda de reporting.
 */
export function projectTransactions(
  table: FxRateTable,
  transactions: Transaction[],
  reportingCurrency: string,
): ProjectedTransactions {
  const to = (reportingCurrency || "").toUpperCase();
  const out: Transaction[] = [];
  const missing = new Set<string>();
  let usedCarryForward = false;
  let usedSettlement = false;

  for (const t of transactions) {
    const resolved = transactionRate(table, t, to);
    if (!resolved) {
      missing.add((t.currency || "").toUpperCase());
      continue;
    }
    if (resolved.source === "settlement") usedSettlement = true;
    if (resolved.carriedForward) usedCarryForward = true;

    const fx = resolved.rate;
    const quantity = Number(t.quantity) || 0;
    const amount = (Number(t.amount) || 0) * fx;
    out.push({
      ...t,
      amount,
      fees: (Number(t.fees) || 0) * fx,
      taxes: (Number(t.taxes) || 0) * fx,
      unitPrice: quantity > 0 ? amount / quantity : (Number(t.unitPrice) || 0) * fx,
      currency: to,
    });
  }

  return {
    currency: to,
    transactions: out,
    missingCurrencies: [...missing].sort(),
    usedCarryForward,
    usedSettlement,
  };
}

/**
 * Posição reconstruída em moeda de reporting: o mesmo algoritmo cronológico do
 * Position Engine, aplicado a transações já convertidas evento a evento.
 * O plano nativo mantém-se intocado.
 */
export function reportedPosition(
  table: FxRateTable,
  assetType: AssetType,
  transactions: Transaction[],
  reportingCurrency: string,
  options: PositionOptions = {},
): ProjectedTransactions & { position: Position } {
  const projected = projectTransactions(table, transactions, reportingCurrency);
  return { ...projected, position: buildPosition(assetType, projected.transactions, options) };
}
